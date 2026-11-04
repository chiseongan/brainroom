// Chrome 확장 E2E: 확장의 시험용 사본을 실제 Chrome에 올리고, 가짜 AI·검색 페이지 → BrainRoom 탭 도착까지 확인한다.
//   node tests/extension/run.mjs
// 사본은 manifest에 가짜 페이지 주소만 더한 것이고, 코드는 extension/ 그대로다.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serve = (root, port, host) => new Promise(r => {
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, host, () => r(s));
});

const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'brainroom-ext-'));
fs.readdirSync(path.join(ROOT, 'extension')).forEach(f => fs.copyFileSync(path.join(ROOT, 'extension', f), path.join(copy, f)));
const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
const FAKE = 'http://127.0.0.1:5180/fake/*';
manifest.content_scripts.forEach(c => { if (c.js.includes('capture.js') || c.js.includes('search.js')) c.matches.push(FAKE); });
fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(manifest, null, 2));
// 시험에서는 배포 주소 대신 이 PC의 BrainRoom으로 보낸다
const bg = path.join(copy, 'background.js');
fs.writeFileSync(bg, fs.readFileSync(bg, 'utf8').replace("{ appTarget: 'github' }", "{ appTarget: 'local' }"));

const app = await serve(ROOT, 5173, 'localhost');
const fake = await serve(HERE, 5180, '127.0.0.1');
let code = 0;
for (const script of (process.env.ONLY ? [process.env.ONLY] : ['capture.test.cjs', 'search.test.cjs'])) {
  console.log(`\n=== ${script}`);
  code = (await new Promise(r => spawn(process.execPath, [path.join(HERE, script), copy], { stdio: 'inherit' }).on('exit', r))) || code;
}
app.close();
fake.close();
process.exit(code);
