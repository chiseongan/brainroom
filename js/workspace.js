// js/workspace.js — 프로젝트 코크핏: 흩어진 조각을 한 피드로 (COLLECT → CONNECT → CREATE)
// state만 읽는 독립 모듈. 전송/수집 레이어는 건드리지 않는다.

const feedState = { q: '', source: '', memberId: '', type: '', since: 0 };

// 피드 필터: 가시성(canSee) 적용 + 텍스트/소스/사람/타입/기간 매칭, 최신순
function feedFilter(items, { q = '', source = '', memberId = '', type = '', since = 0 } = {}) {
  const needle = String(q).trim().toLowerCase();
  return items.filter(canSee).filter(i => {
    if (source && !(i.type === 'work' && i.work && i.work.source === source)) return false;
    if (memberId && i.memberId !== memberId) return false;
    if (type && i.type !== type) return false;
    if (since && i.createdAt < since) return false;
    if (needle) {
      const hay = `${i.title || ''} ${i.content || ''} ${(i.keywords || []).join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt);
}

// 아이템별 교차연결(🔗) 개수
function feedConnMap(items) {
  const map = {};
  if (typeof crossMemberLinks !== 'function') return map;
  for (const p of crossMemberLinks(items)) {
    map[p.a.id] = (map[p.a.id] || 0) + 1;
    map[p.b.id] = (map[p.b.id] || 0) + 1;
  }
  return map;
}

// 활동 카드: 플랫폼 아이콘 + 제목 + 사람(색) + 상대시간 + 미리보기 + 키워드 + 🔗연결 + 원문링크
function feedCardHTML(item, conn = 0) {
  const m = typeof member === 'function' ? member(item.memberId) : null;
  const src = item.type === 'work' && item.work ? SOURCES[item.work.source] : null;
  const meta = TYPE_META[item.type] || {};
  const icon = src ? src.icon : (meta.icon || '•');
  const kw = (item.keywords || []).slice(0, 5).map(k => `<span class="chip">${esc(k)}</span>`).join('');
  const link = item.url ? `<a class="fc-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" data-stop>원문 ↗</a>` : '';
  const badge = conn ? `<span class="chip fc-conn">🔗 연결 ${conn}</span>` : '';
  const prev = item.content ? `<p class="fc-prev">${esc(trunc(item.content, 140))}</p>` : '';
  return `<div class="feed-card" data-item="${esc(item.id)}" tabindex="0" role="button" style="--mc:${esc((m && m.color) || '#8ea2ff')}">
    <div class="fc-icon" aria-hidden="true">${icon}</div>
    <div class="fc-main">
      <div class="fc-head"><b class="fc-title">${esc(item.title)}</b><time class="fc-time">${typeof timeAgo === 'function' ? timeAgo(item.createdAt) : ''}</time></div>
      <p class="fc-who"><i class="dot"></i>${esc((m && m.name) || '?')} · ${esc(src ? src.name : (meta.label || item.type))}</p>
      ${prev}
      <div class="chips fc-tags">${kw}${badge}${link}</div>
    </div>
  </div>`;
}

function feedListHTML() {
  const items = feedFilter(state.items, feedState);
  const conn = feedConnMap(visibleItems());
  return items.map(i => feedCardHTML(i, conn[i.id] || 0)).join('')
    || `<p class="muted feed-empty">조건에 맞는 활동이 없어요.</p>`;
}

function renderWorkspace() {
  const host = document.getElementById('app');
  if (!host || !state) return;
  const bar = document.getElementById('topbar');
  if (bar) bar.hidden = false;
  const count = feedFilter(state.items, feedState).length;
  const srcChips = ['github', 'figma', 'notion']
    .map(s => `<button class="chip fchip ${feedState.source === s ? 'on' : ''}" data-src="${s}">${SOURCES[s].icon} ${SOURCES[s].name}</button>`).join('');
  const people = state.members
    .map(m => `<button class="chip fchip ${feedState.memberId === m.id ? 'on' : ''}" data-member-filter="${esc(m.id)}" style="--mc:${esc(m.color)}"><i class="dot"></i>${esc(m.name)}</button>`).join('');
  const none = !feedState.source && !feedState.memberId && !feedState.type;
  host.innerHTML = `
    <div class="cockpit">
      <section class="feed">
        <div class="feed-head">
          <p class="eyebrow">01 / COLLECT · 모으고</p>
          <h1>활동 피드</h1>
          <p class="muted feed-count">GitHub·Figma·Notion과 팀의 기록을 한곳에서 · ${count}개</p>
        </div>
        <div class="feed-search"><input type="search" placeholder="제목·키워드로 검색" aria-label="피드 검색" value="${esc(feedState.q)}"></div>
        <div class="chips feed-filters">
          <button class="chip fchip ${none ? 'on' : ''}" data-clear>전체</button>
          ${srcChips}${people}
        </div>
        <div class="feed-list">${feedListHTML()}</div>
      </section>
      <div class="rail">${typeof railHTML === 'function' ? railHTML() : ''}</div>
    </div>`;
  wireFeed(host);
  if (typeof wireRail === 'function') wireRail(host);
}

function wireCards(host) {
  host.querySelectorAll('.feed-card').forEach(c => {
    const open = () => openItemPanel(c.dataset.item);
    c.onclick = e => { if (!e.target.closest('[data-stop]')) open(); };
    c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}

function refreshFeedList(host) {
  const list = host.querySelector('.feed-list');
  if (list) list.innerHTML = feedListHTML();
  const count = host.querySelector('.feed-count');
  if (count) count.textContent = `GitHub·Figma·Notion과 팀의 기록을 한곳에서 · ${feedFilter(state.items, feedState).length}개`;
  wireCards(host);
}

function wireFeed(host) {
  const input = host.querySelector('.feed-search input');
  if (input) input.oninput = e => { feedState.q = e.target.value; refreshFeedList(host); };
  host.querySelectorAll('.feed-filters [data-src]').forEach(b =>
    b.onclick = () => { feedState.source = feedState.source === b.dataset.src ? '' : b.dataset.src; renderWorkspace(); });
  host.querySelectorAll('.feed-filters [data-member-filter]').forEach(b =>
    b.onclick = () => { feedState.memberId = feedState.memberId === b.dataset.memberFilter ? '' : b.dataset.memberFilter; renderWorkspace(); });
  const clear = host.querySelector('[data-clear]');
  if (clear) clear.onclick = () => { feedState.q = ''; feedState.source = ''; feedState.memberId = ''; feedState.type = ''; renderWorkspace(); };
  wireCards(host);
}

// 상세 패널: 기존 #panel 재사용(닫기는 app.js의 data-close-panel 위임)
function openItemPanel(id) {
  const it = typeof itemById === 'function' ? itemById(id) : state.items.find(i => i.id === id);
  if (!it) return;
  const m = member(it.memberId);
  const src = it.type === 'work' && it.work ? SOURCES[it.work.source] : null;
  const meta = TYPE_META[it.type] || {};
  const links = typeof crossMemberLinks === 'function'
    ? crossMemberLinks(visibleItems()).filter(p => p.a.id === it.id || p.b.id === it.id).slice(0, 6) : [];
  const connected = links.map(p => {
    const o = p.a.id === it.id ? p.b : p.a;
    const om = member(o.memberId);
    return `<li><i class="dot" style="--mc:${esc((om && om.color) || '#8ea2ff')}"></i>${esc(o.title)} <span class="muted sm">· ${esc((om && om.name) || '')}</span></li>`;
  }).join('');
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <header><h2>${esc(it.title)}</h2><button class="btn icon" data-close-panel aria-label="닫기">✕</button></header>
    <p class="muted sm"><i class="dot" style="--mc:${esc((m && m.color) || '#8ea2ff')}"></i>${esc((m && m.name) || '?')} · ${esc(src ? src.name : (meta.label || it.type))} · ${typeof timeAgo === 'function' ? timeAgo(it.createdAt) : ''}</p>
    ${it.content ? `<p class="panel-body">${esc(it.content)}</p>` : ''}
    ${it.url ? `<a class="btn-ghost sm panel-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>` : ''}
    ${(it.keywords && it.keywords.length) ? `<div class="chips panel-tags">${it.keywords.map(k => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : ''}
    ${connected ? `<h3>🔗 연결된 조각</h3><ul class="conn-list">${connected}</ul>` : ''}`;
  panel.classList.add('open');
}
