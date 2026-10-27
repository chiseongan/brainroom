// BrainRoom 페이지 안에서 확장과 앱을 이어 준다.
// 확장 → (이 스크립트) → window.postMessage → BrainRoom 앱(js/extension.js) → 받았다고 답하면 확장 보관함에서 지운다.

(() => {
  if (window.__brainroomBridge) return;
  window.__brainroomBridge = true;
  const ORIGIN = location.origin;
  const post = items => {
    if (items?.length) window.postMessage({ source: 'brainroom-ext', type: 'ai-capture', items }, ORIGIN);
  };

  window.postMessage({ source: 'brainroom-ext', type: 'hello', version: chrome.runtime.getManifest().version }, ORIGIN);
  chrome.runtime.sendMessage({ type: 'bridge-ready' }, res => {
    if (!chrome.runtime.lastError) post(res?.items);
  });
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type !== 'deliver') return;
    post(msg.items);
    reply({ ok: true });
  });

  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== ORIGIN || e.data?.source !== 'brainroom-app') return;
    if (e.data.type === 'ack' && Array.isArray(e.data.ids)) chrome.runtime.sendMessage({ type: 'delivered', ids: e.data.ids });
  });
})();
