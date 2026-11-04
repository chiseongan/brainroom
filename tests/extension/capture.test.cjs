// 실제 Chrome에 확장(시험용 사본)을 올리고, 가짜 AI 페이지 → 담기 버튼 → BrainRoom 탭 도착까지 시험
// Chrome 137+ 정식판은 --load-extension을 막아서, 디버깅 파이프의 Extensions.loadUnpacked로 올린다.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const EXT = process.argv[2];
const profile = path.join(os.tmpdir(), 'ext-profile-' + Date.now());
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  `--user-data-dir=${profile}`, '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitEv = async (sid, expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(sid, expr) === true) return true; await sleep(200); } return false; };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

let id = 0, buf = '';
const pending = {}, events = [];
chrome.stdio[4].on('data', d => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } else events.push(m);
  }
});
const send = (method, params = {}, sessionId) => new Promise(res => {
  const i = ++id; pending[i] = res;
  chrome.stdio[3].write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
async function openTab(url) {
  const { result } = await send('Target.createTarget', { url });
  const att = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
  const sid = att.result.sessionId;
  await send('Runtime.enable', {}, sid);
  return { sid, targetId: result.targetId };
}
const ev = async (sid, expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  return r.result?.result?.value ?? (r.result?.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception?.description : undefined);
};

(async () => {
  await sleep(1500);
  const load = await send('Extensions.loadUnpacked', { path: EXT });
  ok(load.result?.id, `extension loaded (${load.result?.id || JSON.stringify(load.error)})`);
  await sleep(800);

  // BrainRoom: 로그인 없는 샘플 체험으로 방에 들어가 있기
  const app = await openTab('http://localhost:5173/');
  await waitEv(app.sid, "!!document.querySelector('#guestSampleBtn')");
  await ev(app.sid, "document.querySelector('#guestSampleBtn')?.click(); 'ok'");
  await waitEv(app.sid, "typeof extInstalled !== 'undefined' && extInstalled === true");
  ok(await ev(app.sid, 'extInstalled') === true, 'BrainRoom page detected the extension (bridge hello)');

  // 1) 가짜 ChatGPT: 버튼으로 대화 전체 담기
  const gpt = await openTab('http://127.0.0.1:5180/fake/chatgpt.html');
  await waitEv(gpt.sid, "!!document.querySelector('#brainroom-ext-host')?.shadowRoot.querySelector('button')");
  ok(await ev(gpt.sid, "!!document.querySelector('#brainroom-ext-host')?.shadowRoot.querySelector('button')"), 'capture button injected on AI page');
  await ev(gpt.sid, "document.querySelector('#brainroom-ext-host').shadowRoot.querySelector('button').click(); 'ok'");
  await waitEv(gpt.sid, "/메시지/.test(document.querySelector('#brainroom-ext-host').shadowRoot.querySelector('.toast')?.textContent || '')");
  await waitEv(app.sid, "!!document.querySelector('#modal:not([hidden]) .ai-row')");
  const toastText = await ev(gpt.sid, "document.querySelector('#brainroom-ext-host').shadowRoot.querySelector('.toast').textContent");
  ok(/4개 메시지/.test(toastText), `AI page toast: ${toastText}`);
  const rows = await ev(app.sid, "[...document.querySelectorAll('#modal:not([hidden]) .ai-row')].map(r => r.textContent.replace(/\\s+/g,' ').trim()).join(' || ')");
  ok(/다회용기 회수율 조사/.test(rows) && /ChatGPT/.test(rows) && /메시지 4개/.test(rows), `BrainRoom import modal shows conversation: ${rows.slice(0, 120)}`);
  // 골라서 저장
  await ev(app.sid, "document.querySelector('[data-ai-idx]').click(); document.querySelector('#aiVis').value='team'; document.querySelector('[data-tr=\"ai-go\"]').click(); 'ok'");
  await sleep(500);
  const saved = await ev(app.sid, "JSON.stringify(state.items.filter(i => i.type === 'ai' && i.ai.sourceId.startsWith('ext:')).map(i => ({ t: i.title, url: i.url, tool: i.ai.tool, purpose: i.ai.purpose, masked: !i.ai.transcript.includes('me@test.com'), msgs: (i.ai.transcript.match(/(^|\\n)(👤|🤖) /g) || []).length })))");
  console.log('    saved:', saved);
  const s = JSON.parse(saved || '[]');
  ok(s.length === 1 && s[0].url.includes('/fake/chatgpt.html') && s[0].masked && s[0].msgs === 4, 'saved with source URL, PII masked, 4 messages');

  // 2) 가짜 Claude: 겹친 요소 처리, 역할 구분
  const cl = await openTab('http://127.0.0.1:5180/fake/claude.html');
  await waitEv(cl.sid, "!!document.querySelector('#brainroom-ext-host')?.shadowRoot.querySelector('button')");
  await ev(cl.sid, "document.querySelector('#brainroom-ext-host').shadowRoot.querySelector('button').click(); 'ok'");
  await waitEv(app.sid, "/발표 대본 초안/.test(document.querySelector('#modal:not([hidden])')?.textContent || '')");
  const clRows = await ev(app.sid, "[...document.querySelectorAll('#modal:not([hidden]) .ai-row')].map(r => r.textContent.replace(/\\s+/g,' ').trim()).join(' || ')");
  ok(/발표 대본 초안/.test(clRows) && /Claude/.test(clRows) && /메시지 4개/.test(clRows), `Claude conversation arrives (nested message counted once): ${clRows.slice(0, 100)}`);
  await ev(app.sid, "closeModal(); 'ok'");

  // 3) 가짜 Gemini: 글 일부를 선택하고 담기 → 선택한 부분만
  const gm = await openTab('http://127.0.0.1:5180/fake/gemini.html');
  await waitEv(gm.sid, "!!document.querySelector('#brainroom-ext-host')?.shadowRoot.querySelector('button')");
  await ev(gm.sid, "const r = document.createRange(); r.selectNodeContents(document.querySelector('model-response p')); getSelection().removeAllRanges(); getSelection().addRange(r); document.querySelector('#brainroom-ext-host').shadowRoot.querySelector('button').click(); 'ok'");
  await waitEv(app.sid, "/선택한 부분/.test(document.querySelector('#modal:not([hidden])')?.textContent || '')");
  const gmRows = await ev(app.sid, "[...document.querySelectorAll('#modal:not([hidden]) .ai-row')].map(r => r.textContent.replace(/\\s+/g,' ').trim()).join(' || ')");
  ok(/선택한 부분/.test(gmRows) && /Gemini/.test(gmRows) && /How often/.test(gmRows), `Gemini selected part only: ${gmRows.slice(0, 100)}`);

  ok(!/me@test\.com/.test(rows), 'preview in import modal hides the email');
  ok(/Gemini 대화 \(선택한 부분\)/.test(gmRows), 'Gemini title falls back to "Gemini 대화"');

  // 5) BrainRoom 탭이 없을 때: 탭을 닫고 담으면 새 탭이 열리고 도착한다
  await send('Target.closeTarget', { targetId: app.targetId });
  await sleep(500);
  await ev(cl.sid, "getSelection().removeAllRanges(); document.querySelector('#brainroom-ext-host').shadowRoot.querySelector('button').click(); 'ok'");
  let newApp = null;
  for (let i = 0; i < 40 && !newApp; i++) {
    await sleep(300);
    const { result: { targetInfos } } = await send('Target.getTargets');
    newApp = targetInfos.find(t => t.type === 'page' && t.url.startsWith('http://localhost:5173'));
  }
  ok(!!newApp, 'no BrainRoom tab → extension opened one');
  if (newApp) {
    const att = await send('Target.attachToTarget', { targetId: newApp.targetId, flatten: true });
    const sid2 = att.result.sessionId;
    await send('Runtime.enable', {}, sid2);
    await waitEv(sid2, "!!document.querySelector('#guestSampleBtn')");
    await ev(sid2, "document.querySelector('#guestSampleBtn')?.click(); 'ok'");
    await waitEv(sid2, "!!document.querySelector('#modal:not([hidden]) .ai-row')");
    const rows2 = await ev(sid2, "[...document.querySelectorAll('#modal:not([hidden]) .ai-row')].map(r => r.textContent.replace(/\\s+/g,' ').trim()).join(' || ')");
    ok(/발표 대본 초안/.test(rows2), `queued conversation shown after entering a room in the new tab: ${String(rows2).slice(0, 80)}`);
  }
  const errs = events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  console.log(errs.length ? 'exceptions: ' + errs.slice(0, 3).join(' | ') : '(page exceptions 없음)');
  // Windows에서 chrome.kill()은 자식 프로세스를 남긴다
  if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  else chrome.kill();
  process.exit();
})();
