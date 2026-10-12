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

const STUDENT_VIEWS = ['meeting', 'room', 'office', 'timeline', 'decisions', 'report'];

function go(view, roomId = null) {
  if (isProfView() && STUDENT_VIEWS.includes(view)) {
    logAccess(view);
    return toast('교수자 보기에서는 학생 전용 화면에 들어갈 수 없어요');
  }
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
      ${mine
        ? `<select class="vis-select" title="공유 범위" aria-label="공유 범위">${Object.entries(VISIBILITY).map(([k, v]) =>
            `<option value="${k}" ${item.visibility === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select>`
        : visBadge(item)}
    </header>
    ${item.content ? `<p>${esc(item.content)}</p>` : ''}
    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(host)}</a>` : ''}
    ${item.type === 'ai' && item.ai ? `
      <div class="ai-meta">
        ${mine
          ? `<label class="sm">사용 목적 <select class="purpose-select">${AI_PURPOSES.map(p =>
              `<option value="${p.id}" ${item.ai.purpose === p.id ? 'selected' : ''}>${p.emoji} ${p.label}</option>`).join('')}</select></label>
             <span class="chip ghost">${esc(item.ai.tool)}</span>`
          : purposeChip(item)}
      </div>
      ${item.ai.transcript ? `<details class="transcript"><summary>원문 보기</summary><pre>${esc(item.ai.transcript)}</pre></details>` : ''}` : ''}
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

function setupFormHTML(online) {
  return `
      <form id="setupForm">
        <label>${online ? '방 이름 <small>(팀 이름)</small>' : '팀 이름'}<input name="team" required placeholder="예: 캡스톤 3조" maxlength="30"></label>
        <label>수업명 <small>(선택, 교수자 보기에서 수업별로 묶여요)</small><input name="course" placeholder="예: 소프트웨어공학" maxlength="40"></label>
        <label>팀원 이름 <small>(쉼표로 구분, 첫 번째가 나)</small>
          <input name="members" required placeholder="예: 지민, 서준, 하은" maxlength="120" value="${authUser ? esc(authUser.name) + ', ' : ''}"></label>
        <button class="btn primary" type="submit">${online ? '🏠 방 만들기' : '오피스 만들기'}</button>
      </form>`;
}

function renderSetup() {
  $('#topbar').hidden = true;
  if (onlineMode()) return renderRoomGate();
  app.innerHTML = `
  <section class="setup">
    <div class="setup-card">
      <div class="logo">🧠</div>
      <h1>BrainRoom</h1>
      <p class="lead">각자 찾아본 자료가 <b>방 인테리어</b>가 되는 팀 브레인스토밍 오피스</p>
      ${setupFormHTML(false)}
      <div class="or">또는</div>
      <button class="btn" id="sampleBtn">🎲 샘플 팀으로 체험하기</button>
      <label class="btn ghost file-btn">📂 워크스페이스 파일 불러오기<input type="file" accept=".json" id="importFile" hidden></label>
    </div>
  </section>`;
}

// 로그인 후 첫 화면: 방 만들기 / 방 참여하기
function renderRoomGate() {
  const mode = cloud.setupMode;
  const rooms = myRoomsHTML();
  const local = loadState();
  const back = mode
    ? '<button class="btn ghost sm" data-cloud="mode:">← 처음으로</button>'
    : state ? '<button class="btn ghost sm" data-cloud="back">← 보던 화면으로</button>' : '';
  let body;
  if (mode === 'create') {
    body = `
      <h2>🏠 방 만들기</h2>
      <p class="muted sm">방을 만들면 상단 <b>🔗 초대 링크</b>로 팀원을 부를 수 있어요.</p>
      ${setupFormHTML(true)}`;
  } else if (mode === 'join') {
    body = `
      <h2>🔑 방 참여하기</h2>
      <p class="muted sm">방에 있는 팀원에게 <b>초대 링크</b>를 받아 붙여넣으세요. 링크를 바로 열어도 참여돼요.</p>
      <form id="joinForm" class="add-form">
        <input name="link" required autocomplete="off" placeholder="초대 링크 붙여넣기 (…?team=…&code=…)">
        <button class="btn primary">참여하기</button>
      </form>`;
  } else {
    body = `
      <div class="gate">
        <button class="gate-card" data-cloud="mode:create"><span class="gate-icon">🏠</span><b>방 만들기</b><small>새 팀 방을 만들고 팀원을 초대해요</small></button>
        <button class="gate-card" data-cloud="mode:join"><span class="gate-icon">🔑</span><b>방 참여하기</b><small>받은 초대 링크로 팀 방에 들어가요</small></button>
      </div>
      ${rooms ? `<div class="or">내 방</div><div class="menu-list">${rooms}</div>` : ''}
      <details class="gate-more">
        <summary>다른 방법으로 시작하기</summary>
        <div class="menu-list">
          <button class="btn" id="sampleBtn">🎲 샘플 팀으로 방 만들기</button>
          ${local ? `<button class="btn" id="migrateBtn">💾 이 브라우저에 있던 「${esc(local.teamName)}」로 방 만들기</button>` : ''}
          <label class="btn file-btn">📂 워크스페이스 파일로 방 만들기<input type="file" accept=".json" id="importFile" hidden></label>
          <button class="btn ghost" data-cloud="local">💻 로그인 없이 이 기기에서만 쓰기</button>
        </div>
      </details>`;
  }
  app.innerHTML = `
  <section class="setup">
    <div class="setup-card">
      <div class="logo">🧠</div>
      <h1>BrainRoom</h1>
      <p class="lead">${esc(authUser.name)}님, 어떻게 시작할까요?</p>
      ${body}
      <div class="gate-foot">${back}<button class="btn ghost sm" id="logoutBtn">다른 계정으로 로그인</button></div>
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
      ${new URLSearchParams(location.search).get('team') ? '<p class="notice">🔑 방 초대 링크로 들어왔어요. 로그인하면 바로 그 방에 참여해요.</p>' : ''}
      <button class="btn google-btn" id="googleLogin" ${fileMode ? 'disabled' : ''}>${GOOGLE_LOGO}<span>Google 계정으로 로그인</span></button>
      ${fileMode
        ? '<p class="notice">⚠️ 파일을 직접 열면 Google 로그인이 동작하지 않아요.<br>로컬 서버(<code>python -m http.server 5173</code>)로 실행해 주세요.</p>'
        : '<p class="muted sm">로그인하면 내 계정이 팀원의 방과 연결돼요.</p>'}
      <div class="or">또는</div>
      <button class="btn" id="guestSampleBtn">🎲 로그인 없이 샘플 팀으로 체험하기</button>
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
  const links = crossMemberLinks(visibleItems());

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

    ${questsHTML()}

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
            <span class="muted">${activityStatus(p)} · 기록 ${p.items.length}개</span>
          </div>
          ${p.items[0] ? `<p class="rc-latest">💬 ${TYPE_META[p.items[0].type].icon} ${esc(trunc(p.items[0].title, 26))} <span class="muted">${timeAgo(p.items[0].createdAt)}</span></p>` : ''}
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
        <h1 style="--mc:${m.color}" class="room-title">${esc(m.name)}의 방 <span class="badge">${activityStatus(p)}</span></h1>
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
          <input name="url" maxlength="500" placeholder="링크 (선택, AI 대화는 공유 링크)">
          <textarea name="content" rows="4" maxlength="8000" placeholder="내용, 요약, 느낀 점… (AI 대화는 대화 내용을 붙여넣기)"></textarea>
          <label class="vis-field">공유 범위
            <select name="visibility">${Object.entries(VISIBILITY).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}</select></label>
          <p class="muted sm">이메일·전화번호·주민등록번호 형태는 저장 전에 가려져요.</p>
          <button class="btn primary" type="submit">담기</button>
          <label class="btn sm file-btn">🖥️ AI 대화 파일 불러오기 <small class="muted">(ChatGPT·Claude 내보내기 .json, .txt)</small>
            <input type="file" id="aiFile" accept=".json,.txt,.md" hidden></label>
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
  const type = data.get('type');
  const url = data.get('url').trim();
  const content = data.get('content').trim();
  const dup = findDuplicate({ memberId: state.meId, type, title, url });
  if (dup) return toast(`이미 담긴 기록이에요: 「${dup.title}」`); // ONRQ-4
  const before = new Set(profile(state.meId).themes.map(t => t.theme.id));
  const isAi = type === 'ai';
  const item = addItem({
    memberId: state.meId,
    type,
    title,
    url,
    content: isAi ? aiSummary(content) : content,
    visibility: data.get('visibility'),
    ai: isAi ? aiFields({ tool: detectAiTool(url, content.slice(0, 500)), transcript: content, firstPrompt: `${title} ${content.slice(0, 400)}` }) : null,
  });
  const newThemes = item.themes.filter(t => !before.has(t));
  toast(`${TYPE_META[item.type].icon} ${TYPE_META[item.type].place}에 추가됐어요 · ${VISIBILITY[item.visibility].icon} ${VISIBILITY[item.visibility].label}`);
  newThemes.forEach(t => toast(`${THEME_BY_ID[t].emoji} '${THEME_BY_ID[t].name}' 소품이 방에 생겼어요!`));
  render();
}

// ---------- 회의실 ----------

function renderMeeting() {
  const onTable = tableItems();
  const recs = crossMemberLinks(visibleItems()).slice(0, 6);
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
    ${memberStatusHTML()}

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
                <span>${TYPE_META[it.type].icon}</span><span class="ti-title">${esc(it.title)}</span>${it.visibility === 'me' ? '<span title="나만 보기">🔒</span>' : ''}
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
            <div class="rank"><b>${i + 1}</b><span>${esc(it.title)}</span><span class="muted">👍 ${it.votes.length}</span>
              <button class="btn sm" data-tr="rank-decide" data-item="${it.id}" title="결정 기록에 추가">✅ 결정</button></div>`).join('')
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
  const recs = crossMemberLinks(tableItems().length ? tableItems() : visibleItems()).slice(0, 6);
  const decisions = confirmedDecisions();
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
    '## 4. 결정 기록',
    ...(decisions.length ? decisions.flatMap(d => [
      `- ${new Date(d.createdAt).toLocaleDateString('ko-KR')} ${d.text}`,
      ...decisionSources(d).map(s => `   - 근거: ${s.title} (${member(s.memberId).name})${s.url ? ` ${safeUrl(s.url)}` : ''}`),
    ]) : ['- (확정된 결정 없음)']),
    '',
    '## 5. 다음 단계',
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
  const online = cloudOn() || state.cloudProf;
  openModal(`
    <h2>⚙️ 워크스페이스</h2>
    ${CLOUD_ENABLED && authUser ? cloudMenuHTML() : ''}
    <p class="muted">${online ? '🌐 온라인 팀이에요. 바뀐 내용은 팀원 화면에 바로 반영돼요.' : '지금은 이 브라우저에만 저장돼요. 파일로 내보내 팀원과 주고받을 수 있어요.'}</p>
    <p class="muted sm">${state.course ? `수업: ${esc(state.course)} · ` : ''}교수자 보기 접근 차단 기록 ${state.accessLog.length}건</p>
    ${guestMode ? '<p class="muted sm">🎲 샘플 팀 체험 중이에요. 여기서 바꾼 내용은 저장되지 않아요.</p>' : ''}
    ${AUTH_ENABLED ? '' : '<p class="muted sm">🔓 로그인 없는 데모 모드로 실행 중이에요. <code>js/firebase-config.js</code>를 채우면 Google 로그인이 켜져요.</p>'}
    <form id="memberForm" class="inline-form">
      <input name="name" required maxlength="20" placeholder="새 팀원 이름">
      <button class="btn">팀원 추가</button>
    </form>
    <div class="menu-list">
      <button class="btn" id="exportTeam">👥 팀 공유용 파일 내보내기 <small class="muted">(🔒 나만 기록 제외)</small></button>
      <button class="btn" id="exportProf">🎓 교수자 제출용 파일 <small class="muted">('교수자까지' 기록만 내용 포함)</small></button>
      <button class="btn" id="exportWs">💾 전체 백업 <small class="muted">(이 기기 보관용, 나만 기록 포함)</small></button>
      ${online ? '' : '<button class="btn" data-tr="enter-prof">🎓 교수자 보기로 전환 (시연)</button>'}
      ${online ? '' : `<label class="btn file-btn">📂 워크스페이스 파일 불러오기<input type="file" accept=".json" id="importFile" hidden></label>
      <button class="btn danger" id="resetWs">🗑️ 초기화 (처음부터)</button>`}
    </div>
    <div class="modal-actions"><button class="btn ghost" data-close>닫기</button></div>`);
  cloudFillInvites();
  if (state.cloudProf) {
    $('#memberForm').hidden = true;
    ['#exportTeam', '#exportProf', '#exportWs'].forEach(s => { $(s).hidden = true; });
  }
  $('#exportWs').onclick = () => download(`brainroom_${state.teamName}_백업.json`, JSON.stringify(state, null, 2), 'application/json');
  $('#exportTeam').onclick = () => {
    const shared = { ...state, items: state.items.filter(i => i.visibility !== 'me'), viewer: 'student', accessLog: [] };
    download(`brainroom_${state.teamName}.json`, JSON.stringify(shared, null, 2), 'application/json');
  };
  $('#exportProf').onclick = () => download(`brainroom_${state.teamName}_교수자제출.json`, JSON.stringify(sanitizeForProf(state), null, 2), 'application/json');
  if ($('#resetWs')) $('#resetWs').onclick = () => {
    if (!confirm('모든 자료가 지워집니다. 초기화할까요?')) return;
    state = null;
    if (!guestMode) try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
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
      if (data.forProfessor) { closeModal(); return toast('교수자 제출용 파일은 교수자 보기의 "팀 제출 파일 추가"로 열어 주세요'); }
      migrate(data);
      data.items.forEach(analyze);
      if (onlineMode() && (!state || cloud.showSetup)) {
        closeModal();
        return cloudCreateTeamFrom(data);
      }
      // 같은 팀 파일이면, 이 기기에만 있던 '나만' 기록은 지우지 않고 합친다
      const sameTeam = Boolean(state) && data.members.some(m => member(m.id));
      if (sameTeam) {
        const ids = new Set(data.items.map(i => i.id));
        data.items.push(...state.items.filter(i => i.visibility === 'me' && !ids.has(i.id)));
      }
      state = { ...data, view: 'meeting', roomId: null, viewer: 'student', meId: sameTeam ? state.meId : data.meId };
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
  $('#teamName').textContent = state.teamName + (cloudOn() ? ' · 🌐 온라인' : '');
  $('#inviteBtn').hidden = !cloudOn();
  $('#roomsBtn').hidden = !(CLOUD_ENABLED && authUser && !guestMode);
  const prof = isProfView();
  $('#nav').hidden = prof;
  $('#profBadge').hidden = !prof;
  document.querySelectorAll('#nav [data-go]').forEach(b => {
    const active = b.dataset.go === state.view && (b.dataset.go !== 'room' || state.roomId === state.meId);
    b.classList.toggle('active', active);
    if (b.dataset.go === 'room') b.dataset.member = state.meId;
  });
  $('#meSwitch').hidden = authActive();
  $('#userChip').hidden = !authActive() && !guestMode;
  if (guestMode) {
    $('#userChip').innerHTML = '<button class="btn ghost sm" id="exitGuestBtn">체험 끝내고 로그인</button>';
  }
  if (authActive()) {
    // 교수자는 팀원 명단에 없으므로 로그인 계정 이름을 쓴다
    const me = member(state.meId) || { name: authUser.name, color: '#64748b' };
    $('#userChip').innerHTML = `
      ${authUser.photo ? `<img src="${esc(authUser.photo)}" alt="" referrerpolicy="no-referrer">` : `<i class="dot" style="--mc:${me.color}"></i>`}
      <span title="${esc(authUser.email)}">${esc(me.name)}</span>
      <button class="btn ghost sm" id="logoutBtn">로그아웃</button>`;
  }
  if (!authActive()) {
    $('#meSelect').innerHTML = state.members.map(m =>
      `<option value="${m.id}" ${!prof && m.id === state.meId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')
      + `<option value="__prof" ${prof ? 'selected' : ''}>🎓 교수자</option>`;
  }
}

function render() {
  if (!authReady) {
    app.innerHTML = '<div class="loading">불러오는 중…</div>';
    return;
  }
  if (authActive() && !authUser) return renderLogin();
  if (cloud.busy || (cloudOn() && !cloud.loaded)) {
    $('#topbar').hidden = true;
    app.innerHTML = '<div class="loading">🌐 온라인 팀을 불러오는 중…</div>';
    return;
  }
  if (!state || cloud.showSetup) return renderSetup();
  if (authActive() && !isProfView()) {
    const mine = memberByUid(authUser.uid);
    if (!mine) return renderClaim();
    if (state.meId !== mine.id) { state.meId = mine.id; saveState(); }
  }
  renderTopbar();
  if (isProfView()) renderProfessor();
  else if (state.view === 'room') renderRoom(state.roomId || state.meId);
  else if (state.view === 'office') renderOffice();
  else if (state.view === 'timeline') renderTimeline();
  else if (state.view === 'decisions') renderDecisions();
  else if (state.view === 'report') renderReport();
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
    if (CLOUD_ENABLED) clearSession();
    return signOutUser().then(() => toast('로그아웃했어요'));
  }

  const claim = t.closest('[data-claim]');
  if (claim) {
    const id = claim.dataset.claim === 'new' ? addMember(authUser.name).id : claim.dataset.claim;
    claimMember(id, authUser);
    if (cloudOn()) cloudSetMemberId(id);
    toast(`${member(id).name}님의 방에 연결됐어요`);
    return go('meeting');
  }

  if (t.closest('#guestSampleBtn')) {
    guestMode = true;
    state = sampleWorkspace();
    render();
    toast('샘플 팀 "캡스톤 3조"로 체험 중이에요 (저장되지 않아요)');
    return;
  }
  if (t.closest('#exitGuestBtn')) {
    guestMode = false;
    closePanel();
    closeModal();
    state = authActive() ? null : loadState();
    if (authActive()) return cloudOnAuth();
    return render();
  }

  if (t.closest('#sampleBtn')) {
    if (onlineMode()) {
      saveSuppressed = true; // 샘플을 만드는 동안 이 브라우저의 데이터를 덮어쓰지 않는다
      const ws = sampleWorkspace();
      saveSuppressed = false;
      return cloudCreateTeamFrom(ws);
    }
    state = sampleWorkspace();
    render();
    toast('샘플 팀 "캡스톤 3조"를 불러왔어요');
    return;
  }
  if (t.closest('#migrateBtn')) {
    const local = loadState();
    local.items.forEach(analyze);
    return cloudCreateTeamFrom(local);
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
      else {
        const wasPrivate = item.visibility === 'me';
        placeOnTable(item);
        toast(wasPrivate ? '🗂️ 회의 테이블에 올렸어요 · 👥 팀 공개로 바뀌었어요' : '🗂️ 회의 테이블에 올렸어요');
      }
    } else if (act.dataset.act === 'vote') {
      item.votes = item.votes.includes(state.meId) ? item.votes.filter(v => v !== state.meId) : [...item.votes, state.meId];
      saveState();
    } else if (act.dataset.act === 'pin') {
      member(item.memberId).pinnedIdeaId = item.id;
      saveState();
      toast('📌 화이트보드에 고정했어요');
    } else if (act.dataset.act === 'delete') {
      if (!confirm(`「${item.title}」을(를) 삭제할까요?\n팀·교수자 화면에서 바로 사라지고 이 기기에서도 지워져요.`)) return;
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
    if (onlineMode()) return cloudCreateTeam(data.get('team').trim(), [...new Set(names)], data.get('course').trim());
    state = newWorkspace(data.get('team').trim(), [...new Set(names)], data.get('course').trim());
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
    if (e.target.value === '__prof') return setViewer('prof');
    state.meId = e.target.value;
    state.viewer = 'student';
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
initAuth(cloudOnAuth);
