// Firestore 실시간 공유 (RQ-1 초대, RQ-6 공유 범위, RQ-11 교수자, ONRQ-5 접근 차단).
// firebase-config.js가 채워져 있고 로그인했을 때만 켜진다. 그 밖에는 기존처럼 이 브라우저(localStorage)에만 저장한다.
//
// 데이터 구조 (권한은 firestore.rules가 강제)
//   users/{uid}                     { teams: { [teamId]: { name, role } } }  내가 속한 팀 목록
//   teams/{teamId}                  { teamName, course, ownerUid, members[], decisionDismissed[] }
//   teams/{teamId}/secrets/{kind}   { code }  student = 팀원 초대 코드, prof = 교수자 초대 코드 (팀장만 읽음)
//   teams/{teamId}/members/{uid}    { uid, role, memberId, code }  역할 문서 (본인만 읽음)
//   teams/{teamId}/items/{id}       기록 내용 (공유 범위에 따라 읽기 제한)
//   teams/{teamId}/itemMeta/{id}    { memberId, ownerUid, type, createdAt, visibility, purpose }  횟수·목적 집계용
//   teams/{teamId}/decisions|quests|corrections|logs|accessLogs

const CLOUD_ENABLED = AUTH_ENABLED && typeof firebase.firestore === 'function';
const PREFS_KEY = 'brainroom:cloud-prefs';

let db = null;
const cloud = {
  teamId: null,      // 열어 둔 온라인 팀
  loaded: false,     // 팀 문서를 처음 받아왔는지
  busy: false,       // 로그인 직후 팀 목록을 불러오는 중
  showSetup: false,  // 방 만들기/참여하기 화면을 띄울지
  setupMode: null,   // null = 두 선택지, 'create' = 방 만들기, 'join' = 방 참여하기
  owner: false,
  myTeams: {},       // { teamId: { name, role } }
  profTeams: [],     // 교수자 보기용으로 걸러 받은 팀들
  unsubs: [],
  docs: {},
  synced: {},
  pendingRender: false,
};

// 로그인했고 '이 기기에서만 쓰기'를 고르지 않았으면 온라인 방으로 동작
function onlineMode() {
  return CLOUD_ENABLED && Boolean(authUser) && !guestMode && !cloud.localMode;
}

function cloudOn() {
  return Boolean(cloud.teamId);
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
}

function savePrefs(patch) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); } catch (e) { /* 무시 */ }
  // 이 탭에서 보던 곳: 새로고침하면 그대로, 새로 로그인하거나 새 탭이면 방 만들기/참여하기 화면부터
  if (patch.mode) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ mode: patch.mode, team: patch.lastTeam ?? null })); } catch (e) { /* 무시 */ }
  }
}

const SESSION_KEY = 'brainroom:session';

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {}; } catch (e) { return {}; }
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}

// 키 순서와 상관없이 같은 데이터면 같은 문자열 (변경 감지용)
function stableStr(v) {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : stableStr(x))).join(',')}]`;
  return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStr(v[k])}`).join(',')}}`;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

function initDb() {
  if (db) return;
  db = firebase.firestore();
  db.settings({ ignoreUndefinedProperties: true, merge: true });
}

const teamRef = (id = cloud.teamId) => db.collection('teams').doc(id);
const userRef = () => db.collection('users').doc(authUser.uid);

function writeFailed(e, what = '') {
  console.error(what || 'Firestore 저장 실패', e);
  toast(e.code === 'permission-denied'
    ? `${what ? `${what} 저장이` : '이 작업이'} 거절됐어요. 권한이 없거나 Firebase 콘솔의 Firestore 규칙이 최신(firestore.rules)이 아닐 수 있어요`
    : '저장하지 못했어요. 인터넷 연결을 확인해 주세요');
}

// ---------- 로그인 후 시작 ----------

async function cloudOnAuth() {
  if (!CLOUD_ENABLED || guestMode) return render();
  if (!authUser) {
    cloudClose();
    state = loadState();
    return render();
  }
  cloud.busy = true;
  render();
  try {
    initDb();
    const params = new URLSearchParams(location.search);
    let joined = null;
    if (params.get('team')) {
      joined = await cloudJoin(params.get('team'), params.get('code') || '', params.get('as') === 'prof' ? 'prof' : 'student');
      history.replaceState(null, '', location.pathname);
    }
    await loadMyTeams();
    // 초대 링크로 들어왔으면 그 방, 이 탭에서 보던 방이 있으면 그 방, 아니면 방 만들기/참여하기 화면
    const session = loadSession();
    const role = id => cloud.myTeams[id]?.role;
    if (joined?.role === 'prof') await cloudOpenProf();
    else if (joined) cloudOpenTeam(joined.teamId);
    else if (session.mode === 'local') cloud.localMode = true; // 이 탭에서 쓰던 이 기기 데모 계속
    else if (session.mode === 'prof' && Object.keys(cloud.myTeams).some(id => role(id) === 'prof')) await cloudOpenProf();
    else if (session.mode === 'team' && role(session.team) === 'student') cloudOpenTeam(session.team);
    else { state = null; cloud.showSetup = true; cloud.setupMode = null; }
  } catch (e) {
    console.error(e);
    toast('온라인 팀 정보를 불러오지 못했어요');
  }
  cloud.busy = false;
  render();
}

async function loadMyTeams() {
  const snap = await userRef().get();
  cloud.myTeams = snap.exists ? snap.data().teams || {} : {};
}

async function rememberTeam(teamId, name, role) {
  cloud.myTeams[teamId] = { name, role };
  await userRef().set({ teams: { [teamId]: { name, role } } }, { merge: true });
}

// 초대 링크로 참여: 코드가 맞아야 역할 문서가 만들어진다 (규칙에서 검사)
async function cloudJoin(teamId, code, role) {
  const memRef = teamRef(teamId).collection('members').doc(authUser.uid);
  try {
    const mine = await memRef.get();
    if (!mine.exists) {
      if (!code) throw Object.assign(new Error('no code'), { code: 'permission-denied' });
      await memRef.set({ uid: authUser.uid, role, memberId: null, code, joinedAt: Date.now() });
    }
    const actualRole = mine.exists ? mine.data().role : role;
    const team = await teamRef(teamId).get();
    await rememberTeam(teamId, team.data().teamName, actualRole);
    toast(actualRole === 'prof' ? `🎓 「${team.data().teamName}」 팀을 교수자로 볼 수 있어요` : `👋 「${team.data().teamName}」 팀에 참여했어요`);
    return { teamId, role: actualRole };
  } catch (e) {
    console.error(e);
    logDenied(teamId, 'join');
    toast('초대 링크가 올바르지 않거나 만료됐어요');
    return null;
  }
}

// ONRQ-5: 권한 없는 접근 시도 기록 (팀장만 읽을 수 있음)
function logDenied(teamId, what) {
  db.collection('teams').doc(teamId).collection('accessLogs')
    .add({ uid: authUser.uid, email: authUser.email, what, at: Date.now() })
    .catch(() => { /* 기록 실패는 무시 */ });
}

// ---------- 팀 열기 / 닫기 ----------

function cloudClose() {
  if (typeof call !== 'undefined' && call.id) leaveCall(); // 방을 떠나면 회의에서도 나간다
  cloud.unsubs.forEach(u => u());
  cloud.unsubs = [];
  cloud.teamId = null;
  cloud.loaded = false;
  cloud.owner = false;
  if (state?.teamId || state?.cloudProf) state = null;
}

function cloudOpenTeam(teamId) {
  cloudClose();
  cloud.showSetup = false;
  cloud.localMode = false;
  cloud.teamId = teamId;
  cloud.docs = {
    team: null, meta: new Map(), itemsTeam: new Map(), itemsProf: new Map(), itemsMine: new Map(),
    decisions: new Map(), quests: new Map(), corrections: new Map(), logs: new Map(), calls: new Map(),
  };
  cloud.callsDenied = false;
  cloud.synced = { team: {}, items: {}, decisions: {}, quests: {}, corrections: {}, logs: {} };
  state = migrate({
    version: 1, teamId, teamName: '', course: '', members: [], items: [], meId: null,
    view: 'meeting', roomId: null, viewer: 'student',
  });
  savePrefs({ mode: 'team', lastTeam: teamId });
  cloud.roleDoc = null;

  const t = teamRef(teamId);
  t.collection('members').doc(authUser.uid).get()
    .then(snap => { if (cloud.teamId === teamId) { cloud.roleDoc = snap.exists ? snap.data() : null; rebuildState(); } })
    .catch(() => { /* 팀 문서 구독 쪽에서 오류를 알린다 */ });
  const fail = err => {
    console.error(err);
    if (cloud.teamId !== teamId) return;
    if (err.code === 'permission-denied') logDenied(teamId, 'open');
    toast(err.code === 'permission-denied' ? '이 팀에 접근할 권한이 없어요' : '팀 정보를 불러오지 못했어요');
    cloudClose();
    state = loadState();
    render();
  };
  cloud.unsubs.push(t.onSnapshot(snap => {
    if (!snap.exists) return fail({ code: 'not-found' });
    cloud.docs.team = snap.data();
    cloud.loaded = true;
    rebuildState();
  }, fail));
  const listen = (query, key) => cloud.unsubs.push(query.onSnapshot(snap => {
    cloud.docs[key] = new Map(snap.docs.map(d => [d.id, d.data()]));
    rebuildState();
  }, fail));
  // 공유 범위별로 나눠 듣는다: 남의 '나만' 기록은 규칙상 읽을 수 없어서, 한 번에 전부 읽는 쿼리는 거절된다
  listen(t.collection('itemMeta'), 'meta');
  listen(t.collection('items').where('visibility', '==', 'team'), 'itemsTeam');
  listen(t.collection('items').where('visibility', '==', 'prof'), 'itemsProf');
  listen(t.collection('items').where('ownerUid', '==', authUser.uid), 'itemsMine');
  ['decisions', 'quests', 'corrections', 'logs'].forEach(c => listen(t.collection(c), c));
  // 회의 기록: 예전 규칙이면 읽기가 거절되는데, 그래도 방은 쓸 수 있게 따로 처리한다
  cloud.unsubs.push(t.collection('calls').onSnapshot(snap => {
    cloud.docs.calls = new Map(snap.docs.map(d => [d.id, d.data()]));
    rebuildState();
  }, err => {
    console.error(err);
    cloud.callsDenied = true;
    rebuildState();
  }));
}

function stubFromMeta(id, m) {
  return {
    id, memberId: m.memberId, ownerUid: m.ownerUid, type: m.type, createdAt: m.createdAt, visibility: m.visibility,
    title: '', content: '', url: '', themes: [], keywords: [], votes: [], table: null,
    ai: m.purpose ? { tool: '', purpose: m.purpose, transcript: '' } : undefined,
    _stub: true,
  };
}

function teamFields(src) {
  return { teamName: src.teamName, course: src.course || '', members: src.members || [], decisionDismissed: src.decisionDismissed || [], links: src.links || {} };
}

// 스냅샷들을 앱이 쓰는 state 하나로 합친다
function rebuildState() {
  if (!state?.teamId || !cloud.loaded) return;
  const d = cloud.docs;
  Object.assign(state, teamFields(d.team));
  cloud.owner = d.team.ownerUid === authUser.uid;
  // 명단에는 연결돼 있는데 역할 문서에 팀원 id가 없으면 (나갔다가 다시 들어온 경우 등) 채운다
  const mine = state.members.find(m => m.uid === authUser.uid);
  if (mine && cloud.roleDoc?.role === 'student' && cloud.roleDoc.memberId == null) cloudSetMemberId(mine.id);
  const serverTeam = teamFields(d.team);
  cloud.synced.team = Object.fromEntries(Object.keys(serverTeam).map(k => [k, stableStr(serverTeam[k])]));

  const full = new Map([...d.itemsTeam, ...d.itemsProf, ...d.itemsMine].map(([id, it]) => [id, { votes: [], table: null, ...it }]));
  const items = [];
  d.meta.forEach((m, id) => items.push(full.has(id) ? { ...full.get(id) } : stubFromMeta(id, m)));
  full.forEach((it, id) => { if (!d.meta.has(id)) items.push({ ...it }); });
  state.items = items;
  cloud.synced.items = Object.fromEntries([...full].map(([id, it]) => [id, stableStr(it)]));

  for (const c of ['decisions', 'quests', 'corrections']) {
    state[c] = [...d[c].values()];
    cloud.synced[c] = Object.fromEntries([...d[c]].map(([id, x]) => [id, stableStr(x)]));
  }
  state.changeLog = [...d.logs.values()].sort((a, b) => a.at - b.at);
  state.calls = cloud.callsDenied ? null : [...d.calls.values()].sort((a, b) => b.startedAt - a.startedAt);
  if (typeof scheduleTalkSync === 'function') scheduleTalkSync(); // 끝난 회의의 내 발언 요약을 내 방에
  cloud.synced.logs = Object.fromEntries([...d.logs].map(([id, x]) => [id, stableStr(x)]));
  scheduleRender();
}

// 입력 중이거나 카드를 끄는 중이면 다시 그리지 않고 기다린다
let renderQueued = false;
function typing() {
  const a = document.activeElement;
  return Boolean(a?.closest?.('#app, #modal') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (typing() || (typeof dragging !== 'undefined' && dragging)) { cloud.pendingRender = true; return; }
    render();
  });
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (cloud.pendingRender && !typing()) { cloud.pendingRender = false; render(); }
}, 0));
document.addEventListener('pointerup', () => setTimeout(() => {
  if (cloud.pendingRender && !typing()) { cloud.pendingRender = false; render(); }
}, 0));

// ---------- 바뀐 것만 올리기 (saveState에서 호출) ----------

const OTHERS_ITEM_KEYS = ['table', 'type', 'themes', 'keywords', 'ai']; // 남의 기록에서 바꿀 수 있는 필드 (+ votes)

function itemDoc(item) {
  const { _stub, ...doc } = item;
  return doc;
}

function metaDoc(item) {
  return {
    memberId: item.memberId, ownerUid: item.ownerUid, type: item.type, createdAt: item.createdAt,
    visibility: item.visibility, purpose: item.ai?.purpose ?? null, correctionId: item.correctionId ?? null,
    imported: item.imported ?? null,
  };
}

function cloudPush() {
  if (!cloudOn() || !cloud.loaded || !authUser) return;
  const t = teamRef();
  const me = authUser.uid;
  const FV = firebase.firestore.FieldValue;

  // 방 정보는 바뀐 칸만 보낸다 (바뀌지 않은 새 칸까지 보내면 예전 규칙에서 저장 전체가 거절된다)
  const tf = teamFields(state);
  const changed = Object.keys(tf).filter(k => stableStr(tf[k]) !== cloud.synced.team[k]);
  if (changed.length) {
    changed.forEach(k => { cloud.synced.team[k] = stableStr(tf[k]); });
    t.update(Object.fromEntries(changed.map(k => [k, tf[k]]))).catch(e => writeFailed(e, `방 정보(${changed.join(', ')})`));
  }

  const seen = new Set();
  state.items.forEach(item => {
    seen.add(item.id);
    if (item._stub) return;
    // 보정 요청으로 만든 기록은 요청한 팀원의 것
    if (!item.ownerUid) item.ownerUid = item.correctionId ? member(item.memberId)?.uid ?? me : me;
    const doc = itemDoc(item);
    const str = stableStr(doc);
    const prev = cloud.synced.items[item.id];
    if (str === prev) return;
    cloud.synced.items[item.id] = str;
    if (item.ownerUid === me || prev === undefined) {
      t.collection('items').doc(item.id).set(doc).catch(writeFailed);
      t.collection('itemMeta').doc(item.id).set(metaDoc(item)).catch(writeFailed);
      return;
    }
    // 남의 기록: 투표·테이블 위치·분류만 부분 수정
    const old = JSON.parse(prev);
    const upd = {};
    OTHERS_ITEM_KEYS.forEach(k => { if (stableStr(doc[k]) !== stableStr(old[k])) upd[k] = doc[k] ?? null; });
    const added = (doc.votes || []).filter(v => !(old.votes || []).includes(v));
    const removed = (old.votes || []).filter(v => !(doc.votes || []).includes(v));
    if (added.length && removed.length) upd.votes = doc.votes;
    else if (added.length) upd.votes = FV.arrayUnion(...added);
    else if (removed.length) upd.votes = FV.arrayRemove(...removed);
    if (Object.keys(upd).length) t.collection('items').doc(item.id).update(upd).catch(writeFailed);
    if ('type' in upd || 'ai' in upd) {
      t.collection('itemMeta').doc(item.id).update({ type: doc.type, purpose: doc.ai?.purpose ?? null }).catch(writeFailed);
    }
  });
  Object.keys(cloud.synced.items).forEach(id => {
    if (seen.has(id)) return;
    const old = JSON.parse(cloud.synced.items[id]);
    delete cloud.synced.items[id];
    if (old.ownerUid !== me) return;
    t.collection('items').doc(id).delete().catch(writeFailed);
    t.collection('itemMeta').doc(id).delete().catch(writeFailed);
  });

  syncCollection(t, 'decisions', state.decisions);
  syncCollection(t, 'quests', state.quests);
  syncCollection(t, 'corrections', state.corrections);
  state.changeLog.forEach(l => { l.id ??= uid(); });
  syncCollection(t, 'logs', state.changeLog, { createOnly: true });
}

function syncCollection(t, name, list, { createOnly = false } = {}) {
  const synced = cloud.synced[name];
  const ids = new Set();
  list.forEach(x => {
    ids.add(x.id);
    const str = stableStr(x);
    if (synced[x.id] === str || (createOnly && synced[x.id])) return;
    synced[x.id] = str;
    t.collection(name).doc(x.id).set(x).catch(writeFailed);
  });
  if (createOnly) return;
  Object.keys(synced).forEach(id => {
    if (ids.has(id)) return;
    delete synced[id];
    t.collection(name).doc(id).delete().catch(writeFailed);
  });
}

// ---------- 팀 만들기 / 팀원 연결 ----------

function cloudCreateTeam(teamName, names, course) {
  return cloudCreateTeamFrom(newWorkspace(teamName, names, course));
}

// 워크스페이스(새 팀·샘플·이 브라우저 데이터·파일)를 새 온라인 팀으로 올린다.
// 나 말고 다른 팀원 이름으로 된 기록은 '가져온 기록'으로 표시되고, 올린 사람이 관리한다.
async function cloudCreateTeamFrom(src) {
  initDb();
  const ws = migrate(JSON.parse(JSON.stringify(src)));
  const me = ws.members.find(m => m.uid === authUser.uid) || ws.members.find(m => m.id === ws.meId) || ws.members[0];
  ws.members.forEach(m => { delete m.uid; delete m.email; delete m.photo; });
  Object.assign(me, { uid: authUser.uid, email: authUser.email, photo: authUser.photo });

  cloudClose();
  cloud.showSetup = false;
  cloud.setupMode = null;
  cloud.busy = true;
  render();
  const ref = db.collection('teams').doc();
  try {
    const head = db.batch();
    head.set(ref, { ...teamFields(ws), ownerUid: authUser.uid, createdAt: Date.now() });
    head.set(ref.collection('secrets').doc('student'), { code: randomCode() });
    head.set(ref.collection('secrets').doc('prof'), { code: randomCode() });
    head.set(ref.collection('members').doc(authUser.uid), { uid: authUser.uid, role: 'student', memberId: me.id, code: '', joinedAt: Date.now() });
    await head.commit();

    const ops = [];
    ws.items.forEach(it => {
      const item = { ...it, ownerUid: authUser.uid };
      delete item.correctionId;
      if (it.memberId !== me.id) item.imported = true;
      ops.push([ref.collection('items').doc(item.id), itemDoc(item)], [ref.collection('itemMeta').doc(item.id), metaDoc(item)]);
    });
    ws.decisions.forEach(x => ops.push([ref.collection('decisions').doc(x.id), x]));
    ws.quests.forEach(x => ops.push([ref.collection('quests').doc(x.id), x]));
    ws.changeLog.forEach(x => { const id = x.id || uid(); ops.push([ref.collection('logs').doc(id), { ...x, id }]); });
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(([doc, data]) => batch.set(doc, data));
      await batch.commit();
    }
    await rememberTeam(ref.id, ws.teamName, 'student');
    cloud.busy = false;
    cloudOpenTeam(ref.id);
    toast('🏠 방을 만들었어요. 상단 🔗 초대 링크로 팀원을 불러 보세요');
  } catch (e) {
    cloud.busy = false;
    writeFailed(e);
  }
  render();
}

// 이 계정만 팀에서 나간다. 팀 데이터는 팀원들을 위해 남고, 초대 링크로 다시 들어올 수 있다.
async function cloudLeaveTeam() {
  const id = cloud.teamId;
  const mine = memberByUid(authUser.uid);
  try {
    if (mine) {
      delete mine.uid; delete mine.email; delete mine.photo;
      await teamRef(id).update(teamFields(state)); // 명단에서 내 연결 풀기 (팀원일 때 해야 함)
    }
    await teamRef(id).collection('members').doc(authUser.uid).delete();
    await userRef().update({ [`teams.${id}`]: firebase.firestore.FieldValue.delete() });
    delete cloud.myTeams[id];
    toast('팀에서 나왔어요');
  } catch (e) {
    writeFailed(e);
  }
  cloudClose();
  savePrefs({ lastTeam: null });
  render();
}

// 명단의 팀원을 고르면, 규칙이 기록 작성자를 확인할 수 있도록 역할 문서에도 남긴다
function cloudSetMemberId(memberId) {
  if (!cloudOn()) return;
  if (cloud.roleDoc) cloud.roleDoc.memberId = memberId;
  teamRef().collection('members').doc(authUser.uid).update({ memberId }).catch(writeFailed);
}

// ---------- 교수자 보기 ----------

async function cloudOpenProf() {
  cloudClose();
  cloud.showSetup = false;
  cloud.localMode = false;
  state = migrate({
    version: 1, cloudProf: true, teamName: '교수자 보기', course: '', members: [], items: [], meId: null,
    view: 'prof', roomId: null, viewer: 'prof',
  });
  savePrefs({ mode: 'prof' });
  await cloudLoadProfTeams();
}

async function cloudLoadProfTeams() {
  const ids = Object.keys(cloud.myTeams).filter(id => cloud.myTeams[id].role === 'prof');
  cloud.profTeams = (await Promise.all(ids.map(loadProfTeam))).filter(Boolean);
  render();
}

async function loadProfTeam(id) {
  try {
    const t = teamRef(id);
    const [team, meta, items, decisions, logs] = await Promise.all([
      t.get(), t.collection('itemMeta').get(), t.collection('items').where('visibility', '==', 'prof').get(),
      t.collection('decisions').get(), t.collection('logs').get(),
    ]);
    const full = new Map(items.docs.map(d => [d.id, d.data()]));
    const data = team.data();
    return sanitizeForProf({
      teamName: data.teamName,
      course: data.course,
      members: data.members || [],
      items: meta.docs.map(d => full.get(d.id) || stubFromMeta(d.id, d.data())),
      decisions: decisions.docs.map(d => d.data()),
      changeLog: logs.docs.map(d => d.data()).sort((a, b) => a.at - b.at),
    });
  } catch (e) {
    console.error(e);
    logDenied(id, 'prof-view');
    return null;
  }
}

// ---------- 메뉴 ----------

function cloudMenuHTML() {
  const teams = Object.entries(cloud.myTeams);
  return `
    <section class="cloud-box">
      <h3>🌐 내 방</h3>
      <div class="menu-list">
        ${myRoomsHTML() || '<p class="muted sm">아직 참여한 방이 없어요.</p>'}
        <button class="btn" data-cloud="new:create">🏠 새 방 만들기</button>
        <button class="btn" data-cloud="new:join">🔑 다른 방 참여하기</button>
        ${cloudOn() ? '<button class="btn danger" data-cloud="leave">🚪 이 방에서 나가기</button>' : ''}
        <button class="btn ghost" data-cloud="local">💻 이 기기 데모로 열기</button>
      </div>
      ${cloudOn() ? inviteSectionHTML() : ''}
    </section>`;
}

function myRoomsHTML() {
  return Object.entries(cloud.myTeams).map(([id, t]) => `
    <button class="btn ${id === cloud.teamId ? 'primary' : ''}" data-cloud="${t.role === 'prof' ? 'prof' : `open:${id}`}">
      ${t.role === 'prof' ? '🎓' : '🚪'} ${esc(t.name)}${t.role === 'prof' ? ' <small>(교수자)</small>' : ''}${id === cloud.teamId ? ' · 지금 보는 방' : ''}</button>`).join('');
}

// 방 참여자 누구나 보는 초대 링크 (교수자 링크는 방을 만든 사람만)
function inviteSectionHTML() {
  return `
    <h3>✉️ 방 초대 링크</h3>
    <p class="muted sm">링크를 받은 사람이 Google 로그인하면 바로 이 방에 들어와요.</p>
    <label class="sm invite">팀원 초대 링크 <span><input id="inviteStudent" readonly value="불러오는 중…"><button class="btn sm" data-cloud="copy:inviteStudent">복사</button></span></label>
    ${cloud.owner ? `<label class="sm invite">교수자 초대 링크 <small class="muted">(방을 만든 사람만 볼 수 있어요)</small>
      <span><input id="inviteProf" readonly value="불러오는 중…"><button class="btn sm" data-cloud="copy:inviteProf">복사</button></span></label>` : ''}`;
}

function openInviteModal() {
  openModal(`
    <h2>🔗 「${esc(state.teamName)}」 초대</h2>
    ${inviteSectionHTML()}
    <div class="modal-actions"><button class="btn ghost" data-close>닫기</button></div>`);
  cloudFillInvites();
}

// 초대 링크(또는 그 일부)에서 방 id·코드·역할을 읽는다
function parseInvite(text) {
  const raw = (text || '').trim();
  let params;
  try { params = new URL(raw).searchParams; } catch (e) { params = new URLSearchParams(raw.replace(/^[^?]*\?/, '')); }
  const team = params.get('team'), code = params.get('code');
  return team && code ? { team, code, role: params.get('as') === 'prof' ? 'prof' : 'student' } : null;
}

async function joinFromInput(text) {
  const inv = parseInvite(text);
  if (!inv) return toast('초대 링크를 확인해 주세요. 방 참여자에게 받은 링크 전체를 붙여넣으면 돼요');
  initDb();
  cloud.busy = true;
  render();
  const joined = await cloudJoin(inv.team, inv.code, inv.role);
  cloud.busy = false;
  if (joined) {
    cloud.setupMode = null;
    if (joined.role === 'prof') await cloudOpenProf();
    else cloudOpenTeam(joined.teamId);
  }
  render();
}

document.addEventListener('submit', e => {
  if (e.target.id !== 'joinForm') return;
  e.preventDefault();
  joinFromInput(new FormData(e.target).get('link'));
});

async function cloudFillInvites() {
  if (!cloudOn()) return;
  const link = (code, as) => `${location.origin}${location.pathname}?team=${cloud.teamId}&code=${code}${as === 'prof' ? '&as=prof' : ''}`;
  const fill = async (kind, elId) => {
    const el = document.getElementById(elId);
    if (!el) return;
    try {
      const snap = await teamRef().collection('secrets').doc(kind).get();
      el.value = link(snap.data().code, kind);
    } catch (e) {
      el.value = '초대 링크를 불러올 수 없어요';
    }
  };
  await Promise.all([fill('student', 'inviteStudent'), cloud.owner ? fill('prof', 'inviteProf') : null]);
}

document.addEventListener('click', async e => {
  if (e.target.closest('#inviteBtn')) return openInviteModal();
  if (e.target.closest('#roomsBtn')) {
    closeModal();
    closePanel();
    cloud.showSetup = true;
    cloud.setupMode = null;
    cloud.localMode = false;
    return render();
  }
  const btn = e.target.closest('[data-cloud]');
  if (!btn) return;
  const [act, arg] = btn.dataset.cloud.split(':');
  if (act === 'mode') { cloud.setupMode = arg || null; return render(); }
  if (act === 'back') { cloud.showSetup = false; cloud.setupMode = null; return render(); }
  if (act === 'copy') {
    const value = document.getElementById(arg).value;
    try { await navigator.clipboard.writeText(value); toast('초대 링크를 복사했어요'); }
    catch { document.getElementById(arg).select(); }
    return;
  }
  closeModal();
  closePanel();
  if (act === 'open') {
    cloudOpenTeam(arg);
  } else if (act === 'prof') {
    await cloudOpenProf();
  } else if (act === 'new') {
    cloud.showSetup = true;
    cloud.setupMode = arg || null;
  } else if (act === 'local') {
    cloudClose();
    cloud.showSetup = false;
    cloud.localMode = true;
    savePrefs({ mode: 'local' });
    state = loadState();
  } else if (act === 'leave') {
    if (!confirm('이 계정만 팀에서 나갈까요? 팀원들의 데이터는 그대로 남고, 초대 링크로 다시 들어올 수 있어요.')) return;
    return cloudLeaveTeam();
  } else if (act === 'refresh') {
    toast('새로 불러오는 중…');
    await loadMyTeams();
    return cloudLoadProfTeams();
  }
  render();
});
