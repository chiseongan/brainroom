// E2E: 실제 앱 + 실제 Firestore SDK + 에뮬레이터(실제 규칙) + 실제 Chrome(가짜 마이크로 WebRTC까지).
//   cd tests && npm run e2e
// 정적 서버가 index.html을 그대로 내보내되 로그인 가짜(shim.js)만 끼워 넣는다.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5180, PROXY_PORT = 5190;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PROXY = `http://127.0.0.1:${PROXY_PORT}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  let body = null, file = null;
  if (url.pathname === '/app.html') {
    body = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace(/<script src="js\/firebase-config\.js[^"]*"><\/script>/, m => `<script src="/e2e/shim.js"></script>\n  ${m}`);
    if (url.searchParams.get('proxy')) body = body.replace(/<script src="js\/ai-config\.js[^"]*"><\/script>/, '<script src="/e2e/proxy-config.js"></script>');
    // 앱의 CSP는 그대로 두고 시험용 주소만 더한다 (실제 정책 아래에서 앱이 도는지 확인)
    body = body.replace(/connect-src /, 'connect-src http://127.0.0.1:* ws://127.0.0.1:* ');
    // 시험 장치가 앱 안의 함수를 부르는 데 eval을 쓴다. 인라인 스크립트·이벤트는 그대로 막힌다
    body = body.replace(/script-src 'self'/, "script-src 'self' 'unsafe-eval'");
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (url.pathname === '/e2e/proxy-config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    return res.end(`const PROXY_URL = '${PROXY}';`);
  }
  if (url.pathname === '/js/firebase-config.js') {
    body = fs.readFileSync(path.join(ROOT, 'js/firebase-config.js'), 'utf8').replaceAll('brainroom-777b0', 'demo-brainroom');
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  file = url.pathname.startsWith('/e2e/') ? path.join(ROOT, 'tests', url.pathname) : path.join(ROOT, url.pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

// 브라우저는 같은 주소로 연결을 6개까지만 연다. 앱 여러 벌이 에뮬레이터 하나를 쓰면 쓰기가 밀리므로
// 사람마다 전달 포트를 따로 준다 (실제 사용자는 각자 다른 컴퓨터라 해당 없음)
const forwarders = ['uA', 'uB', 'uC', 'uP', 'uX'].map((u, i) => net.createServer(sock => {
  const up = net.connect(8181, '127.0.0.1');
  sock.pipe(up).pipe(sock);
  sock.on('error', () => up.destroy());
  up.on('error', () => sock.destroy());
}).listen(8201 + i, '127.0.0.1'));

const proxy = spawn(process.execPath, [path.join(ROOT, 'worker/test/serve-local.mjs'), String(PROXY_PORT), ORIGIN], { stdio: 'ignore' });

const chromePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brainroom-e2e-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  // 탭 하나에 방 여러 개를 띄우므로 숨은 화면처럼 느려지지 않게
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let code = 1;
try {
  // 포트는 Chrome이 고르고 프로필 폴더에 적어 둔다 (이전 시험의 Chrome이 남아 있어도 충돌하지 않게)
  let targets;
  for (let i = 0; i < 80 && !targets; i++) {
    try {
      const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\s+/)[0];
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch { await sleep(250); }
  }
  if (!targets) throw new Error('Chrome을 띄우지 못했어요');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0;
  const pending = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url: `${ORIGIN}/e2e/host.html?proxy=${encodeURIComponent(PROXY)}${process.argv[2] ? `&only=${process.argv[2]}` : ''}` });
  let printed = 0, done = false;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (!done && Date.now() < deadline) {
    await sleep(1000);
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({ log: window.LOG || [], done: !!window.DONE })', returnByValue: true });
    const v = r?.result?.value ? JSON.parse(r.result.value) : { log: [], done: false };
    v.log.slice(printed).forEach(l => console.log(l));
    printed = v.log.length;
    done = v.done;
  }
  if (!done) console.log('FAIL 시간 초과 (시험이 끝나지 않았어요)');
  const final = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.LOG || [])', returnByValue: true });
  const log = JSON.parse(final.result.value);
  const fails = log.filter(l => l.startsWith('FAIL')).length + (done ? 0 : 1);
  const passes = log.filter(l => l.startsWith('PASS')).length;
  console.log(`\nE2E: ${passes}개 통과, ${fails}개 실패`);
  code = fails ? 1 : 0;
  ws.close();
} catch (e) {
  console.error(e);
} finally {
  // Windows에서 chrome.kill()은 자식 프로세스를 남긴다
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  else chrome.kill();
  proxy.kill();
  server.close();
  forwarders.forEach(f => f.close());
  process.exit(code);
}
