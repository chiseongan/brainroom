// Chrome 확장(extension/)이 ChatGPT·Claude·Gemini에서 담아 보낸 대화를 받는다.
// 받은 대화는 바로 저장하지 않고, 기존 'AI 대화 불러오기' 창으로 보여줘서 고른 것만 저장한다(RQ-5, 개인정보 가리기 LS-4 그대로).
// 확장 → extension/bridge.js → window.postMessage(source: 'brainroom-ext') → 여기 → 받았다고 답(source: 'brainroom-app')

let extInstalled = false;
let extPending = []; // 방에 들어가기 전에 받은 대화

window.addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'brainroom-ext') return;
  if (e.data.type === 'hello') { extInstalled = true; return; }
  if (e.data.type !== 'ai-capture' || !Array.isArray(e.data.items)) return;
  const items = e.data.items.filter(q => q?.conversation?.transcript && q.conversation.sourceId);
  items.forEach(q => {
    extPending = extPending.filter(p => p.sourceId !== q.conversation.sourceId);
    extPending.push(q.conversation);
  });
  window.postMessage({ source: 'brainroom-app', type: 'ack', ids: e.data.items.map(q => q.id) }, location.origin);
  showExtPending();
});

function extReady() {
  return Boolean(state?.meId) && !isProfView() && !(AUTH_ENABLED && !authUser && !guestMode);
}

function showExtPending() {
  if (!extPending.length) return;
  if (!extReady()) {
    toast(`🧩 확장에서 AI 대화 ${extPending.length}개를 받았어요. 방에 들어가면 고를 수 있어요`);
    return;
  }
  if (!$('#modal').hidden) return; // 다른 창이 열려 있으면 닫힌 뒤에
  aiImport = extPending.map(c => ({ ...c, title: String(c.title).slice(0, 80) }));
  extPending = [];
  renderAiImportModal();
}
