// Firestore 실시간 공유 (RQ-1 초대, RQ-6 공유 범위, RQ-11 교수자, ONRQ-5 접근 차단).
// firebase-config.js가 채워져 있고 로그인했을 때만 켜진다. 그 밖에는 기존처럼 이 브라우저(localStorage)에만 저장한다.
//
// 데이터 구조 (권한은 firestore.rules가 강제)
//   users/{uid}                     { teams: { [teamId]: { name, role } } }  내가 속한 팀 목록
//   teams/{teamId}                  { teamName, course, ownerUid, decisionDismissed[], links } (예전 방은 members[]도)
//   teams/{teamId}/roster/{memberId} { id, name, color, uid, ... }  명단 한 칸 (팀원은 내 칸만, 팀장은 모두)
//   teams/{teamId}/secrets/{kind}   { code, expiresAt }  student = 팀원 초대 코드, prof = 교수자 초대 코드 (팀장만 읽음)
//   teams/{teamId}/members/{uid}    { uid, role, memberId, code, name }  역할 문서 (본인과 팀장만 읽음)
//   teams/{teamId}/claims/{memberId} { uid, at }  명단의 팀원 한 명 = 계정 하나 (먼저 만든 계정이 그 팀원)
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

const INVITE_DAYS = 7;
const newInvite = () => ({ code: randomCode(), expiresAt: Date.now() + INVITE_DAYS * 864e5 });

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
    ? `${what ? `${what} 저장이` : '이 작업이'} 거절됐어요. 권한이 없거나 새로고침이 필요할 수 있어요`
    : '저장하지 못했어요. 인터넷 연결을 확인해 주세요', { kind: 'error' });
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
    if (guardianTokenInUrl()) { cloud.busy = false; return render(); } // 보호자는 아이의 요청에만 답한다
    await loadConsent();
    if (!consentOk()) { cloud.busy = false; return render(); } // 동의 전에는 방에 들어가지 않는다 (초대 링크는 주소에 남아 있다)
    const params = new URLSearchParams(location.search);
    let joined = null;
    if (params.get('team')) {
      // 링크를 여는 것만으로 낯선 방에 들어가지 않게 묻는다 (참여하면 팀장에게 내 이름·이메일이 보인다)
      const already = await teamRef(params.get('team')).collection('members').doc(authUser.uid).get().then(s => s.exists).catch(() => false);
      if (isId(params.get('team')) && (already || await uiConfirm(params.get('as') === 'prof' ? '교수자로 이 방에 참여할까요?' : '이 방에 참여할까요?', '참여하면 방 사람들에게 내 이름이 보여요. 모르는 사람이 보낸 링크라면 취소하세요.', { ok: '참여하기' }))) {
        joined = await cloudJoin(params.get('team'), params.get('code') || '', params.get('as') === 'prof' ? 'prof' : 'student');
      }
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
  const teams = snap.exists ? snap.data().teams || {} : {};
  cloud.myTeams = Object.fromEntries(Object.entries(teams).filter(([id]) => isId(id)).map(([id, t]) => [id, { name: asStr(t?.name).slice(0, 200), role: t?.role === 'prof' ? 'prof' : 'student' }]));
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
      await memRef.set({ uid: authUser.uid, role, memberId: null, code, joinedAt: Date.now(), name: authUser.name || '' });
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
  if (!isId(teamId)) return;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  db.collection('teams').doc(teamId).collection('accessLogs').doc(`${authUser.uid}_${what}_${day}`)
    .set({ uid: authUser.uid, what, at: Date.now() })
    .catch(e => console.warn('접근 기록을 남기지 못했어요', e)); // 기록 실패가 사용자를 막지는 않는다
}

// ---------- 팀 열기 / 닫기 ----------

function cloudClose() {
  if (typeof call !== 'undefined' && call.id) leaveCall(); // 방을 떠나면 회의에서도 나간다
  stopPresence();
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
    team: null, roster: new Map(), meta: new Map(), itemsTeam: new Map(), itemsProf: new Map(), itemsMine: new Map(),
    decisions: new Map(), quests: new Map(), corrections: new Map(), logs: new Map(), calls: new Map(),
  };
  cloud.callsDenied = false;
  cloud.synced = { team: {}, roster: {}, items: {}, decisions: {}, quests: {}, corrections: {}, logs: {} };
  state = migrate({
    version: 1, teamId, teamName: '', course: '', members: [], items: [], meId: null,
    view: 'meeting', roomId: null, viewer: 'student',
  });
  savePrefs({ mode: 'team', lastTeam: teamId });
  cloud.roleDoc = null;
  cloud.claimChecked = false;
  cloud.rosterMoved = false;
  cloud.rosterReady = false;
  cloud.settingMember = false;
  cloud.closing = false;

  const t = teamRef(teamId);
  t.collection('members').doc(authUser.uid).get()
    .then(snap => { if (cloud.teamId === teamId) { cloud.roleDoc = snap.exists ? snap.data() : null; rebuildState(); } })
    .catch(() => { /* 팀 문서 구독 쪽에서 오류를 알린다 */ });
  const fail = err => {
    console.error(err);
    if (cloud.teamId !== teamId) return;
    if (err.code === 'permission-denied') logDenied(teamId, 'open');
    toast(err.code === 'permission-denied' ? '이 방에 접근할 권한이 없어요' : err.code === 'not-found' ? '이 방은 삭제됐어요' : '방 정보를 불러오지 못했어요');
    cloudClose();
    state = null;
    cloud.showSetup = true;
    cloud.setupMode = null;
    pruneTeamIfGone(teamId, err.code).finally(render);
    render();
  };
  cloud.unsubs.push(t.onSnapshot(snap => {
    if (!snap.exists) return fail({ code: 'not-found' });
    if (snap.data().deleting && snap.data().ownerUid !== authUser.uid) return fail({ code: 'not-found' }); // 팀장이 삭제하는 중
    cloud.docs.team = cleanTeam(snap.data());
    cloud.loaded = cloud.rosterReady; // 명단까지 받아야 방을 연다 (빈 명단으로 '누구의 방' 화면이 뜨지 않게)
    rebuildState();
  }, fail));
  // 받은 문서는 바로 정화한다. 형식이 잘못된 문서는 없는 것으로 본다 (js/sanitize.js)
  const cleanOf = { roster: (raw, id) => cleanMember({ ...raw, id }), meta: cleanItemMeta, itemsTeam: cleanItem, itemsProf: cleanItem, itemsMine: cleanItem, decisions: cleanDecision, quests: cleanQuest, corrections: cleanCorrection, logs: cleanLog };
  const cleanDocs = (snap, fn) => new Map(snap.docs.map(d => [d.id, fn(d.data(), d.id)]).filter(([, v]) => v));
  const listen = (query, key) => cloud.unsubs.push(query.onSnapshot(snap => {
    cloud.docs[key] = cleanDocs(snap, cleanOf[key]);
    if (key === 'roster') {
      cloud.rosterReady = true;
      if (cloud.docs.team) cloud.loaded = true;
    }
    rebuildState();
  }, fail));
  // 공유 범위별로 나눠 듣는다: 남의 '나만' 기록은 규칙상 읽을 수 없어서, 한 번에 전부 읽는 쿼리는 거절된다
  listen(t.collection('roster'), 'roster');
  listen(t.collection('itemMeta'), 'meta');
  listen(t.collection('items').where('visibility', '==', 'team'), 'itemsTeam');
  listen(t.collection('items').where('visibility', '==', 'prof'), 'itemsProf');
  listen(t.collection('items').where('ownerUid', '==', authUser.uid), 'itemsMine');
  ['decisions', 'quests', 'corrections', 'logs'].forEach(c => listen(t.collection(c), c));
  // 회의 기록: 예전 규칙이면 읽기가 거절되는데, 그래도 방은 쓸 수 있게 따로 처리한다
  cloud.unsubs.push(t.collection('calls').onSnapshot(snap => {
    cloud.docs.calls = cleanDocs(snap, cleanCall);
    rebuildState();
  }, err => {
    console.error(err);
    cloud.callsDenied = true;
    rebuildState();
  }));
  startPresence(teamId);
}

// ---------- 실시간 접속 표시 (RQ-8) ----------
// teams/{t}/presence/{uid} { memberId, at } 를 2분마다 갱신하고, 5분 안에 갱신한 팀원을 '접속 중'으로 본다.
// 무료 요금제의 하루 읽기 한도(5만 회)는 프로젝트 전체가 함께 쓰므로, 화면을 보고 있을 때만 갱신한다.
const PRESENCE_EVERY_MS = 2 * 60 * 1000;
const PRESENCE_ONLINE_MS = 5 * 60 * 1000;
let presenceTimer = null;
let presenceExpiryTimer = null;
let presenceBeat = null;

function startPresence(teamId) {
  stopPresence();
  const ref = teamRef(teamId).collection('presence');
  const beat = () => {
    if (cloud.teamId !== teamId || !state?.meId || document.visibilityState === 'hidden') return;
    ref.doc(authUser.uid).set({ uid: authUser.uid, memberId: state.meId, at: Date.now() }).catch(() => { /* 예전 규칙이면 조용히 건너뜀 */ });
  };
  presenceBeat = beat;
  // 첫 표시는 팀원 연결(meId)이 정해지는 대로 (방금 참여했거나 느린 기기면 2분을 기다리지 않게)
  const first = () => {
    if (cloud.teamId !== teamId) return;
    if (state?.meId) beat(); else setTimeout(first, 1500);
  };
  setTimeout(first, 1500);
  presenceTimer = setInterval(beat, PRESENCE_EVERY_MS);
  presenceExpiryTimer = setInterval(() => rebuildState(), 60 * 1000); // 오래된 접속 정리 (읽기 없음)
  cloud.unsubs.push(ref.onSnapshot(snap => {
    cloud.docs.presence = new Map(snap.docs.map(d => [d.id, { memberId: isId(d.data().memberId) ? d.data().memberId : null, at: finite(d.data().at) }]));
    rebuildState();
  }, () => { cloud.docs.presence = new Map(); }));
}

function stopPresence() {
  clearInterval(presenceTimer);
  clearInterval(presenceExpiryTimer);
  presenceTimer = presenceExpiryTimer = presenceBeat = null;
  if (cloud.teamId && authUser) teamRef().collection('presence').doc(authUser.uid).set({ uid: authUser.uid, memberId: state?.meId ?? null, at: 0 }).catch(() => {});
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') presenceBeat?.(); });

function stubFromMeta(id, m) {
  return {
    id, memberId: m.memberId, ownerUid: m.ownerUid, type: m.type, createdAt: m.createdAt, visibility: m.visibility,
    title: '', content: '', url: '', themes: [], keywords: [], votes: [], table: null,
    ai: m.purpose ? { tool: '', purpose: m.purpose, transcript: '' } : undefined,
    _stub: true,
  };
}

function teamFields(src) {
  return { teamName: src.teamName, course: src.course || '', decisionDismissed: src.decisionDismissed || [], links: src.links || {} };
}

// 명단 = 예전 방의 members 배열 + roster 문서 (같은 팀원이면 roster가 우선, 새 칸은 뒤에 만든 순서로)
function mergeRoster(legacy, roster) {
  const out = (legacy || []).map(m => roster.get(m.id) || m);
  const known = new Set(out.map(m => m.id));
  const added = [...roster.values()].filter(m => !known.has(m.id)).sort((a, b) => finite(a.at) - finite(b.at));
  return [...out, ...added];
}

// 예전 방 옮기기: 내 칸은 각자, 나머지 칸은 팀장이 roster 문서로 쓴다
function migrateRoster() {
  const d = cloud.docs;
  const legacy = d.team?.members || [];
  if (!legacy.length || cloud.rosterMoved || !cloud.roleDoc?.memberId) return;
  cloud.rosterMoved = true;
  const t = teamRef();
  const moves = legacy.map((m, i) => {
    if (d.roster.has(m.id) || !(cloud.owner || m.id === cloud.roleDoc.memberId)) return null;
    return t.collection('roster').doc(m.id).set({ ...m, at: i });
  });
  // 팀장이 모두 옮겼으면 배열을 비운다 (배열에 예전 이메일·사진이 남아 있다)
  Promise.all(moves).then(() => (cloud.owner ? t.update({ members: [] }) : null)).catch(e => console.warn('명단 옮기기 실패', e));
}

// 스냅샷들을 앱이 쓰는 state 하나로 합친다
function rebuildState() {
  if (!state?.teamId || !cloud.loaded) return;
  const d = cloud.docs;
  Object.assign(state, teamFields(d.team));
  state.members = mergeRoster(d.team.members, d.roster);
  cloud.synced.roster = Object.fromEntries(state.members.map(m => [m.id, stableStr(m)]));
  cloud.owner = d.team.ownerUid === authUser.uid;
  // 명단에는 연결돼 있는데 역할 문서에 팀원 id가 없으면 (나갔다가 다시 들어온 경우 등) 채운다
  const mine = state.members.find(m => m.uid === authUser.uid);
  if (mine && cloud.roleDoc?.role === 'student' && cloud.roleDoc.memberId == null) cloudSetMemberId(mine.id);
  ensureMyClaim();
  migrateRoster();
  const serverTeam = teamFields(d.team);
  cloud.synced.team = Object.fromEntries(Object.keys(serverTeam).map(k => [k, stableStr(serverTeam[k])]));

  // 명단에 없는 팀원의 기록은 화면이 읽지 못하므로 뺀다 (지우는 것이 아니다: synced에서도 빼서 삭제로 보지 않는다)
  const known = new Set(state.members.map(m => m.id));
  const full = new Map([...d.itemsTeam, ...d.itemsProf, ...d.itemsMine].filter(([, it]) => known.has(it.memberId)).map(([id, it]) => [id, { votes: [], table: null, ...it }]));
  const items = [];
  d.meta.forEach((m, id) => { if (known.has(m.memberId)) items.push(full.has(id) ? { ...full.get(id) } : stubFromMeta(id, m)); });
  full.forEach((it, id) => { if (!d.meta.has(id)) items.push({ ...it }); });
  state.items = items;
  cloud.synced.items = Object.fromEntries([...full].map(([id, it]) => [id, stableStr(it)]));

  for (const c of ['decisions', 'quests', 'corrections']) {
    state[c] = [...d[c].values()];
    cloud.synced[c] = Object.fromEntries([...d[c]].map(([id, x]) => [id, stableStr(x)]));
  }
  state.changeLog = [...d.logs.values()].sort((a, b) => a.at - b.at);
  state.calls = cloud.callsDenied ? null : [...d.calls.values()].sort((a, b) => b.startedAt - a.startedAt);
  const now = Date.now();
  state.online = new Set([...(d.presence || new Map()).values()].filter(p => p.memberId && now - p.at < PRESENCE_ONLINE_MS).map(p => p.memberId));
  if (typeof scheduleTalkSync === 'function') scheduleTalkSync(); // 끝난 회의의 내 발언 요약을 내 방에
  if (typeof scheduleCallSweep === 'function') scheduleCallSweep(); // 아무도 남지 않은 회의 정리
  notifyRefresh(); // 입력 중이라 화면을 다시 그리지 않아도 알림은 바로 갱신한다
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

const OTHERS_ITEM_KEYS = ['table', 'type', 'themes', 'keywords', 'ai', 'appliedCorrection']; // 남의 기록에서 바꿀 수 있는 필드 (+ votes)

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
  if (!cloudOn() || !cloud.loaded || !authUser || cloud.closing) return;
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
  // 명단은 바뀐 칸만 (규칙상 팀원은 내 칸만 고칠 수 있다)
  state.members.forEach(m => {
    const str = stableStr(m);
    if (cloud.synced.roster[m.id] === str) return;
    cloud.synced.roster[m.id] = str;
    t.collection('roster').doc(m.id).set({ ...m, at: m.at ?? Date.now() }).catch(e => writeFailed(e, '명단'));
  });

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
      // 기록과 횟수 기록은 함께 저장한다 (한쪽만 남으면 교수자 집계가 어긋난다)
      const batch = db.batch();
      batch.set(t.collection('items').doc(item.id), doc);
      batch.set(t.collection('itemMeta').doc(item.id), metaDoc(item));
      batch.commit().catch(writeFailed);
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
    const batch = db.batch();
    batch.delete(t.collection('items').doc(id));
    batch.delete(t.collection('itemMeta').doc(id));
    batch.commit().catch(writeFailed);
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
  ws.members.forEach(m => { delete m.uid; });
  me.uid = authUser.uid;

  cloudClose();
  cloud.showSetup = false;
  cloud.setupMode = null;
  cloud.busy = true;
  render();
  const ref = db.collection('teams').doc();
  try {
    const head = db.batch();
    head.set(ref, { ...teamFields(ws), members: [], ownerUid: authUser.uid, createdAt: Date.now() });
    head.set(ref.collection('secrets').doc('student'), newInvite());
    head.set(ref.collection('secrets').doc('prof'), newInvite());
    head.set(ref.collection('members').doc(authUser.uid), { uid: authUser.uid, role: 'student', memberId: me.id, code: '', joinedAt: Date.now(), name: authUser.name || '' });
    head.set(ref.collection('claims').doc(me.id), { uid: authUser.uid, at: Date.now() });
    await head.commit();

    const ops = [];
    ws.members.forEach((m, i) => ops.push([ref.collection('roster').doc(m.id), { ...m, at: i }]));
    ws.items.forEach(it => {
      const item = { ...it, ownerUid: authUser.uid };
      delete item.correctionId;
      if (it.memberId !== me.id) item.imported = true;
      ops.push([ref.collection('items').doc(item.id), itemDoc(item)], [ref.collection('itemMeta').doc(item.id), metaDoc(item)]);
    });
    ws.decisions.forEach(x => ops.push([ref.collection('decisions').doc(x.id), x]));
    ws.quests.forEach(x => ops.push([ref.collection('quests').doc(x.id), x]));
    ws.changeLog.forEach(x => { const id = x.id || uid(); ops.push([ref.collection('logs').doc(id), { ...x, id, by: authUser.uid }]); });
    // 규칙이 한 묶음에서 읽을 수 있는 문서가 20개라 (기록마다 짝이 되는 문서를 확인한다) 작게 나눠 올린다
    for (let i = 0; i < ops.length; i += 24) {
      const batch = db.batch();
      ops.slice(i, i + 24).forEach(([doc, data]) => batch.set(doc, data));
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

// 나가기·방 삭제 전에 이 브라우저의 쓰기를 모두 멈춘다.
// 내 발언 요약·연동 가져오기·회의 정리가 지우는 도중에 돌면 방금 지운 뒤에 기록이 새로 생긴다.
async function quiesceCloud() {
  cloud.closing = true;
  if (typeof call !== 'undefined' && call.id) await leaveCall(); // 아직 팀원일 때 회의에서 나간다
  cloud.unsubs.forEach(u => u());
  cloud.unsubs = [];
  stopPresence();
  await db.waitForPendingWrites(); // 이미 보낸 쓰기까지 끝나야 지울 목록에 잡힌다
}

// 이 계정만 팀에서 나간다. 팀 데이터는 팀원들을 위해 남고, 초대 링크로 다시 들어올 수 있다.
// 팀장은 먼저 넘기거나 방을 삭제해야 한다 (팀장 없는 방이 남지 않게).
// eraseMine: 내 기록과 내 발언도 함께 지운다 (LS-5)
async function cloudLeaveTeam(eraseMine = false) {
  const id = cloud.teamId;
  if (cloud.owner) return toast('방을 만든 사람은 나가기 전에 ⚙️ → 👥 방 관리에서 팀장을 넘기거나 방을 삭제해 주세요');
  const mine = memberByUid(authUser.uid);
  const t = teamRef(id);
  try {
    await quiesceCloud();
    if (eraseMine) await eraseMyRecords(t);
    if (mine) {
      delete mine.uid;
      await t.collection('roster').doc(mine.id).set(mine); // 명단에서 내 연결 풀기 (팀원일 때 해야 함)
    }
    const batch = db.batch();
    if (cloud.roleDoc?.memberId) batch.delete(t.collection('claims').doc(cloud.roleDoc.memberId));
    batch.delete(t.collection('members').doc(authUser.uid));
    await batch.commit();
    await userRef().update({ [`teams.${id}`]: firebase.firestore.FieldValue.delete() });
    delete cloud.myTeams[id];
    toast(eraseMine ? '내 기록을 지우고 방에서 나왔어요' : '방에서 나왔어요');
  } catch (e) {
    writeFailed(e);
  }
  cloud.teamId = null; // 이미 팀원이 아니므로 접속 표시를 다시 쓰지 않게
  cloud.loaded = false;
  cloudClose();
  state = null;
  cloud.showSetup = true;
  cloud.setupMode = null;
  savePrefs({ lastTeam: null });
  render();
}

// 쿼리 결과를 묶음으로 지운다
async function deleteDocs(docs) {
  for (let i = 0; i < docs.length; i += 300) {
    const batch = db.batch();
    docs.slice(i, i + 300).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

async function eraseMyRecords(t) {
  const items = await t.collection('items').where('ownerUid', '==', authUser.uid).get();
  await deleteDocs(items.docs);
  await deleteDocs(items.docs.map(d => ({ ref: t.collection('itemMeta').doc(d.id) })));
  const calls = await t.collection('calls').get();
  for (const c of calls.docs) {
    const lines = await c.ref.collection('lines').where('uid', '==', authUser.uid).get();
    await deleteDocs(lines.docs);
  }
}

// 명단의 팀원을 고른다: claim을 먼저 만든 계정만 그 팀원이 된다 (규칙이 강제). 성공하면 true
async function cloudSetMemberId(memberId) {
  if (!cloudOn() || cloud.settingMember) return false;
  cloud.settingMember = true;
  const t = teamRef();
  try {
    const batch = db.batch();
    batch.update(t.collection('members').doc(authUser.uid), { memberId });
    batch.set(t.collection('claims').doc(memberId), { uid: authUser.uid, at: Date.now() });
    await batch.commit();
    if (cloud.roleDoc) cloud.roleDoc.memberId = memberId;
    cloud.claimChecked = true;
    return true;
  } catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied' ? '이미 다른 계정이 쓰는 이름이거나, Firestore 규칙이 최신이 아니에요' : '저장하지 못했어요. 인터넷 연결을 확인해 주세요');
    return false;
  } finally {
    cloud.settingMember = false;
  }
}

// 예전에 만든 방: 이미 연결된 계정의 claim을 채워 넣어 다른 계정이 같은 팀원을 고르지 못하게 한다
function ensureMyClaim() {
  const memberId = cloud.roleDoc?.memberId;
  if (!memberId || cloud.claimChecked) return;
  cloud.claimChecked = true;
  const ref = teamRef().collection('claims').doc(memberId);
  const entry = teamRef().collection('roster').doc(memberId);
  ref.get().then(snap => {
    if (!snap.exists) return ref.set({ uid: authUser.uid, at: Date.now() });
  }).then(() => entry.get()).then(snap => {
    // 예전에 저장한 내 이메일·사진은 지운다 (필요 없는 개인정보)
    if (cloud.roleDoc?.email) teamRef().collection('members').doc(authUser.uid).update({ email: firebase.firestore.FieldValue.delete() }).catch(() => {});
    const old = snap.exists ? snap.data() : null;
    if (old && ('email' in old || 'photo' in old)) {
      const { email: _e, photo: _p, ...rest } = old;
      return entry.set(rest);
    }
  }).catch(() => { /* 예전 규칙이면 조용히 건너뜀 */ });
}

// 지워졌거나 내보내진 방은 내 방 목록에서도 뺀다 (일시적인 오류면 그대로 둔다)
async function pruneTeamIfGone(teamId, code = 'permission-denied') {
  if (code !== 'not-found' && code !== 'permission-denied') return;
  try {
    const role = await teamRef(teamId).collection('members').doc(authUser.uid).get();
    if (code !== 'not-found' && role.exists) return;
    delete cloud.myTeams[teamId];
    await userRef().update({ [`teams.${teamId}`]: firebase.firestore.FieldValue.delete() });
  } catch (e) { console.warn('방 목록 정리 실패', e); }
}

// ---------- 방 관리 (방을 만든 사람) ----------

async function openManageModal() {
  openModal('<h2>👥 방 관리</h2><p class="muted">불러오는 중…</p>');
  let roles = [], logs = [];
  try {
    const [r, l] = await Promise.all([
      teamRef().collection('members').get(),
      teamRef().collection('accessLogs').get().catch(() => ({ docs: [] })),
    ]);
    roles = r.docs.map(d => ({ ...d.data(), uid: d.id, role: d.data().role === 'prof' ? 'prof' : 'student', name: asStr(d.data().name) })).filter(x => isId(x.uid));
    // 막힌 접근 기록은 30일만 둔다
    const old = l.docs.filter(d => Date.now() - finite(d.data().at) > 30 * 864e5);
    if (old.length) deleteDocs(old).catch(() => {});
    logs = l.docs.filter(d => !old.includes(d)).map(d => ({ uid: asStr(d.data().uid), what: asStr(d.data().what), at: finite(d.data().at) })).sort((a, b) => b.at - a.at).slice(0, 20);
  } catch (e) {
    closeModal();
    return writeFailed(e, '방 관리');
  }
  const nameOf = r => state.members.find(m => m.uid === r.uid || m.id === r.memberId)?.name || r.name || `이름 없음 (${r.uid.slice(0, 6)})`;
  const rows = roles.sort((a, b) => (a.role === b.role ? 0 : a.role === 'student' ? -1 : 1)).map(r => {
    const self = r.uid === authUser.uid;
    return `<li class="manage-row">
      <span><b>${esc(nameOf(r))}</b>
        <span class="vis-badge ${r.role === 'prof' ? 'vis-prof' : 'vis-team'}">${self ? '팀장 (나)' : r.role === 'prof' ? '교수자' : '팀원'}</span></span>
      ${self ? '' : `<span class="manage-actions">
        ${r.role === 'student' ? `<button class="btn sm" data-cloud="owner:${esc(r.uid)}">팀장 넘기기</button>` : ''}
        <button class="btn sm danger" data-cloud="kick:${esc(r.uid)}">${r.role === 'prof' ? '접근 끊기' : '내보내기'}</button></span>`}
    </li>`;
  }).join('');
  const deleting = cloud.docs.team?.deleting;
  openModal(`
    <h2>👥 방 관리 <span class="muted sm">${esc(state.teamName)}</span></h2>
    <h3>참여자 ${roles.length}명</h3>
    <ul class="manage-list">${rows}</ul>
    <p class="muted sm">내보낸 사람의 기록은 방에 남고, 그 사람은 더 이상 방을 보거나 쓸 수 없어요. 초대 링크를 함께 다시 발급하면 다시 들어올 수도 없어요.</p>
    ${freeSlotsHTML(roles)}
    <h3>초대 링크 다시 발급</h3>
    <p class="muted sm">링크는 ${INVITE_DAYS}일 동안 쓸 수 있어요. 만료됐거나 밖으로 샜을 때 다시 발급하세요. 예전 링크는 바로 막히고, 이미 들어온 사람은 그대로예요.</p>
    <div class="modal-actions" style="justify-content:flex-start">
      <button class="btn sm" data-cloud="rotate:student">팀원 링크 다시 발급</button>
      <button class="btn sm" data-cloud="rotate:prof">교수자 링크 다시 발급</button>
    </div>
    <h3>막힌 접근 기록 <span class="muted sm">${logs.length}건</span></h3>
    ${logs.length ? `<ul class="manage-log">${logs.map(l => `<li class="sm">${fmtDate(l.at)} · 계정 ${esc(l.uid.slice(0, 6))}… · ${esc(l.what)}</li>`).join('')}</ul>` : '<p class="muted sm">아직 없어요.</p>'}
    <h3>방 삭제</h3>
    <p class="muted sm">기록, 회의 녹취, 초대 링크가 모두 지워지고 되돌릴 수 없어요. 필요하면 먼저 ⚙️ 메뉴에서 전체 백업을 받으세요.</p>
    ${deleting ? '<p class="notice sm">⚠️ 삭제가 끝나지 않았어요. 이어서 삭제하거나 취소할 수 있어요.</p>' : ''}
    <div class="modal-actions" style="justify-content:flex-start">
      <button class="btn sm danger" data-cloud="delete">🗑️ 방 삭제${deleting ? ' 이어 하기' : ''}</button>
      ${deleting ? '<button class="btn sm" data-cloud="undelete">삭제 취소</button>' : ''}
    </div>
    <div class="modal-actions"><button class="btn ghost" data-close>닫기</button></div>`);
}

// 주인 없는 명단 칸: 팀원이 장난으로 만든 칸을 치울 수 있다 (기록이 있는 칸은 기록을 위해 남긴다)
function freeSlotsHTML(roles) {
  const used = new Set(roles.map(r => r.memberId));
  const free = state.members.filter(m => !m.uid && !used.has(m.id));
  if (!free.length) return '';
  return `<h3>주인 없는 명단 칸 ${free.length}개</h3>
    <ul class="manage-list">${free.map(m => {
      const n = state.items.filter(i => i.memberId === m.id).length;
      return `<li class="manage-row"><span><b>${esc(m.name)}</b> <span class="muted sm">기록 ${n}개</span></span>
        ${n ? '' : `<button class="btn sm danger" data-cloud="slot:${esc(m.id)}">칸 지우기</button>`}</li>`;
    }).join('')}</ul>`;
}

async function cloudKick(uid) {
  const t = teamRef();
  try {
    const role = await t.collection('members').doc(uid).get();
    const batch = db.batch();
    batch.delete(role.ref);
    if (role.data()?.memberId) batch.delete(t.collection('claims').doc(role.data().memberId));
    await batch.commit();
    const m = state.members.find(x => x.uid === uid);
    if (m) { delete m.uid; saveState(); } // 명단 칸은 남아 기록이 이어지고, 다시 고를 수 있다
    toast('내보냈어요');
  } catch (e) {
    writeFailed(e, '내보내기');
  }
}

async function cloudRotateInvite(kind) {
  try {
    await teamRef().collection('secrets').doc(kind).update(newInvite());
    toast(`${kind === 'prof' ? '교수자' : '팀원'} 초대 링크를 다시 발급했어요. ${INVITE_DAYS}일 동안 쓸 수 있고, 예전 링크는 이제 쓸 수 없어요`);
  } catch (e) {
    writeFailed(e, '초대 링크');
  }
}

async function cloudTransferOwner(uid) {
  try {
    await teamRef().update({ ownerUid: uid });
    toast('팀장을 넘겼어요. 이제 이 방에서 나갈 수 있어요');
  } catch (e) {
    writeFailed(e, '팀장 넘기기');
  }
}

// 방 삭제: 표시 → 하위 문서 → 내 역할 → 팀 문서 순서 (규칙이 tearingDown일 때만 남의 기록을 지우게 한다)
// 중간에 끊겨도 다시 누르면 남은 것부터 이어서 지운다
async function cloudDeleteTeam() {
  const id = cloud.teamId;
  try {
    await quiesceCloud();
    await teardownTeam(id);
    toast('방을 삭제했어요');
  } catch (e) {
    writeFailed(e, `방 삭제(${e.step || '시작'})`);
    toast('방을 다 지우지 못했어요. 다시 열어 👥 방 관리에서 이어서 삭제할 수 있어요');
  }
  cloud.teamId = null;
  cloud.loaded = false;
  cloudClose();
  state = null;
  cloud.showSetup = true;
  cloud.setupMode = null;
  savePrefs({ lastTeam: null });
  render();
}

async function teardownTeam(id) {
  const t = teamRef(id);
  let step = '시작'; // 실패하면 어느 단계인지 남긴다
  try {
    await t.update({ deleting: true });
    step = '회의';
    const calls = await t.collection('calls').get();
    for (const c of calls.docs) await eraseCallDocs(c.ref);
    step = '기록';
    const meta = await t.collection('itemMeta').get();
    await deleteDocs(meta.docs.map(d => ({ ref: t.collection('items').doc(d.id) })));
    await deleteDocs(meta.docs);
    const mine = await t.collection('items').where('ownerUid', '==', authUser.uid).get(); // 목록에 없던 내 기록
    await deleteDocs(mine.docs);
    for (const name of ['decisions', 'quests', 'corrections', 'logs', 'accessLogs', 'presence', 'claims', 'roster']) {
      step = name;
      await deleteDocs((await t.collection(name).get()).docs);
    }
    step = '초대 코드';
    await deleteDocs([{ ref: t.collection('secrets').doc('student') }, { ref: t.collection('secrets').doc('prof') }]);
    step = '참여자';
    const roles = await t.collection('members').get();
    await deleteDocs(roles.docs.filter(d => d.id !== authUser.uid));
    await t.collection('members').doc(authUser.uid).delete();
    step = '방 문서';
    await t.delete();
    step = '내 방 목록';
    delete cloud.myTeams[id];
    await userRef().update({ [`teams.${id}`]: firebase.firestore.FieldValue.delete() });
  } catch (e) {
    e.step = step;
    throw e;
  }
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
    const [team, roster, meta, items, decisions, logs, calls] = await Promise.all([
      t.get(), t.collection('roster').get().catch(() => ({ docs: [] })), t.collection('itemMeta').get(), t.collection('items').where('visibility', '==', 'prof').get(),
      t.collection('decisions').get(), t.collection('logs').get(),
      // 팀이 '교수자에게 공유'한 회의 요약만 (녹취 원문은 공유하지 않는다)
      t.collection('calls').where('shareProf', '==', true).get().catch(() => ({ docs: [] })),
    ]);
    if (!team.exists) { await pruneTeamIfGone(id, 'not-found'); return null; }
    const full = new Map(items.docs.map(d => [d.id, d.data()]));
    const data = cleanTeam(team.data());
    data.members = mergeRoster(data.members, new Map(roster.docs.map(d => [d.id, cleanMember({ ...d.data(), id: d.id })]).filter(([, m]) => m)));
    const known = new Set(data.members.map(m => m.id));
    return sanitizeWorkspace(sanitizeForProf({
      teamName: data.teamName,
      course: data.course,
      members: data.members,
      items: meta.docs.map(d => { const m = cleanItemMeta(d.data(), d.id); return m && (cleanItem(full.get(d.id), d.id) || stubFromMeta(d.id, m)); }).filter(i => i && known.has(i.memberId)),
      decisions: decisions.docs.map(d => cleanDecision(d.data(), d.id)).filter(Boolean),
      changeLog: logs.docs.map(d => cleanLog(d.data(), d.id)).sort((a, b) => a.at - b.at),
      calls: calls.docs.map(d => cleanCall(d.data(), d.id)).filter(Boolean),
    }));
  } catch (e) {
    console.error(e);
    logDenied(id, 'prof-view');
    await pruneTeamIfGone(id);
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
        ${cloudOn() && cloud.owner ? '<button class="btn" data-cloud="manage">👥 방 관리 <small class="muted">(참여자·초대 링크·방 삭제)</small></button>' : ''}
        ${cloudOn() ? '<button class="btn danger" data-cloud="leave">🚪 이 방에서 나가기</button>' : ''}
        <button class="btn" id="downloadMyData">📦 내 데이터 내려받기</button>
        <button class="btn danger" id="deleteAccountBtn">🗑️ 계정과 데이터 삭제 <small>(동의 철회)</small></button>
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
    <p class="muted sm">링크를 받은 사람이 Google 로그인하면 바로 이 방에 들어와요. 이미 들어온 사람은 링크가 만료돼도 그대로예요.</p>
    <label class="sm invite">팀원 초대 링크 <span><input id="inviteStudent" readonly value="불러오는 중…"><button class="btn sm" data-cloud="copy:inviteStudent">복사</button></span></label>
    <p class="muted sm invite-note" id="inviteStudentNote"></p>
    ${cloud.owner ? `<label class="sm invite">교수자 초대 링크 <small class="muted">(방을 만든 사람만 볼 수 있어요)</small>
      <span><input id="inviteProf" readonly value="불러오는 중…"><button class="btn sm" data-cloud="copy:inviteProf">복사</button></span></label>
      <p class="muted sm invite-note" id="inviteProfNote"></p>` : ''}`;
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
  if (!inv || !isId(inv.team)) return toast('초대 링크를 확인해 주세요. 방 참여자에게 받은 링크 전체를 붙여넣으면 돼요');
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

// 초대 링크가 언제까지인지 (expiresAt이 없으면 예전에 만든 링크)
function inviteNote(expiresAt) {
  const how = cloud.owner ? '⚙️ → 👥 방 관리에서 다시 발급하세요' : '팀장에게 새 링크를 요청하세요';
  if (!expiresAt) return `만료 기한이 없는 예전 링크예요.${cloud.owner ? ` 다시 발급하면 ${INVITE_DAYS}일 기한이 생겨요.` : ''}`;
  const left = expiresAt - Date.now();
  if (left <= 0) return `⚠️ 만료된 링크예요. ${how}`;
  const days = Math.ceil(left / 864e5);
  return `${fmtDate(expiresAt)}까지 쓸 수 있어요 (${days}일 남음)`;
}

async function cloudFillInvites() {
  if (!cloudOn()) return;
  const link = (code, as) => `${location.origin}${location.pathname}?team=${cloud.teamId}&code=${code}${as === 'prof' ? '&as=prof' : ''}`;
  const fill = async (kind, elId) => {
    const el = document.getElementById(elId);
    if (!el) return;
    try {
      const snap = await teamRef().collection('secrets').doc(kind).get();
      el.value = link(encodeURIComponent(asStr(snap.data().code)), kind);
      const note = document.getElementById(`${elId}Note`);
      if (note) note.textContent = inviteNote(isNum(snap.data().expiresAt) ? snap.data().expiresAt : null);
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
    if (cloud.owner) return cloudLeaveTeam(); // 안내만 하고 나가지 않는다
    const choice = await uiDialog({ title: '이 방에서 나갈까요?', message: '초대 링크로 다시 들어올 수 있어요. 내가 쓴 기록과 회의에서 한 말을 함께 지우면 되돌릴 수 없어요.', cancelValue: 'stay', buttons: [{ label: '취소', value: 'stay' }, { label: '기록 지우고 나가기', value: 'erase', kind: 'danger' }, { label: '기록 남기고 나가기', value: 'keep', kind: 'primary' }] });
    if (choice === 'stay') return;
    return cloudLeaveTeam(choice === 'erase');
  } else if (act === 'manage') {
    return openManageModal();
  } else if (act === 'kick') {
    if (!await uiConfirm('이 사람을 내보낼까요?', '그 사람의 기록은 방에 남고, 더 이상 방을 보거나 쓸 수 없어요.', { ok: '내보내기', danger: true })) return openManageModal();
    await cloudKick(arg);
    return openManageModal();
  } else if (act === 'slot') {
    await teamRef().collection('roster').doc(arg).delete().catch(writeFailed);
    return openManageModal();
  } else if (act === 'rotate') {
    if (!await uiConfirm('초대 링크를 다시 발급할까요?', '예전 링크는 바로 막혀요. 이미 들어온 사람은 그대로예요.', { ok: '다시 발급' })) return openManageModal();
    await cloudRotateInvite(arg);
    return openManageModal();
  } else if (act === 'owner') {
    if (!await uiConfirm('팀장을 넘길까요?', '방 관리와 교수자 링크는 새 팀장만 볼 수 있어요.', { ok: '넘기기', danger: true })) return openManageModal();
    return cloudTransferOwner(arg);
  } else if (act === 'delete') {
    const typed = await uiPrompt('방을 삭제할까요?', '모든 기록과 녹취가 사라지고 되돌릴 수 없어요.', { ok: '방 삭제', danger: true, label: `방 이름 "${state.teamName}"을 그대로 입력하세요`, mustEqual: state.teamName.trim() });
    if (typed !== state.teamName) { if (typed !== null) toast('방 이름이 달라 삭제하지 않았어요'); return openManageModal(); }
    return cloudDeleteTeam();
  } else if (act === 'undelete') {
    await teamRef().update({ deleting: false }).catch(writeFailed);
    return openManageModal();
  } else if (act === 'refresh') {
    toast('새로 불러오는 중…');
    await loadMyTeams();
    return cloudLoadProfTeams();
  }
  render();
});
