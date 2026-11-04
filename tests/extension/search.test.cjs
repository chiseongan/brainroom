// 확장 '탐색 기록' 시험: 꺼져 있으면 기록 안 함 → 켜면 표시·기록 → 고른 것만 BrainRoom에 → 검색 기록 저장 → 물품
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const EXT = process.argv[2];
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  `--user-data-dir=${path.join(os.tmpdir(), 'ext2-' + Date.now())}`, '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitEv = async (sid, expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(sid, expr) === true) return true; await sleep(200); } return false; };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
let id = 0, buf = '';
const pending = {};
chrome.stdio[4].on('data', d => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } }
});
const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; pending[i] = res; chrome.stdio[3].write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0'); });
async function openTab(url) {
  const { result } = await send('Target.createTarget', { url });
  const att = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
  await send('Runtime.enable', {}, att.result.sessionId);
  return { sid: att.result.sessionId, targetId: result.targetId };
}
const ev = async (sid, expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  return r.result?.result?.value ?? (r.result?.exceptionDetails ? 'EXC ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : undefined);
};
const msg = (sid, m) => ev(sid, `chrome.runtime.sendMessage(${JSON.stringify(m)})`);

(async () => {
  await sleep(1500);
  const load = await send('Extensions.loadUnpacked', { path: EXT });
  const extId = load.result?.id;
  ok(extId, `extension loaded (${extId || JSON.stringify(load.error)})`);
  await sleep(800);
  const app = await openTab('http://localhost:5173/');
  await waitEv(app.sid, "!!document.querySelector('#guestSampleBtn')");
  await ev(app.sid, "document.querySelector('#guestSampleBtn')?.click(); 'ok'");
  await waitEv(app.sid, "typeof state !== 'undefined' && !!state");
  const pop = await openTab(`chrome-extension://${extId}/popup.html`);
  await sleep(1000);

  // 1) 꺼져 있을 때: 표시 없음, 기록 없음
  await msg(pop.sid, { type: 'set-exploring', on: false });
  const g1 = await openTab('http://127.0.0.1:5180/fake/google.html?q=' + encodeURIComponent('캠퍼스 다회용기 예산'));
  await sleep(1200);
  ok(await ev(g1.sid, "!document.querySelector('#brainroom-search-indicator')"), 'exploring OFF: no indicator');
  await ev(g1.sid, "document.querySelector('#r1').click(); 'ok'");
  await sleep(600);
  ok((await msg(pop.sid, { type: 'search-list' })).log.length === 0, 'exploring OFF: nothing recorded');

  // 2) 켜면: 표시가 뜨고 검색어·누른 결과가 기록된다
  await msg(pop.sid, { type: 'set-exploring', on: true });
  await sleep(600);
  ok(await ev(g1.sid, "!!document.querySelector('#brainroom-search-indicator')"), 'exploring ON: "탐색 기록 중" indicator appears');
  await ev(g1.sid, "document.querySelector('#r1').click(); document.querySelector('#r2').click(); 'ok'");
  let log = [];
  for (let i = 0; i < 25; i++) { // 확장 백그라운드가 처리할 때까지 기다린다
    await sleep(200);
    ({ log } = await msg(pop.sid, { type: 'search-list' }));
    if (log[0]?.clicks.length === 2) break;
  }
  console.log('    log:', JSON.stringify(log.map(s => [s.query, s.clicks.map(c => c.title)])));
  ok(log.length === 1 && log[0].query === '캠퍼스 다회용기 예산' && log[0].clicks.length === 2, 'query and 2 clicked results recorded');
  ok(log[0].clicks[0].url === 'https://example.com/campus-reuse', 'real result URL recorded');
  // 같은 검색을 다시 해도 30분 안이면 한 줄로
  const g2 = await openTab('http://127.0.0.1:5180/fake/google.html?q=' + encodeURIComponent('캠퍼스 다회용기 예산'));
  await sleep(1200);
  ok((await msg(pop.sid, { type: 'search-list' })).log.length === 1, 'same query within 30 min merged');

  // 3) 고른 것만 BrainRoom으로 → 검색 담기 창 → 저장
  await msg(pop.sid, { type: 'search-send', ids: [log[0].id] });
  await sleep(2500);
  const rows = await ev(app.sid, "[...document.querySelectorAll('#modal:not([hidden]) .ai-row')].map(r => r.textContent.replace(/\\s+/g, ' ').trim()).join(' || ')");
  ok(/캠퍼스 다회용기 예산/.test(rows) && /누른 결과 2개/.test(rows), `BrainRoom shows search import modal: ${String(rows).slice(0, 90)}`);
  ok(await ev(app.sid, "document.querySelector('#searchVis').value") === 'me', 'default visibility is 나만');
  await ev(app.sid, "document.querySelector('[data-ext-search=\"save\"]').click(); 'ok'");
  await sleep(600);
  const saved = await ev(app.sid, "JSON.stringify(state.items.filter(i => i.type === 'search').map(i => ({ t: i.title, v: i.visibility, url: i.url, kw: i.keywords })))");
  console.log('    saved:', saved);
  const s = JSON.parse(saved || '[]');
  ok(s.length === 1 && s[0].v === 'me' && s[0].url === 'https://example.com/campus-reuse', 'saved as 검색 item (나만, first clicked URL)');
  const decor = await ev(app.sid, "go('room', state.meId); [...document.querySelectorAll('.room:not(.mini) [data-zone^=decor]')].map(e => e.dataset.zone.slice(6)).join(',')");
  ok(/recycle/.test(decor) && /piggy/.test(decor), `search keywords became room objects (${decor})`);
  ok((await msg(pop.sid, { type: 'search-list' })).log.length === 0, 'sent searches removed from extension log');
  // Windows에서 chrome.kill()은 자식 프로세스를 남긴다
  if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  else chrome.kill();
  process.exit();
})();
