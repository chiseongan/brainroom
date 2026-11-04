// Chrome 확장(extension/)이 ChatGPT·Claude·Gemini에서 담아 보낸 대화를 받는다.
// 받은 대화는 바로 저장하지 않고, 기존 'AI 대화 불러오기' 창으로 보여줘서 고른 것만 저장한다(RQ-5, 개인정보 가리기 LS-4 그대로).
// 확장 → extension/bridge.js → window.postMessage(source: 'brainroom-ext') → 여기 → 받았다고 답(source: 'brainroom-app')

let extInstalled = false;
let extPending = []; // 방에 들어가기 전에 받은 대화
let extSearchPending = []; // 받은 검색 기록

window.addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== 'brainroom-ext') return;
  if (e.data.type === 'hello') { extInstalled = true; return; }
  if (e.data.type !== 'ai-capture' || !Array.isArray(e.data.items)) return;
  const items = e.data.items.filter(q => q?.conversation?.transcript && q.conversation.sourceId);
  items.forEach(q => {
    extPending = extPending.filter(p => p.sourceId !== q.conversation.sourceId);
    extPending.push(q.conversation);
  });
  e.data.items.filter(q => q?.kind === 'search' && q.search?.query).forEach(q => {
    extSearchPending = extSearchPending.filter(s => s.id !== q.search.id);
    extSearchPending.push(q.search);
  });
  window.postMessage({ source: 'brainroom-app', type: 'ack', ids: e.data.items.map(q => q.id) }, location.origin);
  showExtPending();
});

function extReady() {
  return Boolean(state?.meId) && !isProfView() && !(AUTH_ENABLED && !authUser && !guestMode);
}

function showExtPending() {
  if (!extPending.length && !extSearchPending.length) return;
  if (!extReady()) {
    toast(`🧩 확장에서 ${extPending.length ? `AI 대화 ${extPending.length}개` : `검색 ${extSearchPending.length}개`}를 받았어요. 방에 들어가면 고를 수 있어요`);
    return;
  }
  if (!$('#modal').hidden) return; // 다른 창이 열려 있으면 닫힌 뒤에
  if (!extPending.length) return renderSearchImportModal();
  aiImport = extPending.map(c => ({ ...c, title: String(c.title).slice(0, 80) }));
  extPending = [];
  renderAiImportModal();
}

// ---------- 검색 기록 담기 (확장의 '탐색 기록') ----------
// 검색어와 누른 결과 제목만 저장한다. 공유 범위 기본값은 '나만'. 검색어 키워드는 다른 기록처럼 방의 물품이 된다.

function renderSearchImportModal() {
  const list = extSearchPending;
  openModal(`
    <h2>🔍 검색 기록 담기</h2>
    <p class="notice sm">✔ 체크한 검색만 저장돼요. 검색어와 누른 결과의 제목·주소만 담고, 이메일·전화번호 형태는 가려요.</p>
    <div class="ai-list">${list.map((s, i) => {
      const dup = findDuplicate({ memberId: state.meId, type: 'search', title: s.query, url: '' });
      return `
      <label class="ai-row ${dup ? 'dup' : ''}">
        <input type="checkbox" data-search-idx="${i}" ${dup ? 'disabled' : 'checked'}>
        <span><b>${esc(maskPII(s.query))}</b>
          <span class="muted sm">${s.engine === 'Naver' ? '네이버' : '구글'} · ${fmtDate(s.at)} · 누른 결과 ${s.clicks.length}개${dup ? ' · 이미 담김' : ''}</span>
          ${s.clicks.slice(0, 3).map(c => `<span class="sm ai-prev">↳ ${esc(trunc(maskPII(c.title), 60))}</span>`).join('')}</span>
      </label>`;
    }).join('')}</div>
    <div class="modal-actions ai-actions">
      <label class="sm">공유 범위 <select id="searchVis">${Object.entries(VISIBILITY).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}</select></label>
      <button class="btn ghost" data-ext-search="cancel">취소</button>
      <button class="btn primary" data-ext-search="save">고른 검색 담기</button>
    </div>`);
}

function saveSearches() {
  const picked = [...document.querySelectorAll('[data-search-idx]:checked')].map(el => extSearchPending[+el.dataset.searchIdx]);
  if (!picked.length) return toast('담을 검색을 골라 주세요');
  const visibility = $('#searchVis').value;
  picked.forEach(s => addItem({
    memberId: state.meId, type: 'search', title: s.query.slice(0, 80), createdAt: s.at, visibility,
    url: s.clicks[0]?.url || s.url || '',
    content: s.clicks.map(c => `- ${c.title}`).join('\n'), // 누른 결과 제목만 (검색 엔진 이름은 키워드가 되지 않게)
  }));
  extSearchPending = [];
  closeModal();
  toast(`🔍 검색 ${picked.length}개를 담았어요`);
  render();
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-ext-search]');
  if (!btn) return;
  if (btn.dataset.extSearch === 'save') return saveSearches();
  extSearchPending = [];
  closeModal();
});
