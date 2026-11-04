// BrainRoom 프록시(worker/) 호출 — LLM 요약·분류, Figma 그림 키워드, OAuth 토큰 교환, 회의 중계 서버(TURN)
// 프록시가 없거나(PROXY_URL 비어 있음), 로그인 안 했거나, 끄기를 눌렀거나, 한도·오류가 나면 null을 돌려준다
// → 부르는 쪽은 null이면 지금까지처럼 규칙 기반으로 정리한다.

const AI_OFF_KEY = 'brainroom:ai-off';
let proxyConfigCache = null;
let proxyLimitNoticeAt = 0;

function aiSwitchOn() {
  try { return localStorage.getItem(AI_OFF_KEY) !== '1'; } catch (e) { return true; }
}

function setAiSwitch(on) {
  try { localStorage.setItem(AI_OFF_KEY, on ? '0' : '1'); } catch (e) { /* 무시 */ }
}

// 프록시를 쓸 수 있는 상태인지 (로그인 필수: 프록시가 Firebase 로그인 토큰으로 사용자를 확인한다)
function proxyReady() {
  return Boolean(PROXY_URL) && AUTH_ENABLED && Boolean(authUser) && !guestMode;
}

async function proxyConfig() {
  if (!PROXY_URL) return null;
  if (proxyConfigCache) return proxyConfigCache;
  try {
    const res = await fetch(`${PROXY_URL}/v1/config`);
    proxyConfigCache = res.ok ? await res.json() : { features: {} };
  } catch (e) {
    proxyConfigCache = { features: {}, offline: true };
  }
  return proxyConfigCache;
}

async function proxyCall(path, body, method = 'POST') {
  const idToken = await firebase.auth().currentUser.getIdToken();
  const res = await fetch(`${PROXY_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${idToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || `프록시 ${res.status}`), { status: res.status, code: data.error });
  return data;
}

async function aiFeature(name) {
  if (!proxyReady()) return false;
  const cfg = await proxyConfig();
  return Boolean(cfg?.features?.[name]);
}

function noteProxyFailure(e) {
  console.warn('AI 프록시를 쓰지 못해 규칙 기반으로 정리합니다', e);
  // 한도·예산은 알려 주되 자주 띄우지 않는다
  if (e.status === 429 && Date.now() - proxyLimitNoticeAt > 10 * 60 * 1000) {
    proxyLimitNoticeAt = Date.now();
    toast(`🤖 ${e.message} 당분간 규칙 기반으로 정리해요`);
  }
}

// kind: meeting | talk | ai | work | search → { summary, keywords, decisions, purpose } 또는 null
async function aiSummarize(kind, text) {
  if (!aiSwitchOn() || !(await aiFeature('summarize')) || !String(text || '').trim()) return null;
  try {
    return await proxyCall('/v1/summarize', { kind, text: maskPII(text) });
  } catch (e) {
    noteProxyFailure(e);
    return null;
  }
}

async function aiVision(imageUrls) {
  if (!aiSwitchOn() || !imageUrls?.length || !(await aiFeature('vision'))) return null;
  try {
    return (await proxyCall('/v1/vision', { images: imageUrls })).keywords || null;
  } catch (e) {
    noteProxyFailure(e);
    return null;
  }
}

// 회의 중계 서버: 직접 연결이 막힌 네트워크에서도 회의가 되게 (자격은 몇 시간짜리라 잠깐 보관)
let turnCache = null;
async function turnIceServers() {
  if (turnCache && Date.now() < turnCache.until) return turnCache.servers;
  if (!(await aiFeature('turn'))) return [];
  try {
    const res = await proxyCall('/v1/turn', null, 'GET');
    turnCache = { servers: res.iceServers || [], until: Date.now() + (res.ttl || 3600) * 1000 * 0.8 };
    return turnCache.servers;
  } catch (e) {
    console.warn('회의 중계 서버 자격을 받지 못했어요 (직접 연결만 시도)', e);
    return [];
  }
}

// AI가 만든 요약을 회의 요약 글로 (참석·발언 수 같은 사실은 규칙 기반 줄을 그대로 앞에 둔다)
function formatAiSummary(ai, headLines = []) {
  return [
    ...headLines,
    `핵심 키워드: ${ai.keywords.map(k => `#${k}`).join(' ') || '-'}`,
    '',
    `🤖 AI 요약`,
    ai.summary,
    ...(ai.decisions.length ? ['', '정한 것', ...ai.decisions.map(d => `- ${d}`)] : []),
  ].join('\n');
}

// AI 대화 기록을 AI로 다시 정리 (요약·사용 목적·키워드). 저장은 이미 끝난 뒤라 실패해도 그대로 둔다
async function enhanceAiItem(item) {
  const ai = await aiSummarize('ai', item.ai?.transcript || item.content);
  // 기다리는 동안 온라인 방의 실시간 갱신으로 기록 객체가 바뀌었을 수 있어 지금 것을 다시 찾는다
  const cur = ai && itemById(item.id);
  if (!cur?.ai) return;
  cur.content = `요약: ${ai.summary}`.slice(0, 2000);
  cur.ai = { ...cur.ai, purpose: ai.purpose, summaryBy: 'ai' };
  if (ai.keywords.length) cur.keywords = ai.keywords.slice(0, 6);
  saveState();
  render();
}
