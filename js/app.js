// 화면 렌더링 + 이벤트 처리

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
let panelSpec = null; // { memberId, zone } 열려 있는 자료 패널

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeUrl(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function timeAgo(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}

function go(view, roomId = null) {
  state.view = view;
  state.roomId = roomId;
  saveState();
  closePanel();
  render();
  window.scrollTo(0, 0);
}

// ---------- 공통 조각 ----------

function themeChips(themes, max = 4) {
  return themes.slice(0, max).map(({ theme, score }) =>
    `<span class="chip">${theme.emoji} ${theme.name}${score > 1 ? ` <b>${score}</b>` : ''}</span>`).join('');
}

function itemCardHTML(item, { owner = false } = {}) {
  const meta = TYPE_META[item.type];
  const m = member(item.memberId);
  const mine = item.memberId === state.meId;
  const url = safeUrl(item.url);
  const host = url ? url.replace(/^https?:\/\//i, '').split('/')[0] : '';
  const isPinned = m.pinnedIdeaId === item.id;
  return `
  <article class="item-card" data-id="${item.id}" style="--mc:${m.color}">
    <header>
      <span class="ic-type" title="${meta.label}">${meta.icon}</span>
      <b>${esc(item.title)}</b>
      ${owner ? `<span class="ic-owner">${esc(m.name)}</span>` : ''}
    </header>
    ${item.content ? `<p>${esc(item.content)}</p>` : ''}
    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(host)}</a>` : ''}
    <div class="chips">
      ${item.themes.map(t => `<span class="chip">${THEME_BY_ID[t].emoji} ${THEME_BY_ID[t].name}</span>`).join('')}
      ${item.keywords.map(k => `<span class="chip ghost">#${esc(k)}</span>`).join('')}
    </div>
    <footer>
      <span class="muted">${timeAgo(item.createdAt)}</span>
      <button class="btn sm" data-act="table">${item.table ? '테이블에서 내리기' : '🗂️ 회의실로 보내기'}</button>
      ${mine && item.type === 'idea' && !isPinned ? '<button class="btn sm" data-act="pin">📌 화이트보드 고정</button>' : ''}
      ${mine ? '<button class="btn sm danger" data-act="delete">삭제</button>' : ''}
    </footer>
  </article>`;
}

// ---------- 시작 화면 ----------

function renderSetup() {
  $('#topbar').hidden = true;
  app.innerHTML = `
  <section class="setup">
    <div class="setup-card">
      <div class="logo">🧠</div>
      <h1>BrainRoom</h1>
      <p class="lead">각자 찾아본 자료가 <b>방 인테리어</b>가 되는 팀 브레인스토밍 오피스</p>
      <form id="setupForm">
        <label>팀 이름<input name="team" required placeholder="예: 캡스톤 3조" maxlength="30"></label>
        <label>팀원 이름 <small>(쉼표로 구분, 첫 번째가 나)</small>
          <input name="members" required placeholder="예: 지민, 서준, 하은" maxlength="120" value="${authUser ? esc(authUser.name) + ', ' : ''}"></label>
        <button class="btn primary" type="submit">오피스 만들기</button>
      </form>
      <div class="or">또는</div>
      <button class="btn" id="sampleBtn">🎲 샘플 팀으로 체험하기</button>
      <label class="btn ghost file-btn">📂 워크스페이스 파일 불러오기<input type="file" accept=".json" id="importFile" hidden></label>
    </div>
  </section>`;
}

const GOOGLE_LOGO = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/>
  <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/>
  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/>
</svg>`;

function renderLogin() {
  $('#topbar').hidden = true;
  const fileMode = location.protocol === 'file:';
  app.innerHTML = `
  <section class="setup">
    <div class="setup-card">
      <div class="logo">🧠</div>
      <h1>BrainRoom</h1>
      <p class="lead">각자 찾아본 자료가 <b>방 인테리어</b>가 되는 팀 브레인스토밍 오피스</p>
      <button class="btn google-btn" id="googleLogin" ${fileMode ? 'disabled' : ''}>${GOOGLE_LOGO}<span>Google 계정으로 로그인</span></button>
      ${fileMode
        ? '<p class="notice">⚠️ 파일을 직접 열면 Google 로그인이 동작하지 않아요.<br>로컬 서버(<code>python -m http.server 5173</code>)로 실행해 주세요.</p>'
        : '<p class="muted sm">로그인하면 내 계정이 팀원의 방과 연결돼요.</p>'}
    </div>
  </section>`;
}

// 로그인한 계정이 이 워크스페이스의 어느 팀원인지 고르는 화면
function renderClaim() {
  $('#topbar').hidden = true;
  const free = state.members.filter(m => !m.uid);
  app.innerHTML = `
  <section class="setup">
    <div class="setup-card">
      ${authUser.photo ? `<img class="claim-photo" src="${esc(authUser.photo)}" alt="" referrerpolicy="no-referrer">` : '<div class="logo">🙋</div>'}
      <h1>${esc(authUser.name)}님, 반가워요!</h1>
      <p class="lead"><b>${esc(state.teamName)}</b>에서 누구의 방을 쓰시나요?</p>
      <div class="claim-list">
        ${free.map(m => `
          <button class="btn claim-btn" data-claim="${m.id}" style="--mc:${m.color}"><i class="dot"></i>${esc(m.name)}</button>`).join('')}
        <button class="btn primary" data-claim="new">➕ 새 팀원 "${esc(authUser.name)}"(으)로 참여</button>
      </div>
      <button class="btn ghost sm" id="logoutBtn">다른 계정으로 로그인</button>
    </div>
  </section>`;
}

// ---------- 오피스 ----------

function renderOffice() {
  const table = tableItems();
  const links = crossMemberLinks(state.items);

  const shared = {};
  state.members.forEach(m => profile(m.id).themes.forEach(({ theme }) => {
    (shared[theme.id] ||= []).push(m);
  }));
  const sharedThemes = Object.entries(shared).filter(([, ms]) => ms.length >= 2).sort((a, b) => b[1].length - a[1].length);

  app.innerHTML = `
  <section class="office">
    <div class="page-head">
      <div>
        <h1>${esc(state.teamName)}의 오피스</h1>
        <p class="muted">팀원 ${state.members.length}명 · 모인 자료 ${state.items.length}개 · 회의 테이블 위 ${table.length}개</p>
      </div>
      <button class="btn" data-go="room" data-member="${state.meId}">🚪 내 방으로 가기</button>
    </div>

    <div class="office-grid">
      <article class="meeting-card" data-go="meeting">
        <div class="mc-table">
          ${table.slice(0, 8).map((it, i) => `<span style="--mc:${member(it.memberId).color};--i:${i}">${TYPE_META[it.type].icon}</span>`).join('') || '<em>비어 있음</em>'}
        </div>
        <div>
          <h2>🗂️ 회의실</h2>
          <p>각자 방에서 찾은 자료를 테이블에 모아 연결점을 찾아보세요</p>
          <p class="muted">테이블 위 ${table.length}개 · 발견된 연결 ${links.length}개</p>
        </div>
      </article>

      ${state.members.map(m => {
        const p = profile(m.id);
        return `
        <article class="room-card" data-go="room" data-member="${m.id}" style="--mc:${m.color}">
          ${roomHTML(m.id, { mini: true })}
          <div class="rc-info">
            <b>${esc(m.name)}</b>${m.id === state.meId ? '<span class="badge">나</span>' : ''}
            <span class="muted">자료 ${p.items.length}개${p.last ? ` · ${timeAgo(p.last)}` : ''}</span>
          </div>
          <div class="chips">${themeChips(p.themes, 3) || '<span class="muted">아직 탐색 주제 없음</span>'}</div>
        </article>`;
      }).join('')}
    </div>

    <section class="card shared-themes">
      <h3>🔗 겹치는 관심사</h3>
      ${sharedThemes.length ? sharedThemes.map(([id, ms]) => `
        <div class="st-row"><span class="chip">${THEME_BY_ID[id].emoji} ${THEME_BY_ID[id].name}</span>
          ${ms.map(m => `<span class="dot-name" style="--mc:${m.color}">${esc(m.name)}</span>`).join('')}</div>`).join('')
        : '<p class="muted">두 명 이상이 같은 주제를 탐색하면 여기에 나타나요.</p>'}
    </section>
  </section>`;
}

// ---------- 개인 방 ----------

function renderRoom(memberId) {
  const m = member(memberId);
  if (!m) return go('meeting');
  const p = profile(memberId);
  const mine = memberId === state.meId;

  app.innerHTML = `
  <section class="room-view">
    <div class="page-head">
      <div>
        <button class="btn ghost sm" data-go="meeting">← 회의실</button>
        <h1 style="--mc:${m.color}" class="room-title">${esc(m.name)}의 방 <span class="badge">Lv.${p.level}</span></h1>
      </div>
      <div class="room-nav">
        ${state.members.filter(o => o.id !== memberId).map(o =>
          `<button class="btn sm" data-go="room" data-member="${o.id}" style="--mc:${o.color}"><i class="dot"></i>${esc(o.name)}</button>`).join('')}
      </div>
    </div>

    <div class="room-layout">
      <div class="room-stage">
        ${roomHTML(memberId)}
        <p class="muted hint">책장·포스트잇·화이트보드·소품을 클릭하면 모인 자료를 볼 수 있어요</p>
      </div>
      <aside class="room-side">
        ${mine ? `
        <form id="addForm" class="card add-form">
          <h3>➕ 내 방에 담기</h3>
          <div class="seg">
            ${Object.entries(TYPE_META).map(([type, meta], i) => `
              <label><input type="radio" name="type" value="${type}" ${i === 0 ? 'checked' : ''}><span>${meta.icon} ${meta.label}</span></label>`).join('')}
          </div>
          <input name="title" required maxlength="80" placeholder="제목">
          <input name="url" maxlength="500" placeholder="링크 (선택)">
          <textarea name="content" rows="4" maxlength="2000" placeholder="내용, 요약, 느낀 점…"></textarea>
          <button class="btn primary" type="submit">담기</button>
        </form>` : `
        <div class="card visiting">👀 <b>${esc(m.name)}</b>님의 방을 구경 중이에요.<br><span class="muted">마음에 드는 자료는 회의실로 보낼 수 있어요.</span></div>`}

        <div class="card">
          <h3>탐색 중인 주제</h3>
          <div class="chips">${themeChips(p.themes, 8) || '<span class="muted">자료를 담으면 자동으로 분류돼요</span>'}</div>
          <h3>자주 등장한 키워드</h3>
          <div class="chips">${p.keywords.map(k => `<span class="chip ghost">#${esc(k)}</span>`).join('') || '<span class="muted">-</span>'}</div>
        </div>

        <div class="card">
          <h3>최근 자료</h3>
          <div class="item-list">${p.items.slice(0, 5).map(i => itemCardHTML(i)).join('') || '<p class="muted">아직 자료가 없어요.</p>'}</div>
        </div>
      </aside>
    </div>
  </section>`;
}

function handleAdd(form) {
  const data = new FormData(form);
  const title = data.get('title').trim();
  if (!title) return;
  const before = new Set(profile(state.meId).themes.map(t => t.theme.id));
  const item = addItem({
    memberId: state.meId,
    type: data.get('type'),
    title,
    url: data.get('url').trim(),
    content: data.get('content').trim(),
  });
  const newThemes = item.themes.filter(t => !before.has(t));
  toast(`${TYPE_META[item.type].icon} ${TYPE_META[item.type].place}에 추가됐어요`);
  newThemes.forEach(t => toast(`${THEME_BY_ID[t].emoji} '${THEME_BY_ID[t].name}' 소품이 방에 생겼어요!`));
  render();
}

// ---------- 회의실 ----------

function renderMeeting() {
  const onTable = tableItems();
  const recs = crossMemberLinks(state.items).slice(0, 6);
  const ranked = [...onTable].sort((a, b) => b.votes.length - a.votes.length);

  app.innerHTML = `
  <section class="meeting-view">
    <div class="page-head">
      <div>
        <h1>🗂️ ${esc(state.teamName)} 회의실</h1>
        <p class="muted">벽의 문이나 팀원 캐릭터를 누르면 그 팀원의 방으로 들어가요. 테이블을 누르면 아래 보드로 이동해요.</p>
      </div>
      <button class="btn primary" id="exportBtn">📝 초안 문서 만들기</button>
    </div>

    ${hallHTML()}

    <div class="page-head board-head" id="board">
      <div>
        <h2>📋 테이블 보드</h2>
        <p class="muted">자료함에서 테이블로 끌어다 놓거나 ＋를 누르세요. 공통점이 있는 자료끼리 선으로 이어져요.</p>
      </div>
    </div>

    <div class="meeting-layout">
      <aside class="tray card">
        <h3>팀원 자료함</h3>
        <input id="traySearch" placeholder="검색…">
        ${state.members.map(m => {
          const items = itemsOf(m.id);
          return `
          <details open style="--mc:${m.color}">
            <summary><i class="dot"></i>${esc(m.name)} <span class="muted">(${items.length})</span></summary>
            ${items.map(it => `
              <div class="tray-item ${it.table ? 'placed' : ''}" draggable="${!it.table}" data-id="${it.id}" data-search="${esc((it.title + ' ' + it.keywords.join(' ')).toLowerCase())}">
                <span>${TYPE_META[it.type].icon}</span><span class="ti-title">${esc(it.title)}</span>
                ${it.table ? '<span class="muted sm">테이블</span>' : '<button class="btn icon" data-act="table" title="테이블에 올리기">＋</button>'}
              </div>`).join('') || '<p class="muted sm">자료 없음</p>'}
          </details>`;
        }).join('')}
      </aside>

      <div class="table-wrap">
        <div class="table-area" id="tableArea">
          <div class="table-top"></div>
          <svg id="linkLayer"></svg>
          ${onTable.map(it => {
            const m = member(it.memberId);
            const voted = it.votes.includes(state.meId);
            return `
            <div class="t-card" data-id="${it.id}" style="left:${it.table.x}%;top:${it.table.y}%;--mc:${m.color}">
              <div class="tc-head"><i class="dot"></i>${esc(m.name)}<button class="btn icon" data-act="table" title="테이블에서 내리기">✕</button></div>
              <b>${TYPE_META[it.type].icon} ${esc(it.title)}</b>
              <div class="chips">${it.keywords.slice(0, 3).map(k => `<span class="chip ghost">#${esc(k)}</span>`).join('')}</div>
              <button class="vote ${voted ? 'on' : ''}" data-act="vote">👍 ${it.votes.length}</button>
            </div>`;
          }).join('')}
          ${onTable.length ? '' : '<div class="table-empty">여기로 자료를 끌어다 놓으세요</div>'}
        </div>
      </div>

      <aside class="insights">
        <div class="card">
          <h3>🔗 추천 연결 <span class="muted sm">서로 다른 팀원의 자료</span></h3>
          ${recs.map(r => `
            <div class="rec">
              <div><i class="dot" style="--mc:${member(r.a.memberId).color}"></i>${esc(r.a.title)}</div>
              <div class="rec-x">↕</div>
              <div><i class="dot" style="--mc:${member(r.b.memberId).color}"></i>${esc(r.b.title)}</div>
              <div class="chips">${r.labels.slice(0, 4).map(l => `<span class="chip">${esc(l)}</span>`).join('')}</div>
              ${r.a.table && r.b.table ? '<span class="muted sm">✔ 둘 다 테이블 위</span>'
                : `<button class="btn sm" data-rec="${r.a.id},${r.b.id}">둘 다 테이블에 올리기</button>`}
            </div>`).join('') || '<p class="muted">자료가 더 모이면 연결점을 찾아드려요.</p>'}
        </div>
        <div class="card">
          <h3>🗳️ 투표 현황</h3>
          ${ranked.map((it, i) => `
            <div class="rank"><b>${i + 1}</b><span>${esc(it.title)}</span><span class="muted">👍 ${it.votes.length}</span></div>`).join('')
            || '<p class="muted">테이블 위 카드에 👍를 눌러 투표하세요.</p>'}
        </div>
      </aside>
    </div>
  </section>`;

  requestAnimationFrame(drawLinks);
}

function drawLinks() {
  const area = $('#tableArea');
  const svg = $('#linkLayer');
  if (!area || !svg) return;
  const box = area.getBoundingClientRect();
  const centers = {};
  area.querySelectorAll('.t-card').forEach(card => {
    const r = card.getBoundingClientRect();
    centers[card.dataset.id] = { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
  });
  const items = tableItems();
  let lines = '';
  let labels = '';
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const rel = relatedness(a, b);
      if (!rel.score || !centers[a.id] || !centers[b.id]) continue;
      const pa = centers[a.id], pb = centers[b.id];
      const cross = a.memberId !== b.memberId;
      lines += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" class="${cross ? 'cross' : 'same'}" stroke-width="${Math.min(1.5 + rel.score, 7)}"/>`;
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      labels += `<text x="${mx}" y="${my}" class="lbl">${esc(rel.labels.slice(0, 2).join(' '))}</text>`;
    }
  }
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = lines + labels;
}

function exportMarkdown() {
  const date = new Date().toLocaleDateString('ko-KR');
  const ranked = [...tableItems()].sort((a, b) => b.votes.length - a.votes.length);
  const recs = crossMemberLinks(tableItems().length ? tableItems() : state.items).slice(0, 6);
  const lines = [
    `# ${state.teamName} 아이디어 회의 초안`,
    '',
    `- 작성일: ${date}`,
    `- 참여: ${state.members.map(m => m.name).join(', ')}`,
    '',
    '## 1. 팀원별 탐색 주제',
    ...state.members.map(m => {
      const p = profile(m.id);
      const themes = p.themes.slice(0, 4).map(t => `${t.theme.emoji} ${t.theme.name}`).join(', ') || '-';
      return `- **${m.name}** (자료 ${p.items.length}개): ${themes}${p.keywords.length ? ` / 키워드: ${p.keywords.slice(0, 5).join(', ')}` : ''}`;
    }),
    '',
    '## 2. 회의 테이블에 오른 아이디어 (투표순)',
    ...(ranked.length ? ranked.flatMap((it, i) => [
      `${i + 1}. ${TYPE_META[it.type].icon} **${it.title}** by ${member(it.memberId).name} (👍 ${it.votes.length})`,
      ...(it.content ? [`   - ${it.content}`] : []),
      ...(it.url ? [`   - 출처: ${safeUrl(it.url)}`] : []),
    ]) : ['- (테이블에 올라온 자료 없음)']),
    '',
    '## 3. 발견된 연결점',
    ...(recs.length ? recs.map(r =>
      `- ${r.a.title} (${member(r.a.memberId).name}) ↔ ${r.b.title} (${member(r.b.memberId).name}): ${r.labels.join(', ')}`)
      : ['- (연결점 없음)']),
    '',
    '## 4. 다음 단계',
    `- [ ] ${ranked[0] ? `최다 득표 아이디어 「${ranked[0].title}」 구체화` : '아이디어 후보 추리기'}`,
    '- [ ] 연결점이 있는 아이디어끼리 합쳐볼 수 있는지 검토',
    '- [ ] 역할 분담 및 다음 회의 일정 정하기',
    '',
  ];
  return lines.join('\n');
}

function openExportModal() {
  const md = exportMarkdown();
  openModal(`
    <h2>📝 회의 초안 문서</h2>
    <textarea class="md-out" readonly>${esc(md)}</textarea>
    <div class="modal-actions">
      <button class="btn" id="copyMd">복사</button>
      <button class="btn primary" id="downloadMd">.md 다운로드</button>
      <button class="btn ghost" data-close>닫기</button>
    </div>`);
  $('#copyMd').onclick = async () => {
    try { await navigator.clipboard.writeText(md); toast('복사했어요'); }
    catch { $('.md-out').select(); document.execCommand('copy'); toast('복사했어요'); }
  };
  $('#downloadMd').onclick = () => download(`${state.teamName}_회의초안.md`, md, 'text/markdown');
}

// ---------- 패널 / 모달 ----------

function openPanel(memberId, zone) {
  panelSpec = { memberId, zone };
  renderPanel();
}

function renderPanel() {
  const panel = $('#panel');
  if (!panelSpec) { panel.classList.remove('open'); return; }
  const { title, items, empty } = zoneItems(panelSpec.memberId, panelSpec.zone);
  panel.innerHTML = `
    <header><h3>${title}</h3><button class="btn icon" data-close-panel>✕</button></header>
    <p class="muted">${esc(member(panelSpec.memberId).name)}의 방 · ${items.length}개</p>
    <div class="item-list">${items.map(i => itemCardHTML(i)).join('') || `<p class="muted">${empty || '아직 자료가 없어요.'}</p>`}</div>`;
  panel.classList.add('open');
}

function closePanel() {
  panelSpec = null;
  renderPanel();
}

function openModal(html) {
  const modal = $('#modal');
  modal.innerHTML = `<div class="modal-card">${html}</div>`;
  modal.hidden = false;
}

function closeModal() {
  $('#modal').hidden = true;
}

function openMenu() {
  openModal(`
    <h2>⚙️ 워크스페이스</h2>
    <p class="muted">지금은 이 브라우저에만 저장돼요. 파일로 내보내 팀원과 주고받을 수 있어요.</p>
    ${AUTH_ENABLED ? '' : '<p class="muted sm">🔓 로그인 없는 데모 모드로 실행 중이에요. <code>js/firebase-config.js</code>를 채우면 Google 로그인이 켜져요.</p>'}
    <form id="memberForm" class="inline-form">
      <input name="name" required maxlength="20" placeholder="새 팀원 이름">
      <button class="btn">팀원 추가</button>
    </form>
    <div class="menu-list">
      <button class="btn" id="exportWs">💾 워크스페이스 파일로 내보내기</button>
      <label class="btn file-btn">📂 워크스페이스 파일 불러오기<input type="file" accept=".json" id="importFile" hidden></label>
      <button class="btn danger" id="resetWs">🗑️ 초기화 (처음부터)</button>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-close>닫기</button></div>`);
  $('#exportWs').onclick = () => download(`brainroom_${state.teamName}.json`, JSON.stringify(state, null, 2), 'application/json');
  $('#resetWs').onclick = () => {
    if (!confirm('모든 자료가 지워집니다. 초기화할까요?')) return;
    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
    closeModal();
    render();
  };
}

function importWorkspace(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.members) || !Array.isArray(data.items)) throw new Error('형식 오류');
      data.items.forEach(analyze);
      state = { ...data, view: 'meeting', roomId: null };
      if (!member(state.meId)) state.meId = state.members[0]?.id;
      saveState();
      closeModal();
      render();
      toast('워크스페이스를 불러왔어요');
    } catch (e) {
      toast('불러올 수 없는 파일이에요');
    }
  };
  reader.readAsText(file);
}

// ---------- 라우터 ----------

function renderTopbar() {
  const bar = $('#topbar');
  bar.hidden = false;
  $('#teamName').textContent = state.teamName;
  document.querySelectorAll('#nav [data-go]').forEach(b => {
    const active = b.dataset.go === state.view && (b.dataset.go !== 'room' || state.roomId === state.meId);
    b.classList.toggle('active', active);
    if (b.dataset.go === 'room') b.dataset.member = state.meId;
  });
  $('#meSwitch').hidden = AUTH_ENABLED;
  $('#userChip').hidden = !AUTH_ENABLED;
  if (AUTH_ENABLED) {
    const me = member(state.meId);
    $('#userChip').innerHTML = `
      ${authUser.photo ? `<img src="${esc(authUser.photo)}" alt="" referrerpolicy="no-referrer">` : `<i class="dot" style="--mc:${me.color}"></i>`}
      <span title="${esc(authUser.email)}">${esc(me.name)}</span>
      <button class="btn ghost sm" id="logoutBtn">로그아웃</button>`;
  } else {
    $('#meSelect').innerHTML = state.members.map(m =>
      `<option value="${m.id}" ${m.id === state.meId ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  }
}

function render() {
  if (!authReady) {
    app.innerHTML = '<div class="loading">불러오는 중…</div>';
    return;
  }
  if (AUTH_ENABLED && !authUser) return renderLogin();
  if (!state) return renderSetup();
  if (AUTH_ENABLED) {
    const mine = memberByUid(authUser.uid);
    if (!mine) return renderClaim();
    if (state.meId !== mine.id) { state.meId = mine.id; saveState(); }
  }
  renderTopbar();
  if (state.view === 'room') renderRoom(state.roomId || state.meId);
  else if (state.view === 'office') renderOffice();
  else renderMeeting();
  if (panelSpec) renderPanel();
}

// ---------- 이벤트 ----------

document.addEventListener('click', e => {
  const t = e.target;

  if (t.closest('[data-close]') || t === $('#modal')) return closeModal();
  if (t.closest('[data-close-panel]')) return closePanel();
  if (t.closest('#menuBtn')) return openMenu();
  if (t.closest('#exportBtn')) return openExportModal();
  if (t.closest('#googleLogin')) return signInWithGoogle();
  if (t.closest('#logoutBtn')) {
    closePanel();
    closeModal();
    return signOutUser().then(() => toast('로그아웃했어요'));
  }

  const claim = t.closest('[data-claim]');
  if (claim) {
    const id = claim.dataset.claim === 'new' ? addMember(authUser.name).id : claim.dataset.claim;
    claimMember(id, authUser);
    toast(`${member(id).name}님의 방에 연결됐어요`);
    return go('meeting');
  }

  if (t.closest('#sampleBtn')) {
    state = sampleWorkspace();
    render();
    toast('샘플 팀 "캡스톤 3조"를 불러왔어요');
    return;
  }

  const zone = t.closest('.room:not(.mini) .zone');
  if (zone) return openPanel(state.roomId || state.meId, zone.dataset.zone);

  const scroll = t.closest('[data-scroll]');
  if (scroll) return document.getElementById(scroll.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });

  const rec = t.closest('[data-rec]');
  if (rec) {
    rec.dataset.rec.split(',').forEach(id => { const it = itemById(id); if (!it.table) placeOnTable(it); });
    return render();
  }

  const act = t.closest('[data-act]');
  if (act) {
    const item = itemById(act.closest('[data-id]').dataset.id);
    if (!item) return;
    if (act.dataset.act === 'table') {
      if (item.table) { item.table = null; saveState(); toast('테이블에서 내렸어요'); }
      else { placeOnTable(item); toast('🗂️ 회의 테이블에 올렸어요'); }
    } else if (act.dataset.act === 'vote') {
      item.votes = item.votes.includes(state.meId) ? item.votes.filter(v => v !== state.meId) : [...item.votes, state.meId];
      saveState();
    } else if (act.dataset.act === 'pin') {
      member(item.memberId).pinnedIdeaId = item.id;
      saveState();
      toast('📌 화이트보드에 고정했어요');
    } else if (act.dataset.act === 'delete') {
      if (!confirm(`「${item.title}」을(를) 삭제할까요?`)) return;
      deleteItem(item.id);
    }
    return render();
  }

  const nav = t.closest('[data-go]');
  if (nav) return go(nav.dataset.go, nav.dataset.member || null);
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'setupForm') {
    const data = new FormData(form);
    const names = data.get('members').split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
    if (!names.length) return;
    state = newWorkspace(data.get('team').trim(), [...new Set(names)]);
    if (authUser) claimMember(state.members[0].id, authUser);
    saveState();
    render();
  } else if (form.id === 'addForm') {
    handleAdd(form);
  } else if (form.id === 'memberForm') {
    const name = new FormData(form).get('name').trim();
    if (!name) return;
    addMember(name);
    form.reset();
    toast(`${name}님의 방이 생겼어요`);
    render();
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'meSelect') {
    state.meId = e.target.value;
    saveState();
    render();
    toast(`${member(state.meId).name}(으)로 전환했어요`);
  } else if (e.target.id === 'importFile' && e.target.files[0]) {
    importWorkspace(e.target.files[0]);
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'traySearch') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.tray-item').forEach(el => { el.hidden = q && !el.dataset.search.includes(q); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closePanel(); }
});

// 자료함 → 테이블 드래그 앤 드롭
document.addEventListener('dragstart', e => {
  const el = e.target.closest?.('.tray-item');
  if (el) e.dataTransfer.setData('text/plain', el.dataset.id);
});
document.addEventListener('dragover', e => {
  if (e.target.closest?.('#tableArea')) { e.preventDefault(); $('#tableArea').classList.add('drop'); }
});
document.addEventListener('dragleave', e => {
  if (e.target.id === 'tableArea') e.target.classList.remove('drop');
});
document.addEventListener('drop', e => {
  const area = e.target.closest?.('#tableArea');
  if (!area) return;
  e.preventDefault();
  const item = itemById(e.dataTransfer.getData('text/plain'));
  if (!item) return;
  const box = area.getBoundingClientRect();
  placeOnTable(item, ((e.clientX - box.left) / box.width) * 100 - 9, ((e.clientY - box.top) / box.height) * 100 - 8);
  render();
});

// 테이블 위 카드 이동 (마우스·터치 공통)
let dragging = null;
document.addEventListener('pointerdown', e => {
  const card = e.target.closest('.t-card');
  if (!card || e.target.closest('button')) return;
  const box = $('#tableArea').getBoundingClientRect();
  const r = card.getBoundingClientRect();
  dragging = { card, box, dx: e.clientX - r.left, dy: e.clientY - r.top };
  card.setPointerCapture(e.pointerId);
  card.classList.add('dragging');
});
document.addEventListener('pointermove', e => {
  if (!dragging) return;
  const { card, box, dx, dy } = dragging;
  card.style.left = `${clamp(((e.clientX - dx - box.left) / box.width) * 100, 0, 82)}%`;
  card.style.top = `${clamp(((e.clientY - dy - box.top) / box.height) * 100, 0, 80)}%`;
  drawLinks();
});
document.addEventListener('pointerup', () => {
  if (!dragging) return;
  const { card } = dragging;
  card.classList.remove('dragging');
  itemById(card.dataset.id).table = { x: parseFloat(card.style.left), y: parseFloat(card.style.top) };
  saveState();
  dragging = null;
});

window.addEventListener('resize', () => { if (state?.view === 'meeting') drawLinks(); });

state = loadState();
render();
initAuth(render);
