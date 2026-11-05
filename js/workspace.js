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
  return `<div class="feed-card" data-item="${esc(item.id)}" style="--mc:${esc((m && m.color) || '#8ea2ff')}">
    <div class="fc-icon" aria-hidden="true">${icon}</div>
    <div class="fc-main">
      <div class="fc-head"><button class="fc-title" data-open>${esc(item.title)}</button><time class="fc-time">${typeof timeAgo === 'function' ? timeAgo(item.createdAt) : ''}</time></div>
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
    // 카드 아무 곳이나 클릭하면 열리되, 원문 링크 클릭은 그대로 둔다. 접근성 경로는 제목 버튼(.fc-title).
    c.onclick = e => { if (!e.target.closest('a')) openItemPanel(c.dataset.item); };
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

// ---------- 사이드레일: 마일스톤·산출물(CREATE) + 기여도·연결(CONNECT) ----------
const MS_STATUS = { todo: '할 일', doing: '진행', done: '완료' };
const DL_STATUS = { draft: '초안', review: '검토', submitted: '제출' };
const nextStatus = (cur, order) => order[(order.indexOf(cur) + 1) % order.length];

function dday(ts) {
  if (!ts) return '';
  const days = Math.ceil((ts - Date.now()) / 86400000);
  return days === 0 ? 'D-day' : days > 0 ? `D-${days}` : `D+${-days}`;
}

function railHTML() {
  const ms = (state.milestones || []).slice().sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
  const dl = state.deliverables || [];
  const msHTML = ms.map(m => `
    <li class="rail-row" data-ms="${esc(m.id)}">
      <span class="rail-main"><b>${esc(m.title)}</b>${m.phase ? `<span class="muted sm"> · ${esc(m.phase)}</span>` : ''}</span>
      <span class="rail-meta">${m.dueAt ? `<span class="dday ${m.dueAt < Date.now() && m.status !== 'done' ? 'over' : ''}">${dday(m.dueAt)}</span>` : ''}<button class="chip ms-status s-${esc(m.status)}" data-ms-status="${esc(m.id)}">${MS_STATUS[m.status] || esc(m.status)}</button></span>
    </li>`).join('') || '<li class="muted sm">아직 마일스톤이 없어요.</li>';
  const dlHTML = dl.map(d => {
    const o = member(d.ownerId);
    return `<li class="rail-row" data-dl="${esc(d.id)}">
      <span class="rail-main"><b>${esc(d.title)}</b>
        <span class="muted sm"><i class="dot" style="--mc:${esc((o && o.color) || '#8ea2ff')}"></i>${esc((o && o.name) || '담당 미정')}${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">문서 ↗</a>` : ''}</span></span>
      <button class="chip dl-status s-${esc(d.status)}" data-dl-status="${esc(d.id)}">${DL_STATUS[d.status] || esc(d.status)}</button>
    </li>`;
  }).join('') || '<li class="muted sm">아직 산출물이 없어요.</li>';

  const contrib = state.members.map(m => {
    const c = contribution(m.id);
    const total = Object.values(c.byType).reduce((a, b) => a + b, 0);
    return `<li class="contrib-row"><span class="rail-main"><i class="dot" style="--mc:${esc(m.color)}"></i>${esc(m.name)}</span><span class="muted sm">조각 ${total} · 이번주 ${c.week}</span></li>`;
  }).join('');

  const links = typeof crossMemberLinks === 'function' ? crossMemberLinks(visibleItems()).slice(0, 4) : [];
  const insight = links.map(p => {
    const am = member(p.a.memberId), bm = member(p.b.memberId);
    const sh = (p.a.keywords || []).filter(k => (p.b.keywords || []).includes(k)).slice(0, 2);
    return `<li class="muted sm">${esc((am && am.name) || '')} ↔ ${esc((bm && bm.name) || '')}${sh.length ? ` · ${esc(sh.join(', '))}` : ''}</li>`;
  }).join('') || '<li class="muted sm">아직 연결이 없어요.</li>';

  const proxyOn = typeof proxyReady === 'function' && proxyReady();
  const proxyTxt = guestMode ? '🎲 샘플 체험 — 실제 연동은 꺼져 있어요'
    : proxyOn ? '🔌 프록시 연결됨 · GitHub 실연동 가능'
    : '🔌 로그인하면 GitHub 실연동이 켜져요';

  return `
    <section class="rail-card">
      <p class="eyebrow">03 / CREATE · 만들어요</p>
      <h2>마일스톤</h2>
      <ul class="rail-list">${msHTML}</ul>
      <div class="rail-add"><input type="text" data-rail-input="milestone" placeholder="새 마일스톤" aria-label="새 마일스톤"><button class="btn sm" data-rail-add="milestone">추가</button></div>
    </section>
    <section class="rail-card">
      <h2>산출물</h2>
      <ul class="rail-list">${dlHTML}</ul>
      <div class="rail-add"><input type="text" data-rail-input="deliverable" placeholder="새 산출물(SSRD 등)" aria-label="새 산출물"><button class="btn sm" data-rail-add="deliverable">산출물 추가</button></div>
    </section>
    <section class="rail-card">
      <p class="eyebrow">02 / CONNECT · 연결하고</p>
      <h2>팀원 기여도</h2>
      <ul class="rail-list contrib">${contrib}</ul>
      <h3>🔗 연결 인사이트</h3>
      <ul class="rail-list">${insight}</ul>
    </section>
    <p class="rail-proxy muted sm">${proxyTxt}</p>`;
}

function wireRail(host) {
  host.querySelectorAll('[data-ms-status]').forEach(b => b.onclick = () => {
    const m = state.milestones.find(x => x.id === b.dataset.msStatus);
    if (m) { updateMilestone(m.id, { status: nextStatus(m.status, ['todo', 'doing', 'done']) }); renderWorkspace(); }
  });
  host.querySelectorAll('[data-dl-status]').forEach(b => b.onclick = () => {
    const d = state.deliverables.find(x => x.id === b.dataset.dlStatus);
    if (d) { updateDeliverable(d.id, { status: nextStatus(d.status, ['draft', 'review', 'submitted']) }); renderWorkspace(); }
  });
  const addMs = host.querySelector('[data-rail-add="milestone"]');
  if (addMs) addMs.onclick = () => { const inp = host.querySelector('[data-rail-input="milestone"]'); addMilestone({ title: (inp && inp.value.trim()) || '새 마일스톤' }); renderWorkspace(); };
  const addDl = host.querySelector('[data-rail-add="deliverable"]');
  if (addDl) addDl.onclick = () => { const inp = host.querySelector('[data-rail-input="deliverable"]'); addDeliverable({ title: (inp && inp.value.trim()) || '새 산출물', docType: 'custom' }); renderWorkspace(); };
}
