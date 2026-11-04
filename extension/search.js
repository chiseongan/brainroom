// 구글·네이버 검색 기록 담기 — '🔍 탐색 기록'을 켠 동안만 동작한다 (기본은 꺼짐)
// - 검색어(주소의 q·query)와, 검색 결과에서 누른 링크(제목·주소)만 기록한다. 페이지 내용은 읽지 않는다.
// - 모은 기록은 이 브라우저의 확장 저장소에만 쌓이고, 확장 창에서 고른 것만 BrainRoom으로 보낸다.
// - 켜져 있는 동안 화면 오른쪽 아래에 '탐색 기록 중' 표시를 띄워 기록되고 있음을 늘 알 수 있게 한다.

(() => {
  const host = location.hostname;
  const ENGINE = /(^|\.)google\.[a-z.]+$/.test(host) ? 'Google'
    : host === 'search.naver.com' || host === 'm.search.naver.com' ? 'Naver'
    : (document.documentElement.dataset.brainroomTestEngine || null); // 시험 페이지용
  if (!ENGINE || window.__brainroomSearch) return;
  window.__brainroomSearch = true;

  const params = new URLSearchParams(location.search);
  const query = (ENGINE === 'Naver' ? params.get('query') : params.get('q') || '').trim();
  if (!query) return;

  // 검색 엔진 자체의 링크(다음 페이지, 이미지 탭 등)는 결과가 아니다
  const isOwnLink = u => (ENGINE === 'Google' ? /(^|\.)google\.[a-z.]+$/.test(u.hostname) && !u.pathname.startsWith('/url')
    : ['search.naver.com', 'm.search.naver.com'].includes(u.hostname));

  function resultTarget(a) {
    let u;
    try { u = new URL(a.href); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    if (ENGINE === 'Google' && u.pathname === '/url') { // 구글 중간 주소 → 실제 주소
      try { u = new URL(u.searchParams.get('q') || u.searchParams.get('url')); } catch (e) { return null; }
    }
    if (isOwnLink(u)) return null;
    return u.href;
  }

  let indicator = null;
  function showIndicator(on) {
    if (!on) { indicator?.remove(); indicator = null; return; }
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.id = 'brainroom-search-indicator';
    indicator.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;';
    indicator.attachShadow({ mode: 'open' }).innerHTML = `
      <style>span{font:600 12px/1 system-ui,'Malgun Gothic',sans-serif;background:#065f46;color:#fff;padding:8px 12px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,.2);display:inline-block}</style>
      <span title="BrainRoom 확장의 '탐색 기록'이 켜져 있어요. 검색어와 누른 결과가 이 브라우저에만 모여요. 확장 창에서 끌 수 있어요.">🔍 BrainRoom 탐색 기록 중</span>`;
    document.documentElement.appendChild(indicator);
  }

  let exploring = false;
  const onClick = e => {
    if (!exploring) return;
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    const url = resultTarget(a);
    if (!url) return;
    const title = (a.querySelector('h3')?.textContent || a.textContent || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!title) return;
    chrome.runtime.sendMessage({ type: 'search-click', engine: ENGINE, query, title, url });
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true); // 가운데 버튼(새 탭)

  const apply = on => {
    exploring = on;
    showIndicator(on);
    if (on) chrome.runtime.sendMessage({ type: 'search-query', engine: ENGINE, query, url: location.href });
  };
  chrome.storage.local.get({ exploring: false }, ({ exploring: on }) => apply(on));
  chrome.storage.onChanged.addListener(ch => { if (ch.exploring) apply(ch.exploring.newValue); });
})();
