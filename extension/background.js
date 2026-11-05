// 담은 대화를 잠시 보관했다가 열려 있는 BrainRoom 탭으로 넘긴다. (서버로는 보내지 않는다)
// BrainRoom이 받으면(bridge.js → 'delivered') 보관함에서 지운다.

const APP_URLS = {
  github: 'https://chiseongan.github.io/brainroom/',
  local: 'http://localhost:5173/',
};
const APP_PATTERNS = ['https://chiseongan.github.io/brainroom/*', 'http://localhost:5173/*'];
const AI_PATTERNS = ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*'];

const getQueue = async () => (await chrome.storage.local.get({ queue: [] })).queue;
const setQueue = queue => chrome.storage.local.set({ queue });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'brainroom-capture', title: '🧠 BrainRoom에 담기 (선택한 부분 또는 이 대화)',
    contexts: ['page', 'selection'], documentUrlPatterns: AI_PATTERNS,
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'brainroom-capture' || !tab?.id) return;
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'capture-now' }).catch(() => null);
  if (res?.conversation) enqueue(res.conversation);
});

const APP_URL_LIST = () => Object.values(APP_URLS);
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 저장소를 '읽고 → 고치고 → 저장'하는 작업은 한 줄로 세워 차례로 한다
// (결과를 빠르게 여러 개 누르면 동시에 저장하다 한쪽이 덮어써 사라지는 문제를 막는다)
let storageChain = Promise.resolve();
const serial = fn => (...args) => (storageChain = storageChain.then(() => fn(...args), () => fn(...args)));

const enqueue = serial(async conversation => {
  const queue = (await getQueue()).filter(q => q.conversation?.sourceId !== conversation.sourceId); // 같은 대화는 최신 것만
  queue.push({ id: newId(), kind: 'ai', conversation });
  await setQueue(queue.slice(-30));
  await updateBadge();
  await deliver();
});

// 보낼 것이 있으면 개수, 탐색 기록이 켜져 있으면 ON
async function updateBadge() {
  const n = (await getQueue()).length;
  const { exploring } = await chrome.storage.local.get({ exploring: false });
  await chrome.action.setBadgeText({ text: n ? String(n) : exploring ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: n ? '#4f46e5' : '#047857' });
}

// ---------- 검색 기록 (탐색 기록을 켠 동안만, 이 브라우저에만) ----------
const getSearchLog = async () => (await chrome.storage.local.get({ searchLog: [] })).searchLog;
const setSearchLog = log => chrome.storage.local.set({ searchLog: log.slice(-200) });

const exploringOn = async () => (await chrome.storage.local.get({ exploring: false })).exploring;

const noteSearch = serial(async ({ engine, query, url }) => {
  if (!await exploringOn()) return;
  const log = await getSearchLog();
  const recent = log.find(s => s.engine === engine && s.query === query && Date.now() - s.at < 30 * 60 * 1000);
  if (recent) recent.at = Date.now();
  else log.push({ id: newId(), engine, query, url, at: Date.now(), clicks: [] });
  await setSearchLog(log);
});

const noteClick = serial(async ({ engine, query, title, url }) => {
  if (!await exploringOn()) return;
  const log = await getSearchLog();
  let s = [...log].reverse().find(x => x.engine === engine && x.query === query);
  if (!s) { s = { id: newId(), engine, query, url: '', at: Date.now(), clicks: [] }; log.push(s); }
  if (!s.clicks.some(c => c.url === url)) s.clicks.push({ title, url, at: Date.now() });
  s.clicks = s.clicks.slice(-10);
  await setSearchLog(log);
});

const sendSearches = serial(async ids => {
  const log = await getSearchLog();
  const picked = log.filter(s => ids.includes(s.id));
  const queue = await getQueue();
  picked.forEach(s => queue.push({ id: newId(), kind: 'search', search: s }));
  await setQueue(queue.slice(-60));
  await setSearchLog(log.filter(s => !ids.includes(s.id))); // 보낸 것은 확장에서 지운다
  await updateBadge();
  await deliver();
  return picked.length;
});

async function appUrl() {
  const { appTarget } = await chrome.storage.local.get({ appTarget: 'github' });
  return APP_URLS[appTarget] || APP_URLS.github;
}

// BrainRoom 탭이 있으면 그 탭으로 보내고 앞으로 띄운다. 없으면 새로 연다(열리면 bridge.js가 가져간다).
async function deliver() {
  const queue = await getQueue();
  if (!queue.length) return;
  const preferred = await appUrl();
  const tabs = await chrome.tabs.query({ url: APP_PATTERNS });
  const tab = tabs.find(t => t.url.startsWith(preferred)) || tabs[0];
  if (!tab) {
    await chrome.tabs.create({ url: preferred });
    return;
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  await chrome.tabs.sendMessage(tab.id, { type: 'deliver', items: queue }).catch(() => {
    // 탭은 있지만 bridge가 아직 없음(확장 설치 전에 열린 탭) → 새로고침하면 bridge가 붙어서 가져간다
    chrome.tabs.reload(tab.id);
  });
}

// 메시지가 어디서 왔는지 본다: 확장 창의 명령은 확장 창에서만, 대기열을 받는 것은 BrainRoom 탭에서만
const fromPopup = sender => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
const fromApp = sender => sender.id === chrome.runtime.id && Boolean(sender.tab) && APP_URL_LIST().some(u => sender.url?.startsWith(u));
const fromContentScript = sender => sender.id === chrome.runtime.id && Boolean(sender.tab);
const MESSAGE_FROM = {
  capture: fromContentScript, 'search-query': fromContentScript, 'search-click': fromContentScript,
  'bridge-ready': fromApp, delivered: fromApp,
  status: fromPopup, 'open-app': fromPopup, clear: fromPopup, 'search-list': fromPopup, 'search-send': fromPopup, 'search-clear': fromPopup, 'set-exploring': fromPopup,
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!MESSAGE_FROM[msg?.type]?.(sender)) return false;
  (async () => {
    if (msg.type === 'capture') {
      await enqueue(msg.conversation);
      reply({ ok: true });
    } else if (msg.type === 'bridge-ready') {
      reply({ items: await getQueue() });
    } else if (msg.type === 'delivered') {
      const ids = Array.isArray(msg.ids) ? msg.ids : [];
      await setQueue((await getQueue()).filter(q => !ids.includes(q.id)));
      await updateBadge();
      reply({ ok: true });
    } else if (msg.type === 'status') {
      reply({ queue: await getQueue(), appUrl: await appUrl() });
    } else if (msg.type === 'open-app') {
      const tabs = await chrome.tabs.query({ url: APP_PATTERNS });
      if (tabs[0]) await chrome.tabs.update(tabs[0].id, { active: true });
      else await chrome.tabs.create({ url: await appUrl() });
      reply({ ok: true });
    } else if (msg.type === 'clear') {
      await setQueue([]);
      await updateBadge();
      reply({ ok: true });
    } else if (msg.type === 'search-query') {
      await noteSearch(msg);
      reply({ ok: true });
    } else if (msg.type === 'search-click') {
      await noteClick(msg);
      reply({ ok: true });
    } else if (msg.type === 'search-list') {
      reply({ log: await getSearchLog() });
    } else if (msg.type === 'search-send') {
      reply({ sent: await sendSearches(msg.ids) });
    } else if (msg.type === 'search-clear') {
      await setSearchLog([]);
      reply({ ok: true });
    } else if (msg.type === 'set-exploring') {
      await chrome.storage.local.set({ exploring: msg.on });
      await updateBadge();
      reply({ ok: true });
    }
  })();
  return true; // 비동기로 답한다
});
