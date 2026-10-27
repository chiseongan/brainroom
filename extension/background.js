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

async function enqueue(conversation) {
  const queue = (await getQueue()).filter(q => q.conversation.sourceId !== conversation.sourceId); // 같은 대화는 최신 것만
  queue.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, conversation });
  await setQueue(queue.slice(-30));
  await updateBadge();
  await deliver();
}

async function updateBadge() {
  const n = (await getQueue()).length;
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
}

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

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'capture') {
      await enqueue(msg.conversation);
      reply({ ok: true });
    } else if (msg.type === 'bridge-ready') {
      reply({ items: await getQueue() });
    } else if (msg.type === 'delivered') {
      await setQueue((await getQueue()).filter(q => !msg.ids.includes(q.id)));
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
    }
  })();
  return true; // 비동기로 답한다
});
