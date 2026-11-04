// 시험용: 프록시 Worker를 Node에서 띄운다. Anthropic·Google 공개키·OAuth·TURN은 이 안의 가짜 서버가 대신한다.
//   node worker/test/serve-local.mjs [포트=5190] [허용 출처=http://127.0.0.1:5180]
// GET /test-token?uid=…  → 가짜 Firebase 로그인 토큰 (이 시험 서버에만 있는 경로)
import http from 'node:http';
import worker from '../src/index.js';

const PORT = Number(process.argv[2] || 5190);
const ORIGINS = process.argv[3] || 'http://127.0.0.1:5180';
const PROJECT = 'test-project';
const enc = s => Buffer.from(s).toString('base64url');
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
async function idToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const head = enc(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const body = enc(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid, iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}

// 가짜 Claude: 요청 종류를 보고 그럴듯한 구조화 답을 돌려준다
function fakeClaude(body) {
  const content = body.messages[0].content;
  const text = typeof content === 'string' ? content : '';
  const kind = text.match(/<record kind="(\w+)">/)?.[1] || 'vision';
  const out = kind === 'vision' ? { keywords: ['로그인', '결제'] }
    : kind === 'meeting' ? { summary: '다회용기 순환 서비스를 1차 주제로 정하고, 설문과 예산 정리를 나눠 맡았다.', keywords: ['다회용기', '설문', '예산'], decisions: ['1차 주제는 다회용기 순환 서비스'], purpose: 'etc' }
    : kind === 'talk' ? { summary: '설문 작성과 예산 정리를 맡겠다고 했다.', keywords: ['설문', '예산'], decisions: [], purpose: 'etc' }
    : kind === 'ai' ? { summary: '캠퍼스 다회용기 회수율 통계를 조사했다.', keywords: ['다회용기', '회수율', '통계'], decisions: [], purpose: 'research' }
    : { summary: '정리', keywords: ['정리'], decisions: [], purpose: 'etc' };
  return { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 800, output_tokens: 150 } };
}

const log = [];
const upstream = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const send = (code, b) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  log.push(req.url);
  if (req.url === '/jwks') return send(200, { keys: [jwk] });
  if (req.url === '/v1/messages') return send(200, fakeClaude(JSON.parse(raw)));
  if (req.url === '/notion-token' && JSON.parse(raw).grant_type === 'refresh_token') return send(200, { access_token: 'ntn_refreshed', refresh_token: 'nr_2', expires_in: 3600 });
  if (req.url === '/notion-token') return send(200, { access_token: 'ntn_oauth_secret', refresh_token: 'nr_1', expires_in: 3600, owner: { type: 'user', user: { id: 'notion-user-1', name: '안치성' } }, workspace_name: '호랑이양말' });
  if (req.url === '/turn') return send(201, { iceServers: { urls: ['turn:turn.example:3478?transport=udp'], username: 'u', credential: 'c' } });
  send(404, {});
});
await new Promise(r => upstream.listen(0, r));
const U = `http://127.0.0.1:${upstream.address().port}`;
const env = {
  FIREBASE_PROJECT_ID: PROJECT, JWKS_URL: `${U}/jwks`, ALLOWED_ORIGINS: ORIGINS,
  ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: U,
  NOTION_CLIENT_ID: 'nid', NOTION_CLIENT_SECRET: 'nsec', NOTION_TOKEN_URL: `${U}/notion-token`,
  TURN_KEY_ID: 'tk', TURN_KEY_API_TOKEN: 'tt', TURN_URL: `${U}/turn`,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/test-token') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end(await idToken(url.searchParams.get('uid') || 'u'));
  }
  if (url.pathname === '/test-log') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(log));
  }
  let raw = '';
  for await (const c of req) raw += c;
  const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : raw }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`proxy on ${PORT}`));
