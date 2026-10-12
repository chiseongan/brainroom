// 팀트레이스 SSRD 반영 화면: 타임라인, 결정 기록, 기여 리포트, 퀘스트, AI 대화 불러오기, 교수자 보기.

let tlFilter = { member: 'all', type: 'all' };
let aiImport = null;   // 불러온 대화 파일에서 읽은 대화 목록
let profSel = 0;       // 교수자 보기에서 선택한 팀 (0 = 현재 워크스페이스)
let profCourse = 'all';

function fmtDate(ts, withTime = true) {
  const d = new Date(ts);
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  return withTime ? `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : date;
}

function visBadge(item) {
  const v = VISIBILITY[item.visibility] || VISIBILITY.team;
  return `<span class="vis-badge vis-${item.visibility}" title="공유 범위">${v.icon} ${v.label}</span>${importedBadge(item)}`;
}

// 팀장이 올린 기존 기록 (본인이 직접 올린 것이 아님을 기여 리포트에서도 알 수 있게)
function importedBadge(item) {
  return item.imported ? '<span class="vis-badge" title="팀장이 기존 데이터에서 가져온 기록">📥 가져온 기록</span>' : '';
}

function purposeChip(item) {
  if (item.type !== 'ai' || !item.ai) return '';
  const p = PURPOSE_BY_ID[item.ai.purpose] || PURPOSE_BY_ID.etc;
  return `<span class="chip">${p.emoji} ${p.label}</span><span class="chip ghost">${esc(item.ai.tool)}</span>`;
}

// 근거 링크: 원본 URL이 있으면 그 링크, 없으면 그 팀원의 방으로
function sourceLinkHTML(item) {
  const m = member(item.memberId);
  const label = `${TYPE_META[item.type].icon} ${esc(trunc(item.title, 28))} · ${esc(m?.name ?? '?')}`;
  return item.url
    ? `<a class="src-link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">🔗 ${label}</a>`
    : `<button class="src-link" data-go="room" data-member="${item.memberId}">🚪 ${label}</button>`;
}

// ---------- 팀원 현황 (RQ-8: 최근 활동 말풍선 + 상태 글자) ----------

function memberStatusHTML() {
  return `<div class="status-strip">${state.members.map(m => {
    const p = profile(m.id);
    const latest = p.items[0];
    return `
      <button class="status-chip" data-go="room" data-member="${m.id}" style="--mc:${m.color}">
        <span class="sc-name"><i class="dot"></i>${esc(m.name)}${m.id === state.meId ? ' (나)' : ''}</span>
        <span class="sc-state">${activityStatus(p)}</span>
        <span class="sc-bubble">💬 ${latest ? `${TYPE_META[latest.type].icon} ${esc(trunc(latest.title, 18))}` : '아직 기록 없음'}</span>
      </button>`;
  }).join('')}</div>`;
}

// ---------- 타임라인 (RQ-7) ----------

function renderTimeline() {
  const f = tlFilter;
  const rows = [
    ...visibleItems().map(i => ({ kind: 'item', at: i.createdAt, i })),
    ...confirmedDecisions().map(d => ({ kind: 'decision', at: d.createdAt, d })),
  ].filter(r => {
    if (f.type === 'decision' && r.kind !== 'decision') return false;
    if (f.type !== 'all' && f.type !== 'decision' && (r.kind !== 'item' || r.i.type !== f.type)) return false;
    if (f.member === 'all') return true;
    return r.kind === 'item' ? r.i.memberId === f.member : decisionSources(r.d).some(s => s.memberId === f.member);
  }).sort((a, b) => b.at - a.at);
  const hidden = state.items.length - visibleItems().length;

  const groups = [];
  rows.forEach(r => {
    const day = new Date(r.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    if (groups.at(-1)?.day !== day) groups.push({ day, rows: [] });
    groups.at(-1).rows.push(r);
  });

  app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>🕒 활동 타임라인</h1>
        <p class="muted">팀원이 담은 기록과 확정된 결정을 시간순으로 모았어요.</p>
      </div>
      <div class="filters">
        <label>팀원 <select id="tlMember">
          <option value="all">전체</option>
          ${state.members.map(m => `<option value="${m.id}" ${f.member === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select></label>
        <label>종류 <select id="tlType">
          <option value="all">전체</option>
          ${Object.entries(TYPE_META).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
          <option value="decision" ${f.type === 'decision' ? 'selected' : ''}>✅ 결정</option>
        </select></label>
      </div>
    </div>
    ${groups.map(g => `
      <h3 class="tl-day">${g.day}</h3>
      <div class="timeline">${g.rows.map(r => r.kind === 'decision' ? `
        <div class="tl-row decision">
          <span class="tl-time">${fmtDate(r.at).split(' ')[1]}</span>
          <div class="tl-body"><b>✅ 결정</b> ${esc(r.d.text)}
            <div class="src-list">${decisionSources(r.d).map(sourceLinkHTML).join('')}</div></div>
        </div>` : `
        <div class="tl-row" style="--mc:${member(r.i.memberId).color}">
          <span class="tl-time">${fmtDate(r.at).split(' ')[1]}</span>
          <div class="tl-body">
            <div class="tl-head"><span class="dot-name">${esc(member(r.i.memberId).name)}</span>
              <span class="tl-type">${TYPE_META[r.i.type].icon} ${TYPE_META[r.i.type].label}</span>${visBadge(r.i)}</div>
            <b>${esc(r.i.title)}</b> ${purposeChip(r.i)}
            ${r.i.url ? `<div>${sourceLinkHTML(r.i)}</div>` : ''}
          </div>
        </div>`).join('')}
      </div>`).join('') || '<p class="card muted">조건에 맞는 기록이 없어요.</p>'}
    ${hidden ? `<p class="muted sm tl-hidden">🔒 다른 팀원이 '나만'으로 둔 기록 ${hidden}건은 내용이 보이지 않아요.</p>` : ''}
  </section>`;
}

// ---------- 결정 기록 (RQ-9, ONRQ-2) ----------

function itemOptions(selected = '') {
  return visibleItems().sort((a, b) => b.createdAt - a.createdAt).map(i =>
    `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${TYPE_META[i.type].icon} ${esc(trunc(i.title, 30))} · ${esc(member(i.memberId).name)}</option>`).join('');
}

function renderDecisions() {
  const confirmed = confirmedDecisions();
  const cands = decisionCandidates();
  const review = decisionsNeedingReview();

  app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>✅ 결정 기록</h1>
        <p class="muted">메모·아이디어·AI 대화에서 "정한 것" 같은 문장을 찾아 후보로 보여줘요. 확정한 결정만 리포트와 초안 문서에 들어가요.</p>
      </div>
    </div>
    <div class="dec-layout">
      <div class="dec-main">
        <div class="card">
          <h3>확정된 결정 <span class="muted sm">${confirmed.length}건 · 근거 링크가 있는 결정만 보여요</span></h3>
          ${confirmed.map(d => `
            <div class="dec-row">
              <div class="dec-date">${fmtDate(d.createdAt, false)}</div>
              <div class="dec-body">
                <b>${esc(d.text)}</b>
                <div class="src-list">${decisionSources(d).map(sourceLinkHTML).join('')}</div>
              </div>
              <div class="dec-actions">
                <button class="btn sm" data-tr="dec-edit" data-dec="${d.id}">수정</button>
                <button class="btn sm" data-tr="dec-src" data-dec="${d.id}">근거 추가</button>
                <button class="btn sm danger" data-tr="dec-del" data-dec="${d.id}">삭제</button>
              </div>
            </div>`).join('') || '<p class="muted">아직 확정된 결정이 없어요. 아래 후보를 확정하거나 직접 추가해 보세요.</p>'}
        </div>

        <div class="card">
          <h3>🔎 결정 후보 <span class="muted sm">자동 추출 ${cands.length}건</span></h3>
          ${cands.map(c => `
            <div class="dec-row cand">
              <div class="dec-date">${fmtDate(c.createdAt, false)}</div>
              <div class="dec-body">
                <span>${esc(c.text)}</span>
                <div class="src-list">${sourceLinkHTML(itemById(c.itemId))}</div>
              </div>
              <div class="dec-actions">
                <button class="btn sm primary" data-tr="cand-ok" data-key="${c.key}">확정</button>
                <button class="btn sm" data-tr="cand-edit" data-key="${c.key}">고쳐서 확정</button>
                <button class="btn sm ghost" data-tr="cand-no" data-key="${c.key}">무시</button>
              </div>
            </div>`).join('') || '<p class="muted">"~하기로 했다", "결정", "확정" 같은 문장이 담기면 여기에 후보로 떠요.</p>'}
        </div>
      </div>

      <aside class="dec-side">
        <form id="decForm" class="card add-form">
          <h3>➕ 결정 직접 추가</h3>
          <textarea name="text" rows="3" maxlength="300" required placeholder="예: 1차 아이디어는 반찬 나눔 플랫폼으로 간다"></textarea>
          <label class="sm">근거 기록
            <select name="source"><option value="">(근거 없음 → 확인 필요로 이동)</option>${itemOptions()}</select></label>
          <button class="btn primary">추가</button>
        </form>
        <div class="card review">
          <h3>⚠️ 확인 필요 <span class="muted sm">${review.length}건</span></h3>
          <p class="muted sm">근거 링크가 없는 결정이에요. 리포트와 초안 문서에는 들어가지 않아요.</p>
          ${review.map(d => `
            <div class="dec-row">
              <div class="dec-body"><span>${esc(d.text)}</span></div>
              <div class="dec-actions">
                <button class="btn sm" data-tr="dec-src" data-dec="${d.id}">근거 연결</button>
                <button class="btn sm danger" data-tr="dec-del" data-dec="${d.id}">삭제</button>
              </div>
            </div>`).join('') || '<p class="muted sm">없어요 👍</p>'}
        </div>
      </aside>
    </div>
  </section>`;
}

function openDecisionSourceModal(decId) {
  const d = state.decisions.find(x => x.id === decId);
  openModal(`
    <h2>🔗 근거 기록 연결</h2>
    <p>${esc(d.text)}</p>
    <form id="decSrcForm" data-dec="${d.id}" class="add-form">
      <select name="source" required>${itemOptions()}</select>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">연결</button></div>
    </form>`);
}

// ---------- 기여 리포트 (RQ-10, RQ-12, RQ-14, ONRQ-3, LS-8) ----------

function countsLine(c) {
  return `
    <div class="count-row">
      ${Object.entries(TYPE_META).map(([k, v]) => `<span class="count"><span>${v.icon} ${v.label}</span><b>${c.byType[k] || 0}</b></span>`).join('')}
      <span class="count"><span>✅ 결정 근거</span><b>${c.decisionRefs}</b></span>
    </div>`;
}

function purposeChips(purposes) {
  const entries = Object.entries(purposes);
  return entries.length
    ? entries.sort((a, b) => b[1] - a[1]).map(([id, n]) => `<span class="chip">${PURPOSE_BY_ID[id].emoji} ${PURPOSE_BY_ID[id].label} <b>${n}</b></span>`).join('')
    : '<span class="muted sm">AI 대화 기록 없음</span>';
}

const NO_RECORD_NOTE = '이 팀원은 아직 BrainRoom에 담은 기록이 없어요. 이 화면은 담긴 기록만 집계하므로, 기여가 없다는 뜻이 아니에요.';

function renderReport() {
  const pending = state.corrections.filter(c => c.status === 'pending');
  app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>📊 기여 리포트</h1>
        <p class="muted">점수를 매기지 않아요. 팀원별로 남긴 기록의 종류와 근거 링크만 보여줘요. 최종 평가는 교수자가 해요.</p>
      </div>
      <button class="btn" data-tr="corr-open">✏️ 기여 보정 요청</button>
    </div>
    <div class="report-grid">
      ${state.members.map(m => {
        const c = memberCounts(state, m.id);
        const visible = itemsOf(m.id).sort((a, b) => b.createdAt - a.createdAt);
        const hidden = c.total - visible.length;
        return `
        <article class="card report-card" style="--mc:${m.color}">
          <header><h2><i class="dot"></i>${esc(m.name)}${m.id === state.meId ? ' <span class="badge">나</span>' : ''}</h2>
            <span class="muted sm">${activityStatus(profile(m.id))}</span></header>
          ${c.total ? '' : `<p class="notice">ℹ️ ${NO_RECORD_NOTE}</p>`}
          ${countsLine(c)}
          <h3>🖥️ AI 활용 목적</h3>
          <div class="chips">${purposeChips(c.purposes)}</div>
          <details>
            <summary>기록 내역 ${visible.length}건${hidden ? ` · 🔒 비공개 ${hidden}건` : ''}</summary>
            <ul class="src-ul">${visible.map(i => `<li><span class="muted sm">${fmtDate(i.createdAt, false)}</span> ${sourceLinkHTML(i)} ${purposeChip(i)}${importedBadge(i)}</li>`).join('') || '<li class="muted">보이는 기록 없음</li>'}</ul>
          </details>
        </article>`;
      }).join('')}
    </div>

    <div class="card corr-card">
      <h3>✏️ 보정 요청 <span class="muted sm">다른 팀원 한 명이 확인하면 반영돼요</span></h3>
      ${pending.map(c => `
        <div class="dec-row">
          <div class="dec-body">
            <b>${esc(member(c.memberId)?.name ?? '?')}</b>
            ${c.kind === 'missing'
              ? `빠진 기여 추가 요청: ${TYPE_META[c.type].icon} ${esc(c.title)}`
              : `분류 수정 요청: 「${esc(itemById(c.itemId)?.title ?? '삭제된 기록')}」 → ${TYPE_META[c.type].label}`}
            ${c.note ? `<div class="muted sm">${esc(c.note)}</div>` : ''}
          </div>
          <div class="dec-actions">
            ${c.memberId === state.meId
              ? '<span class="muted sm">다른 팀원 확인 대기</span><button class="btn sm ghost" data-tr="corr-del" data-corr="' + c.id + '">취소</button>'
              : `<button class="btn sm primary" data-tr="corr-ok" data-corr="${c.id}">확인하고 반영</button>`}
          </div>
        </div>`).join('') || '<p class="muted sm">대기 중인 요청이 없어요.</p>'}
      <details>
        <summary>변경 이력 ${state.changeLog.length}건</summary>
        <ul class="src-ul">${[...state.changeLog].reverse().map(l => `<li><span class="muted sm">${fmtDate(l.at)}</span> ${esc(l.text)}</li>`).join('') || '<li class="muted">없음</li>'}</ul>
      </details>
    </div>
  </section>`;
}

function openCorrectionModal() {
  const mine = state.items.filter(i => i.memberId === state.meId);
  const typeOpts = Object.entries(TYPE_META).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');
  openModal(`
    <h2>✏️ 기여 보정 요청</h2>
    <p class="muted">내 기록이 빠졌거나 잘못 분류됐을 때 요청하세요. 다른 팀원 한 명이 확인하면 반영되고 이력이 남아요.</p>
    <form id="corrForm" class="add-form">
      <div class="seg">
        <label><input type="radio" name="kind" value="missing" checked><span>빠진 기여 추가</span></label>
        <label><input type="radio" name="kind" value="reclass" ${mine.length ? '' : 'disabled'}><span>분류 수정</span></label>
      </div>
      <div data-kind="missing" class="add-form">
        <input name="title" maxlength="80" placeholder="빠진 기록 제목 (예: 3주차 회의록 작성)">
        <select name="mtype">${typeOpts}</select>
        <input name="url" maxlength="500" placeholder="근거 링크 (선택)">
      </div>
      <div data-kind="reclass" class="add-form" hidden>
        <select name="item">${mine.map(i => `<option value="${i.id}">${TYPE_META[i.type].icon} ${esc(trunc(i.title, 34))}</option>`).join('')}</select>
        <label class="sm">바꿀 분류 <select name="rtype">${typeOpts}</select></label>
      </div>
      <textarea name="note" rows="2" maxlength="300" placeholder="설명 (선택)"></textarea>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">요청하기</button></div>
    </form>`);
}

// ---------- 주차별 퀘스트 (RQ-13) ----------

function questRowHTML(q) {
  const { done, goal } = questProgress(q);
  const pct = Math.round((done / goal) * 100);
  return `
    <div class="quest">
      <div class="quest-head">
        ${q.target === 'manual'
          ? `<button class="btn icon" data-tr="quest-toggle" data-quest="${q.id}" title="완료 표시">${q.done ? '☑️' : '⬜'}</button>`
          : ''}
        <b>${esc(q.title)}</b>
        <span class="muted sm">${QUEST_TARGETS[q.target]}</span>
        <button class="btn icon" data-tr="quest-del" data-quest="${q.id}" title="퀘스트 삭제">✕</button>
      </div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <span class="sm">${done} / ${goal} ${pct >= 100 ? '· ✅ 달성' : `· ${pct}%`}</span>
    </div>`;
}

function questsHTML() {
  const now = weekStart();
  const current = state.quests.filter(q => q.week === now);
  const pastWeeks = [...new Set(state.quests.filter(q => q.week < now).map(q => q.week))].sort((a, b) => b - a);
  return `
  <section class="card quests">
    <h3>🎯 이번 주 퀘스트 <span class="muted sm">${weekLabel(now)} · 담긴 기록과 확정된 결정으로 진행률이 자동 계산돼요</span></h3>
    <div class="quest-list">${current.map(questRowHTML).join('') || '<p class="muted sm">이번 주 목표를 정해 보세요.</p>'}</div>
    <form id="questForm" class="inline-form quest-form">
      <input name="title" required maxlength="60" placeholder="목표 (예: 인터뷰 자료 5개 모으기)">
      <select name="target">${Object.entries(QUEST_TARGETS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input name="count" type="number" min="1" max="99" value="3" aria-label="목표 개수">
      <button class="btn">추가</button>
    </form>
    ${pastWeeks.map(w => `
      <details><summary>${weekLabel(w)}</summary>
        <div class="quest-list">${state.quests.filter(q => q.week === w).map(questRowHTML).join('')}</div>
      </details>`).join('')}
  </section>`;
}

// ---------- AI 대화 파일 불러오기 (RQ-5 대체 경로 = ONRQ-6) ----------

function openAiImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let list = [];
    try { list = parseAiExport(reader.result, file.name); } catch (e) { list = []; }
    if (!list.length) return toast('대화를 찾지 못했어요. conversations.json 또는 .txt/.md 파일을 골라 주세요');
    aiImport = list;
    renderAiImportModal();
  };
  reader.readAsText(file);
}

function renderAiImportModal() {
  const shown = aiImport.slice(0, 300);
  openModal(`
    <h2>🖥️ AI 대화 불러오기</h2>
    <p class="notice">✔ 체크한 대화만 저장돼요. 이메일·전화번호·주민등록번호 형태는 가린 뒤, 원문은 대화당 ${AI_TRANSCRIPT_LIMIT.toLocaleString()}자까지만 보관해요.</p>
    <input id="aiSearch" placeholder="제목·내용 검색…">
    <div class="ai-list">${shown.map((c, idx) => {
      const dup = findDuplicate({ memberId: state.meId, type: 'ai', title: c.title, url: '', sourceId: c.sourceId });
      return `
      <label class="ai-row ${dup ? 'dup' : ''}" data-search="${esc((c.title + ' ' + c.firstPrompt.slice(0, 200)).toLowerCase())}">
        <input type="checkbox" data-ai-idx="${idx}" ${dup ? 'disabled' : ''}>
        <span><b>${esc(c.title)}</b>
          <span class="muted sm">${esc(c.tool)} · ${fmtDate(c.createdAt, false)} · 메시지 ${c.messageCount}개${dup ? ' · 이미 담김' : ''}</span>
          <span class="sm ai-prev">${esc(trunc(c.firstPrompt.replace(/\s+/g, ' '), 90))}</span></span>
      </label>`;
    }).join('')}</div>
    ${aiImport.length > shown.length ? `<p class="muted sm">최근 ${shown.length}개만 표시했어요 (전체 ${aiImport.length}개).</p>` : ''}
    <div class="modal-actions ai-actions">
      <label class="sm">공유 범위 <select id="aiVis">${Object.entries(VISIBILITY).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}</select></label>
      <button class="btn ghost" data-close>취소</button>
      <button class="btn primary" data-tr="ai-go">선택한 대화 올리기</button>
    </div>`);
}

function importSelectedAi() {
  const picked = [...document.querySelectorAll('[data-ai-idx]:checked')].map(el => aiImport[+el.dataset.aiIdx]);
  if (!picked.length) return toast('올릴 대화를 골라 주세요');
  const visibility = $('#aiVis').value;
  picked.forEach(c => addItem({
    memberId: state.meId, type: 'ai', title: c.title, content: aiSummary(c.firstPrompt), createdAt: c.createdAt, visibility,
    ai: aiFields(c),
  }));
  aiImport = null;
  closeModal();
  toast(`🖥️ AI 대화 ${picked.length}개를 모니터에 담았어요`);
  render();
}

// ---------- 교수자 보기 (RQ-11, RQ-12, UI-4) ----------

function profTeams() {
  const files = loadProfTeams().map((ws, fileIdx) => ({ ws, kind: 'file', fileIdx }));
  if (state.cloudProf) return [...cloud.profTeams.map(ws => ({ ws, kind: 'cloud' })), ...files];
  return [{ ws: sanitizeForProf(state), kind: 'current' }, ...files];
}

function renderProfessor() {
  const all = profTeams();
  const courses = [...new Set(all.map(t => t.ws.course || '수업명 없음'))];
  const teams = all.map((t, idx) => ({ ...t, idx })).filter(t => profCourse === 'all' || (t.ws.course || '수업명 없음') === profCourse);
  if (!all[profSel]) profSel = 0;
  if (!all.length) {
    app.innerHTML = `
    <section class="setup"><div class="setup-card">
      <div class="logo">🎓</div><h1>교수자 보기</h1>
      <p class="lead">아직 볼 수 있는 팀이 없어요.<br>팀장에게 <b>교수자 초대 링크</b>를 받아 열거나, 팀 제출 파일을 추가하세요.</p>
      <label class="btn file-btn">📂 팀 제출 파일 추가<input type="file" accept=".json" id="profFile" hidden></label>
    </div></section>`;
    return;
  }
  const sel = all[profSel].ws;
  const st = teamStats(sel);

  app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>🎓 교수자 보기 · 팀별 현황</h1>
        <p class="muted">학생이 '교수자까지'로 고른 기록만 내용을 볼 수 있어요. 나머지는 횟수와 AI 사용 목적만 보여요. 점수는 표시하지 않아요.</p>
      </div>
      <div class="filters">
        <label>수업 <select id="profCourse"><option value="all">전체</option>
          ${courses.map(c => `<option ${profCourse === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        ${state.cloudProf ? '<button class="btn" data-cloud="refresh">🔄 새로고침</button>' : ''}
        <label class="btn file-btn">📂 팀 제출 파일 추가<input type="file" accept=".json" id="profFile" hidden></label>
      </div>
    </div>

    <div class="prof-grid">${teams.map(({ ws, kind, fileIdx, idx }) => {
      const s = teamStats(ws);
      return `
      <article class="card prof-card ${idx === profSel ? 'sel' : ''}">
        <header><h2>${esc(ws.teamName)}</h2><span class="muted sm">${esc(ws.course || '수업명 없음')}${{ current: ' · 이 워크스페이스', cloud: ' · 🌐 온라인' }[kind] || ` · ${fmtDate(ws.exportedAt, false)} 제출 파일`}</span></header>
        <div class="count-row">
          <span class="count"><span>이번 주 기록</span><b>${s.weekItems}</b></span>
          <span class="count"><span>이번 주 결정</span><b>${s.weekDecisions}</b></span>
          <span class="count"><span>전체 결정</span><b>${s.decisions}</b></span>
        </div>
        <p class="sm">참여 편중: <b class="bias bias-${s.bias.replace(/\s/g, '')}">${s.bias}</b>${s.sum ? ` · 최다 ${esc(s.top.m.name)} ${Math.round(s.topShare * 100)}%` : ''}</p>
        ${s.silent.length ? `<p class="sm muted">기록 없음: ${s.silent.map(m => esc(m.name)).join(', ')} (연동하지 않았을 수 있어요)</p>` : ''}
        <div class="modal-actions">
          ${kind === 'file' ? `<button class="btn sm ghost danger" data-tr="prof-del" data-idx="${fileIdx}">목록에서 빼기</button>` : ''}
          <button class="btn sm ${idx === profSel ? 'primary' : ''}" data-tr="prof-sel" data-idx="${idx}">자세히 보기</button>
        </div>
      </article>`;
    }).join('')}</div>

    <h2 class="prof-detail-title">${esc(sel.teamName)} 자세히</h2>
    <div class="report-grid">${sel.members.map(m => {
      const c = memberCounts(sel, m.id);
      const share = st.sum ? Math.round((c.total / st.sum) * 100) : 0;
      const open = c.items.filter(i => i.visibility === 'prof');
      return `
      <article class="card report-card" style="--mc:${m.color}">
        <header><h2><i class="dot"></i>${esc(m.name)}</h2><span class="muted sm">팀 기록 중 ${share}%</span></header>
        ${c.total ? '' : `<p class="notice">ℹ️ ${NO_RECORD_NOTE}</p>`}
        ${countsLine(c)}
        <h3>🖥️ AI 사용 ${c.byType.ai || 0}회 · 목적</h3>
        <div class="chips">${purposeChips(c.purposes)}</div>
        <details>
          <summary>공개된 기록 ${open.length}건 · 🔒 비공개 ${c.total - open.length}건</summary>
          <ul class="src-ul">${open.map(i => `
            <li><span class="muted sm">${fmtDate(i.createdAt, false)}</span> ${TYPE_META[i.type].icon} <b>${esc(i.title)}</b>
              ${i.url ? `<a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer">🔗 원본</a>` : ''}
              ${i.ai?.transcript ? `<details class="transcript"><summary>원문 보기</summary><pre>${esc(i.ai.transcript)}</pre></details>` : ''}</li>`).join('') || '<li class="muted">없음</li>'}</ul>
        </details>
      </article>`;
    }).join('')}</div>

    <div class="card">
      <h3>✅ 결정 기록</h3>
      ${(sel.decisions || []).filter(d => d.sourceIds.some(id => sel.items.some(i => i.id === id))).map(d => {
        const srcs = d.sourceIds.map(id => sel.items.find(i => i.id === id)).filter(Boolean);
        return `<div class="dec-row"><div class="dec-date">${fmtDate(d.createdAt, false)}</div><div class="dec-body"><b>${esc(d.text)}</b>
          <div class="src-list">${srcs.map(i => i.title
            ? `<span class="src-link">${TYPE_META[i.type].icon} ${esc(trunc(i.title, 28))}</span>`
            : `<span class="src-link muted">🔒 비공개 근거 (${TYPE_META[i.type].label})</span>`).join('')}</div></div></div>`;
      }).join('') || '<p class="muted">확정된 결정이 없어요.</p>'}
      ${sel.changeLog?.length ? `<details><summary>기여 보정 이력 ${sel.changeLog.length}건</summary>
        <ul class="src-ul">${sel.changeLog.map(l => `<li><span class="muted sm">${fmtDate(l.at)}</span> ${esc(l.text)}</li>`).join('')}</ul></details>` : ''}
    </div>
  </section>`;
}

function importProfTeam(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.members) || !Array.isArray(data.items)) throw new Error('형식 오류');
      // 학생용 전체 파일을 넣어도 교수자용으로 걸러서 보관한다
      const ws = data.forProfessor ? data : sanitizeForProf(migrate(data));
      const teams = loadProfTeams().filter(t => !(t.teamName === ws.teamName && t.course === ws.course));
      teams.push(ws);
      saveProfTeams(teams);
      profSel = profTeams().length - 1;
      render();
      toast(`「${ws.teamName}」 팀을 추가했어요`);
    } catch (e) {
      toast('불러올 수 없는 파일이에요');
    }
  };
  reader.readAsText(file);
}

function setViewer(viewer) {
  if (state.cloudProf || cloudOn()) {
    closeModal();
    if (viewer === 'prof') return toast('온라인 팀에서는 교수자 초대 링크로 들어온 계정만 교수자 보기를 쓸 수 있어요');
    const mine = Object.keys(cloud.myTeams).filter(id => cloud.myTeams[id].role === 'student');
    if (!mine.length) return toast('학생으로 참여한 온라인 팀이 없어요');
    cloudOpenTeam(loadPrefs().lastTeam && mine.includes(loadPrefs().lastTeam) ? loadPrefs().lastTeam : mine[0]);
    return render();
  }
  state.viewer = viewer;
  saveState();
  closePanel();
  closeModal();
  render();
  window.scrollTo(0, 0);
  toast(viewer === 'prof' ? '🎓 교수자 보기로 전환했어요' : '학생 보기로 돌아왔어요');
}

// ---------- 이벤트 ----------

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-tr]');
  if (!btn) return;
  const act = btn.dataset.tr;
  const cand = () => decisionCandidates().find(c => c.key === btn.dataset.key);
  const dec = () => state.decisions.find(d => d.id === btn.dataset.dec);

  if (act === 'cand-ok' || act === 'cand-edit') {
    const c = cand();
    if (!c) return;
    const text = act === 'cand-edit' ? prompt('결정 내용을 다듬어 주세요', c.text) : c.text;
    if (!text?.trim()) return;
    addDecision({ text, sourceIds: [c.itemId], origin: 'auto', candidateKey: c.key });
    toast('✅ 결정으로 확정했어요');
  } else if (act === 'cand-no') {
    state.decisionDismissed.push(btn.dataset.key);
    saveState();
  } else if (act === 'dec-edit') {
    const d = dec();
    const text = prompt('결정 내용 수정', d.text);
    if (!text?.trim()) return;
    d.text = maskPII(text).trim();
    saveState();
  } else if (act === 'dec-del') {
    if (!confirm('이 결정을 삭제할까요?')) return;
    state.decisions = state.decisions.filter(d => d.id !== btn.dataset.dec);
    saveState();
  } else if (act === 'dec-src') {
    return openDecisionSourceModal(btn.dataset.dec);
  } else if (act === 'rank-decide') {
    const item = itemById(btn.dataset.item);
    const text = prompt('회의 결정으로 기록할 내용', `「${item.title}」을(를) 우선 검토한다`);
    if (!text?.trim()) return;
    addDecision({ text, sourceIds: [item.id], origin: 'vote' });
    toast('✅ 결정 기록에 추가했어요');
  } else if (act === 'quest-toggle') {
    const q = state.quests.find(x => x.id === btn.dataset.quest);
    q.done = !q.done;
    saveState();
  } else if (act === 'quest-del') {
    state.quests = state.quests.filter(x => x.id !== btn.dataset.quest);
    saveState();
  } else if (act === 'corr-open') {
    return openCorrectionModal();
  } else if (act === 'corr-ok') {
    const c = state.corrections.find(x => x.id === btn.dataset.corr);
    if (c && applyCorrection(c, state.meId)) toast('보정 요청을 반영했어요');
    else toast('대상 기록이 없어 반영할 수 없어요');
  } else if (act === 'corr-del') {
    state.corrections = state.corrections.filter(x => x.id !== btn.dataset.corr);
    saveState();
  } else if (act === 'ai-go') {
    return importSelectedAi();
  } else if (act === 'prof-sel') {
    profSel = +btn.dataset.idx;
  } else if (act === 'prof-del') {
    const teams = loadProfTeams();
    teams.splice(+btn.dataset.idx, 1);
    saveProfTeams(teams);
    profSel = 0;
  } else if (act === 'enter-prof') {
    return setViewer('prof');
  } else if (act === 'leave-prof') {
    return setViewer('student');
  }
  render();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.classList.contains('vis-select')) {
    const item = itemById(t.closest('[data-id]').dataset.id);
    item.visibility = t.value;
    if (t.value === 'me' && item.table) item.table = null; // 나만 보기로 바꾸면 회의 테이블에서도 내린다
    saveState();
    toast(`${VISIBILITY[t.value].icon} 공유 범위: ${VISIBILITY[t.value].label}`);
    render();
  } else if (t.classList.contains('purpose-select')) {
    itemById(t.closest('[data-id]').dataset.id).ai.purpose = t.value;
    saveState();
    render();
  } else if (t.id === 'tlMember' || t.id === 'tlType') {
    tlFilter[t.id === 'tlMember' ? 'member' : 'type'] = t.value;
    render();
  } else if (t.id === 'aiFile' && t.files[0]) {
    openAiImport(t.files[0]);
    t.value = '';
  } else if (t.id === 'profFile' && t.files[0]) {
    importProfTeam(t.files[0]);
  } else if (t.id === 'profCourse') {
    profCourse = t.value;
    render();
  } else if (t.name === 'kind' && t.closest('#corrForm')) {
    document.querySelectorAll('#corrForm [data-kind]').forEach(el => { el.hidden = el.dataset.kind !== t.value; });
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'aiSearch') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.ai-row').forEach(el => { el.hidden = q && !el.dataset.search.includes(q); });
});

document.addEventListener('submit', e => {
  const form = e.target;
  const data = new FormData(form);
  if (form.id === 'decForm') {
    const source = data.get('source');
    addDecision({ text: data.get('text'), sourceIds: source ? [source] : [] });
    toast(source ? '✅ 결정을 추가했어요' : '⚠️ 근거가 없어 확인 필요 목록에 넣었어요');
  } else if (form.id === 'decSrcForm') {
    const d = state.decisions.find(x => x.id === form.dataset.dec);
    if (!d.sourceIds.includes(data.get('source'))) d.sourceIds.push(data.get('source'));
    saveState();
    closeModal();
  } else if (form.id === 'questForm') {
    state.quests.push({
      id: uid(), week: weekStart(), title: data.get('title').trim(), target: data.get('target'),
      count: data.get('target') === 'manual' ? 1 : clamp(parseInt(data.get('count'), 10) || 1, 1, 99), done: false,
    });
    saveState();
  } else if (form.id === 'corrForm') {
    const kind = data.get('kind');
    const c = { id: uid(), memberId: state.meId, requesterUid: authUser?.uid ?? null, kind, note: data.get('note').trim(), status: 'pending', createdAt: Date.now() };
    if (kind === 'missing') {
      const title = data.get('title').trim();
      if (!title) return toast('빠진 기록의 제목을 적어 주세요');
      Object.assign(c, { title, type: data.get('mtype'), url: data.get('url').trim() });
    } else {
      Object.assign(c, { itemId: data.get('item'), type: data.get('rtype') });
    }
    state.corrections.push(c);
    saveState();
    closeModal();
    toast('보정 요청을 보냈어요. 다른 팀원이 확인하면 반영돼요');
  } else {
    return;
  }
  render();
});
