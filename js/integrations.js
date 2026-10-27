// 외부 도구 연동: GitHub · Figma · Notion (RQ-2, RQ-3, ONRQ-1, ONRQ-3)
// - 각자 본인 토큰으로 연결하고 '본인 작업만' 가져온다. (보안 규칙상 남의 이름으로는 기록을 만들 수 없다)
// - 세 서비스 모두 브라우저에서 공식 API를 바로 부를 수 있다(CORS 허용). 서버 없음.
// - 토큰은 이 브라우저(localStorage)에만 저장하고 팀·Firestore에는 올리지 않는다.
// - 무엇을 볼지(저장소·파일·페이지)는 방 공용 설정 state.links, 누구로 볼지(토큰·계정)는 각자 설정.
// 가져온 기록은 종류 'work'(🛠️ 작업 기록), id는 원본 기준이라 다시 가져와도 중복되지 않는다.

const INTEG_KEY = 'brainroom:integrations'; // { github: { token, login }, figma: { token, userId, handle }, notion: { token, userId, userName }, lastSync: { [방]: 시각 } }
const SYNC_EVERY_MS = 15 * 60 * 1000;      // LS-2: 새 활동은 15분 안에
const SYNC_DAYS = 30;                       // 최근 30일 작업만
const SOURCES = {
  github: { icon: '🐙', name: 'GitHub', decor: 'laptop' },
  figma: { icon: '🎨', name: 'Figma', decor: 'art' },
  notion: { icon: '📝', name: 'Notion', decor: 'papers' },
};

function loadInteg() {
  try { return JSON.parse(localStorage.getItem(INTEG_KEY)) || {}; } catch (e) { return {}; }
}

function saveInteg(next) {
  try { localStorage.setItem(INTEG_KEY, JSON.stringify(next)); } catch (e) { /* 무시 */ }
}

function syncKey() {
  return state?.teamId || 'local';
}

// ---------- 링크 해석 ----------

function parseRepo(text) {
  const m = (text || '').trim().match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/);
  return m ? `${m[1]}/${m[2]}` : '';
}

function parseFigmaKey(text) {
  const m = (text || '').match(/figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/);
  return m ? m[1] : /^[A-Za-z0-9]{15,}$/.test((text || '').trim()) ? text.trim() : '';
}

function parseNotionId(text) {
  const hex = (text || '').replace(/-/g, '').match(/[0-9a-f]{32}(?=[^0-9a-f]*$|\?|#)/i)?.[0] || (text || '').replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0];
  return hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase() : '';
}

// ---------- API ----------

class ApiError extends Error {
  constructor(source, status, detail) {
    super(`${SOURCES[source].name} ${status}${detail ? `: ${detail}` : ''}`);
    this.source = source;
    this.status = status;
  }
}

async function apiGet(source, url, token, init = {}) {
  const headers = {
    github: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    figma: { 'X-Figma-Token': token },
    notion: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
  }[source];
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* 무시 */ }
    throw new ApiError(source, res.status, detail);
  }
  return res.json();
}

const gh = (path, token) => apiGet('github', `https://api.github.com${path}`, token);
const fg = (path, token) => apiGet('figma', `https://api.figma.com/v1${path}`, token);
const nt = (path, token, body) => apiGet('notion', `https://api.notion.com/v1${path}`, token, body ? { method: 'POST', body: JSON.stringify(body) } : {});

// ---------- 기록 만들기 ----------

// 하루 단위 묶음은 사용자 현지 날짜로 (UTC로 자르면 한국 시간 오전 9시 전 작업이 전날로 묶인다)
const dayKey = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

// 작업 기록의 핵심 키워드: 안내 문구·커밋 머리말 같은 군더더기를 뺀 '핵심 글'에서 뽑는다
const WORK_NOISE = new Set(['feat', 'fix', 'chore', 'refactor', 'style', 'docs', 'test', 'merge', 'pull', 'request', 'branch',
  'add', 'added', 'update', 'updated', 'remove', 'removed', 'change', 'changed', 'commit', 'main', 'master', 'wip',
  '수정', '추가', '변경', '삭제', '업데이트', '반영', '작업', '버전', '댓글', '페이지', '자동', '저장']);

function coreKeywords(text, n = 6) {
  const clean = String(text || '')
    .replace(/^\s*co-authored-by:.*$/gim, '')
    .replace(/^\s*(feat|fix|chore|refactor|style|docs|test|perf|build|ci)(\([^)]*\))?!?:\s*/gim, '')
    .replace(/🤖.*$/gm, '');
  // 영어 머리말(fix 등)도 물품(공구함)과 이어지게 머리말 단어 자체는 남겨서 한 번 센다
  const prefix = (String(text || '').match(/^\s*(fix|docs|test)\b/i) || [])[1];
  // 댓글은 말투가 섞여서 "~해요", "~했어요" 같은 말끝은 뺀다
  const kws = extractKeywords(clean, 20).filter(k => !WORK_NOISE.has(k) && !/(요|니다|습니다|죠|네|해서|하고)$/.test(k));
  return [...new Set([...(prefix ? [prefix.toLowerCase()] : []), ...kws])].slice(0, n);
}

// 저장된 키워드가 없으면(이 기능 전에 가져온 작업) 제목에서 다시 뽑는다
function workKeywords(item) {
  return item.work?.keywords || coreKeywords(item.title);
}

// 같은 id가 있으면(내 것일 때만) 내용을 고치고, 없으면 새로 담는다. 바뀐 게 있으면 true
// core: 키워드를 뽑을 핵심 글 (커밋 메시지, 파일·버전 이름, 페이지 제목, 댓글)
function upsertWork({ core, ...item }) {
  item.work = { ...item.work, keywords: coreKeywords(maskPII(core ?? item.title)) };
  const ex = itemById(item.id);
  if (ex) {
    if (ex.memberId !== state.meId || ex._stub) return false;
    if (ex.title === item.title && ex.content === item.content && ex.createdAt === item.createdAt) return false;
    Object.assign(ex, { title: item.title, content: item.content, createdAt: item.createdAt, url: item.url, work: item.work });
    analyze(ex);
    ex.keywords = item.work.keywords;
    return true;
  }
  const fresh = analyze({ visibility: 'team', table: null, votes: [], memberId: state.meId, ...item, title: maskPII(item.title), content: maskPII(item.content) });
  fresh.keywords = item.work.keywords; // 안내 문구가 아니라 작업 내용의 핵심 키워드
  state.items.push(fresh);
  return true;
}

const AI_TRAILER = /co-authored-by:[^\n]*(claude|copilot|chatgpt|openai|gemini|anthropic|cursor|codex)|generated with \[?(claude|copilot|chatgpt|cursor|codex)/i;

async function syncGithub(conf, repo, since) {
  if (!conf.login) return 0;
  let n = 0;
  const commits = await gh(`/repos/${repo}/commits?author=${encodeURIComponent(conf.login)}&since=${new Date(since).toISOString()}&per_page=100`, conf.token);
  for (const c of commits) {
    const [first, ...rest] = c.commit.message.split('\n');
    const ai = AI_TRAILER.test(c.commit.message);
    if (upsertWork({
      id: `gh_${c.sha.slice(0, 16)}`, type: 'work', title: first.slice(0, 80) || '(메시지 없음)', core: c.commit.message,
      content: `커밋 · ${repo}${ai ? ' · 🤖 AI와 함께 작성' : ''}\n${rest.join('\n').replace(/^\s*co-authored-by:.*$/gim, '').trim().slice(0, 400)}`.trim(),
      url: c.html_url, createdAt: Date.parse(c.commit.author.date),
      work: { source: 'github', kind: 'commit', repo, ai },
    })) n++;
  }
  const pulls = await gh(`/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=50`, conf.token);
  for (const p of pulls) {
    if (p.user?.login?.toLowerCase() !== conf.login.toLowerCase() || Date.parse(p.created_at) < since) continue;
    if (upsertWork({
      id: `ghpr_${repo.replace('/', '_')}_${p.number}`, type: 'work', title: `PR #${p.number} ${p.title}`.slice(0, 80), core: `${p.title}\n${p.body || ''}`,
      content: `풀 리퀘스트 · ${repo} · ${p.merged_at ? '병합됨' : p.state === 'open' ? '열림' : '닫힘'}`,
      url: p.html_url, createdAt: Date.parse(p.created_at), work: { source: 'github', kind: 'pr', repo },
    })) n++;
  }
  return n;
}

async function syncFigma(conf, keys, since) {
  if (!conf.userId) return 0;
  let n = 0;
  for (const key of keys) {
    const [file, versions, comments] = await Promise.all([
      fg(`/files/${key}?depth=1`, conf.token), fg(`/files/${key}/versions`, conf.token), fg(`/files/${key}/comments`, conf.token),
    ]);
    const url = `https://www.figma.com/design/${key}`;
    // 자동 저장이 많아서 하루 단위로 묶는다
    const byDay = new Map();
    (versions.versions || []).filter(v => v.user?.id === conf.userId && Date.parse(v.created_at) >= since).forEach(v => {
      const d = dayKey(Date.parse(v.created_at));
      const g = byDay.get(d) || { at: 0, count: 0, labels: [] };
      g.count++;
      g.at = Math.max(g.at, Date.parse(v.created_at));
      if (v.label) g.labels.push(v.label);
      byDay.set(d, g);
    });
    for (const [d, g] of byDay) {
      if (upsertWork({
        id: `fg_${key}_${d}`, type: 'work', title: `${file.name} 디자인 작업`.slice(0, 80), core: `${file.name} design ${g.labels.join(' ')}`,
        content: `Figma · 버전 ${g.count}개${g.labels.length ? ` · ${g.labels.join(', ')}` : ''}`,
        url, createdAt: g.at, work: { source: 'figma', kind: 'version', file: key, count: g.count },
      })) n++;
    }
    const cByDay = new Map();
    (comments.comments || []).filter(c => c.user?.id === conf.userId && Date.parse(c.created_at) >= since).forEach(c => {
      const d = dayKey(Date.parse(c.created_at));
      const g = cByDay.get(d) || { at: 0, msgs: [] };
      g.at = Math.max(g.at, Date.parse(c.created_at));
      g.msgs.push(c.message);
      cByDay.set(d, g);
    });
    for (const [d, g] of cByDay) {
      if (upsertWork({
        id: `fgc_${key}_${d}`, type: 'work', title: `${file.name} 댓글 ${g.msgs.length}개`.slice(0, 80), core: `${file.name}\n${g.msgs.join('\n')}`,
        content: `Figma 댓글\n${g.msgs.map(m => `- ${m}`).join('\n').slice(0, 500)}`,
        url, createdAt: g.at, work: { source: 'figma', kind: 'comment', file: key },
      })) n++;
    }
  }
  return n;
}

function notionTitle(page) {
  const prop = Object.values(page.properties || {}).find(p => p.type === 'title');
  return prop?.title?.map(t => t.plain_text).join('') || '제목 없음';
}

async function syncNotion(conf, ids, since) {
  if (!conf.userId) return 0;
  let n = 0;
  const notePage = async page => {
    const t = Date.parse(page.last_edited_time);
    if (page.last_edited_by?.id !== conf.userId || t < since) return;
    if (upsertWork({
      id: `nt_${page.id.replace(/-/g, '')}_${dayKey(t)}`, type: 'work', title: `${notionTitle(page)} 수정`.slice(0, 80), core: notionTitle(page),
      content: 'Notion · 페이지 수정 (그날 마지막으로 고친 사람이 나일 때 기록돼요)', url: page.url, createdAt: t,
      work: { source: 'notion', kind: 'edit', page: page.id },
    })) n++;
  };
  for (const id of ids) {
    let page = null;
    try {
      page = await nt(`/pages/${id}`, conf.token);
    } catch (e) {
      if (e.status !== 400 && e.status !== 404) throw e;
    }
    if (page) {
      await notePage(page);
    } else {
      // 페이지가 아니면 데이터베이스로 보고 최근 수정된 항목들을 본다
      const res = await nt(`/databases/${id}/query`, conf.token, {
        filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: new Date(since).toISOString() } }, page_size: 50,
      });
      for (const p of res.results || []) await notePage(p);
    }
    const comments = await nt(`/comments?block_id=${id}`, conf.token).catch(() => ({ results: [] }));
    const mine = (comments.results || []).filter(c => c.created_by?.id === conf.userId && Date.parse(c.created_time) >= since);
    const byDay = new Map();
    mine.forEach(c => {
      const d = dayKey(Date.parse(c.created_time));
      const g = byDay.get(d) || { at: 0, msgs: [] };
      g.at = Math.max(g.at, Date.parse(c.created_time));
      g.msgs.push(c.rich_text.map(r => r.plain_text).join(''));
      byDay.set(d, g);
    });
    for (const [d, g] of byDay) {
      if (upsertWork({
        id: `ntc_${id.replace(/-/g, '')}_${d}`, type: 'work', title: `Notion 댓글 ${g.msgs.length}개`, core: g.msgs.join('\n'),
        content: `Notion 댓글\n${g.msgs.map(m => `- ${m}`).join('\n').slice(0, 500)}`,
        url: `https://www.notion.so/${id.replace(/-/g, '')}`, createdAt: g.at, work: { source: 'notion', kind: 'comment', page: id },
      })) n++;
    }
  }
  return n;
}

// ---------- 가져오기 ----------

let workTimer = null;
let workRunning = false;

function scheduleWorkSync() {
  clearTimeout(workTimer);
  workTimer = setTimeout(() => syncAllWork(false), 4000);
}

// 연결 상태를 명단의 내 칸에 남긴다 → 리포트에서 '연동 안 됨'(ONRQ-3), '재연결 필요'(ONRQ-1) 표시
function setMyConnection(source, status) {
  const me = member(state.meId);
  if (!me) return;
  me.connections = { ...(me.connections || {}), [source]: status };
  if (!status) delete me.connections[source];
}

async function syncAllWork(manual) {
  if (workRunning || !state?.meId || isProfView() || guestMode || (state.teamId && !cloud.loaded)) return;
  const conf = loadInteg();
  const last = conf.lastSync?.[syncKey()] || 0;
  if (!manual && Date.now() - last < SYNC_EVERY_MS) return;
  const links = state.links || {};
  const since = Date.now() - SYNC_DAYS * 864e5;
  const jobs = [];
  if (links.github && conf.github?.login) jobs.push(['github', () => syncGithub(conf.github, links.github, since)]);
  if (links.figma?.length && conf.figma?.token) jobs.push(['figma', () => syncFigma(conf.figma, links.figma, since)]);
  if (links.notion?.length && conf.notion?.token) jobs.push(['notion', () => syncNotion(conf.notion, links.notion, since)]);
  if (!jobs.length) { if (manual) toast('연결된 도구가 없어요. 방 설정과 내 연결을 확인해 주세요'); return; }
  workRunning = true;
  const results = [];
  for (const [source, run] of jobs) {
    try {
      const n = await run();
      setMyConnection(source, 'ok');
      results.push(`${SOURCES[source].name} ${n}개`);
    } catch (e) {
      console.error(e);
      const auth = e.status === 401 || e.status === 403;
      setMyConnection(source, auth ? 'error' : 'ok');
      results.push(`${SOURCES[source].name} ${auth ? '재연결 필요' : '실패'}`);
      if (auth) toast(`${SOURCES[source].icon} ${SOURCES[source].name} 연결이 끊겼어요. 🔌 연동에서 다시 연결해 주세요`);
    }
  }
  saveInteg({ ...loadInteg(), lastSync: { ...(loadInteg().lastSync || {}), [syncKey()]: Date.now() } });
  saveState();
  workRunning = false;
  if (manual || results.some(r => !/ 0개$/.test(r))) toast(`🔌 가져오기: ${results.join(' · ')}`);
  render();
}

// ---------- 방에 놓기 (decor.js의 사물 재사용: GitHub → 노트북, Figma → 그림 이젤, Notion → 서류 더미) ----------

function roomWorkDecor(works) {
  const out = [];
  for (const [source, s] of Object.entries(SOURCES)) {
    const items = works.filter(w => w.work?.source === source);
    if (items.length) out.push({ decor: DECOR_BY_ID[s.decor], words: [`${s.name} 작업`], count: 1000 + items.length, items });
  }
  return out;
}

// ---------- 🔌 연동 화면 ----------

function connectionBadge(status) {
  return { ok: '<span class="vis-badge vis-prof">✅ 연결됨</span>', error: '<span class="vis-badge" style="background:#fee2e2;color:#991b1b">⚠️ 재연결 필요</span>' }[status]
    || '<span class="vis-badge vis-me">연동 안 됨</span>';
}

function renderIntegrations() {
  const conf = loadInteg();
  const links = state.links || {};
  const me = member(state.meId);
  const my = me?.connections || {};
  const last = conf.lastSync?.[syncKey()];
  const list = (kind, items, label) => (items || []).map((v, i) => `
    <li><code>${esc(label(v))}</code> <button class="btn icon" data-ig="unlink:${kind}:${i}" title="빼기">✕</button></li>`).join('') || '<li class="muted sm">아직 없어요</li>';

  app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>🔌 연동</h1>
        <p class="muted">각자 <b>본인 토큰</b>으로 연결하고, <b>본인 작업만</b> 가져와요. 토큰은 이 브라우저에만 저장되고 팀·서버로 올라가지 않아요. 최근 ${SYNC_DAYS}일 작업을 15분마다 가져와요.</p>
      </div>
      <div class="filters">
        <span class="muted sm">${last ? `마지막으로 가져온 시각 ${fmtDate(last)}` : '아직 가져온 적 없어요'}</span>
        <button class="btn primary" data-ig="sync">지금 가져오기</button>
      </div>
    </div>

    <div class="integ-grid">
      <article class="card integ">
        <header><h2>🐙 GitHub</h2>${connectionBadge(my.github)}</header>
        <p class="muted sm">내 커밋과 풀 리퀘스트를 가져와요. 커밋에 AI 공동 작성 표시(Co-Authored-By: Claude 등)가 있으면 🤖로 알려줘요.</p>
        <h3>방 공용 · 저장소</h3>
        <form class="inline-form" data-ig-form="github-repo"><input name="v" placeholder="github.com/팀/저장소 또는 팀/저장소" value="${esc(links.github || '')}"><button class="btn">저장</button></form>
        <h3>내 연결</h3>
        <form class="add-form" data-ig-form="github-me">
          <input name="login" placeholder="내 GitHub 아이디 (토큰을 넣으면 자동)" value="${esc(conf.github?.login || '')}">
          <input name="token" type="password" autocomplete="off" placeholder="토큰 (비공개 저장소일 때만, 읽기 전용)" value="${conf.github?.token ? '••••••••' : ''}">
          <div class="modal-actions">${conf.github ? '<button type="button" class="btn ghost sm" data-ig="disconnect:github">연결 해제</button>' : ''}<button class="btn primary">연결</button></div>
        </form>
        <details class="sm"><summary>토큰 만드는 법</summary>
          <p>공개 저장소는 토큰 없이 아이디만 넣으면 돼요. 비공개 저장소는 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub → Fine-grained token</a>에서 그 저장소만 고르고, 권한은 <b>Contents · Pull requests · Metadata 읽기</b>만 주세요.</p></details>
      </article>

      <article class="card integ">
        <header><h2>🎨 Figma</h2>${connectionBadge(my.figma)}</header>
        <p class="muted sm">지정한 파일에서 내가 만든 버전(하루 단위로 묶음)과 내 댓글을 가져와요.</p>
        <h3>방 공용 · 파일</h3>
        <ul class="integ-list">${list('figma', links.figma, v => v)}</ul>
        <form class="inline-form" data-ig-form="figma-file"><input name="v" placeholder="Figma 파일 링크 붙여넣기"><button class="btn">추가</button></form>
        <h3>내 연결</h3>
        <form class="add-form" data-ig-form="figma-me">
          <input name="token" type="password" autocomplete="off" placeholder="Figma 개인 액세스 토큰" value="${conf.figma?.token ? '••••••••' : ''}">
          ${conf.figma?.handle ? `<p class="sm">연결된 계정: <b>${esc(conf.figma.handle)}</b></p>` : ''}
          <div class="modal-actions">${conf.figma ? '<button type="button" class="btn ghost sm" data-ig="disconnect:figma">연결 해제</button>' : ''}<button class="btn primary">연결</button></div>
        </form>
        <details class="sm"><summary>토큰 만드는 법</summary>
          <p>Figma → 왼쪽 위 계정 메뉴 → <b>Settings → Security → Personal access tokens</b>에서 만들어요. 권한은 <b>current_user, file_content, file_versions, file_comments 읽기</b>만 주세요.</p></details>
      </article>

      <article class="card integ">
        <header><h2>📝 Notion</h2>${connectionBadge(my.notion)}</header>
        <p class="muted sm">지정한 페이지·데이터베이스에서 <b>내가 마지막으로 고친 날</b>과 내 댓글을 가져와요. (Notion API는 수정한 사람을 '마지막 수정자'만 알려줘요)</p>
        <h3>방 공용 · 페이지</h3>
        <ul class="integ-list">${list('notion', links.notion, v => v)}</ul>
        <form class="inline-form" data-ig-form="notion-page"><input name="v" placeholder="Notion 페이지·DB 링크 붙여넣기"><button class="btn">추가</button></form>
        <h3>내 연결</h3>
        <form class="add-form" data-ig-form="notion-me">
          <input name="token" type="password" autocomplete="off" placeholder="Notion 통합 시크릿 (ntn_… / secret_…)" value="${conf.notion?.token ? '••••••••' : ''}">
          ${conf.notion?.users ? `<label class="sm">Notion에서 나는 누구인가요?
            <select name="user">${conf.notion.users.map(u => `<option value="${u.id}" ${u.id === conf.notion.userId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : ''}
          <div class="modal-actions">${conf.notion ? '<button type="button" class="btn ghost sm" data-ig="disconnect:notion">연결 해제</button>' : ''}<button class="btn primary">${conf.notion?.users ? '저장' : '연결'}</button></div>
        </form>
        <details class="sm"><summary>연결하는 법</summary>
          <p>1) <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noopener noreferrer">Notion 통합</a>에서 <b>새 내부 통합</b>을 만들고, 기능은 <b>콘텐츠 읽기 · 댓글 읽기 · 사용자 정보 읽기</b>만 켜요.<br>
          2) 팀 페이지에서 오른쪽 위 <b>••• → 연결 → 방금 만든 통합</b>을 추가해요.<br>3) 시크릿을 붙여넣고 연결한 뒤 '나는 누구'를 골라요.</p></details>
      </article>
    </div>

    <div class="card">
      <h3>팀원 연결 상태 <span class="muted sm">연동 안 된 팀원은 리포트에서 "기여 없음"이 아니라 "연동 안 됨"으로 보여요</span></h3>
      <div class="integ-status">${state.members.map(m => `
        <div><b>${esc(m.name)}</b> ${Object.entries(SOURCES).map(([k, s]) => `<span class="sm">${s.icon} ${s.name} ${connectionBadge(m.connections?.[k])}</span>`).join(' ')}</div>`).join('')}</div>
    </div>
  </section>`;
}

// ---------- 이벤트 ----------

document.addEventListener('submit', async e => {
  const form = e.target;
  const kind = form.dataset.igForm;
  if (!kind) return;
  e.preventDefault();
  const data = new FormData(form);
  const v = (data.get('v') || '').trim();
  const conf = loadInteg();
  const keepToken = (old, typed) => (typed && !/^•+$/.test(typed) ? typed.trim() : old);
  state.links ||= {};
  try {
    if (kind === 'github-repo') {
      const repo = parseRepo(v);
      if (v && !repo) return toast('저장소를 "팀/저장소" 형태로 넣어 주세요');
      state.links.github = repo;
      saveState();
      toast(repo ? `🐙 저장소 ${repo} 를 방에 연결했어요` : '저장소 연결을 뺐어요');
    } else if (kind === 'figma-file' || kind === 'notion-page') {
      const key = kind === 'figma-file' ? 'figma' : 'notion';
      const id = key === 'figma' ? parseFigmaKey(v) : parseNotionId(v);
      if (!id) return toast(key === 'figma' ? 'Figma 파일 링크를 확인해 주세요' : 'Notion 페이지 링크를 확인해 주세요');
      state.links[key] = [...new Set([...(state.links[key] || []), id])];
      saveState();
      toast('방에 추가했어요');
    } else if (kind === 'github-me') {
      const token = keepToken(conf.github?.token, data.get('token'));
      let login = (data.get('login') || '').trim();
      if (token) login = (await gh('/user', token)).login;
      if (!login) return toast('GitHub 아이디를 넣어 주세요');
      conf.github = { token: token || '', login };
      saveInteg(conf);
      setMyConnection('github', 'ok');
      saveState();
      toast(`🐙 ${login} 로 연결했어요`);
    } else if (kind === 'figma-me') {
      const token = keepToken(conf.figma?.token, data.get('token'));
      if (!token) return toast('Figma 토큰을 넣어 주세요');
      const meF = await fg('/me', token);
      conf.figma = { token, userId: meF.id, handle: meF.handle };
      saveInteg(conf);
      setMyConnection('figma', 'ok');
      saveState();
      toast(`🎨 ${meF.handle} 로 연결했어요`);
    } else if (kind === 'notion-me') {
      const token = keepToken(conf.notion?.token, data.get('token'));
      if (!token) return toast('Notion 시크릿을 넣어 주세요');
      const users = (await nt('/users?page_size=100', token)).results.filter(u => u.type === 'person').map(u => ({ id: u.id, name: u.name || u.person?.email || u.id }));
      const userId = data.get('user') || conf.notion?.userId || (users.length === 1 ? users[0].id : '');
      conf.notion = { token, users, userId, userName: users.find(u => u.id === userId)?.name || '' };
      saveInteg(conf);
      if (userId) { setMyConnection('notion', 'ok'); saveState(); }
      toast(userId ? `📝 ${conf.notion.userName} 로 연결했어요` : '📝 연결했어요. 아래에서 Notion의 나를 골라 주세요');
    }
  } catch (err) {
    console.error(err);
    toast(err instanceof ApiError
      ? `${err.message} — ${err.status === 401 || err.status === 403 ? '토큰이나 권한을 확인해 주세요' : '링크와 권한(통합 연결)을 확인해 주세요'}`
      : '연결하지 못했어요. 인터넷 연결을 확인해 주세요');
  }
  render();
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-ig]');
  if (!btn) return;
  const [act, a, b] = btn.dataset.ig.split(':');
  if (act === 'sync') return syncAllWork(true);
  if (act === 'unlink') {
    state.links[a] = (state.links[a] || []).filter((_, i) => i !== +b);
    saveState();
  } else if (act === 'disconnect') {
    const conf = loadInteg();
    delete conf[a];
    saveInteg(conf);
    setMyConnection(a, null);
    saveState();
    toast(`${SOURCES[a].name} 연결을 해제했어요 (이미 가져온 기록은 남아요)`);
  }
  render();
});
