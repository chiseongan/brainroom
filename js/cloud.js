// Firestore 동기화. 로그인 모드에서는 워크스페이스를 Firestore에 저장해 팀원끼리 실시간으로 공유한다.
// 구조: users/{uid} { wsId }
//       workspaces/{wsId} { teamName, uids[], createdBy, createdAt }
//       workspaces/{wsId}/members/{memberId}, workspaces/{wsId}/items/{itemId}
// 앱 코드는 지금처럼 state를 고치고 saveState()를 부르면 되고, 여기서 바뀐 문서·필드만 골라 쓴다.
// 화면 위치(view, roomId)와 '나'(meId)는 사람마다 다르므로 Firestore가 아니라 이 브라우저에 저장한다.

let cloud = null;         // { db, uid, wsId, unsub[], synced: { members, items } }
let cloudLoading = false; // 워크스페이스를 처음 불러오는 중

const UI_KEY = 'brainroom:ui:';

function cloudOn() {
  return Boolean(cloud?.wsId);
}

function wsRef(id = cloud.wsId) {
  return cloud.db.collection('workspaces').doc(id);
}

// 키 순서와 상관없이 같은 값이면 같은 문자열
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// Firestore는 undefined를 저장하지 못하므로 JSON으로 한 번 걸러낸다
function plain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cloudError(e, what) {
  console.error(what, e);
  const hint = e.code === 'permission-denied' ? ' · Firestore 규칙을 확인해 주세요' : '';
  toast(`${what}에 실패했어요 (${e.code || e.message})${hint}`);
}

async function startCloud(user) {
  stopCloud();
  cloud = { db: firebase.firestore(), uid: user.uid, wsId: null, unsub: [], synced: { members: {}, items: {} } };
  cloudLoading = true;
  state = null;
  render();

  const invite = new URLSearchParams(location.search).get('ws');
  let wsId = null;
  try {
    if (invite) {
      history.replaceState(null, '', location.pathname);
      await wsRef(invite).update({ uids: firebase.firestore.FieldValue.arrayUnion(user.uid) });
      await cloud.db.collection('users').doc(user.uid).set({ wsId: invite }, { merge: true });
      wsId = invite;
      toast('초대받은 워크스페이스에 참여했어요');
    } else {
      const me = await cloud.db.collection('users').doc(user.uid).get();
      wsId = me.data()?.wsId || null;
    }
  } catch (e) {
    cloudError(e, invite ? '초대 링크로 참여' : '워크스페이스 불러오기');
  }
  if (cloud?.uid !== user.uid) return; // 그 사이 로그아웃함
  if (wsId) return subscribe(wsId);
  cloudLoading = false;
  render();
}

function stopCloud() {
  cloud?.unsub.forEach(fn => fn());
  cloud = null;
  cloudLoading = false;
}

// 실시간 구독을 멈추고 워크스페이스 연결만 비운다 (로그인은 유지)
function detach() {
  cloud.unsub.forEach(fn => fn());
  cloud.unsub = [];
  cloud.wsId = null;
  cloud.synced = { members: {}, items: {} };
}

function subscribe(wsId) {
  detach();
  cloud.wsId = wsId;
  cloudLoading = true;
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem(UI_KEY + wsId)) || {}; } catch (e) { /* 무시 */ }
  state = { version: 1, teamName: '', members: [], items: [], meId: ui.meId ?? null, view: ui.view || 'meeting', roomId: ui.roomId ?? null };

  const waiting = new Set(['ws', 'members', 'items']);
  const arrived = key => {
    if (!waiting.delete(key) || waiting.size) return;
    cloudLoading = false;
    render();
  };
  const fail = e => {
    cloudError(e, '실시간 동기화');
    leaveCloudWorkspace(false);
  };

  cloud.unsub.push(wsRef().onSnapshot(snap => {
    if (!snap.exists) return fail({ code: 'not-found' });
    const name = snap.data().teamName;
    if (state.teamName !== name) { state.teamName = name; if (!waiting.has('ws')) scheduleRender(); }
    arrived('ws');
  }, fail));

  const watch = (name, sort) => cloud.unsub.push(wsRef().collection(name).onSnapshot(snap => {
    const docs = snap.docs.map(d => d.data()).sort(sort);
    cloud.synced[name] = Object.fromEntries(docs.map(d => [d.id, d]));
    if (stable(docs) !== stable(plain(state[name]))) {
      state[name] = docs;
      if (!waiting.has(name)) scheduleRender();
    }
    arrived(name);
  }, fail));
  watch('members', (a, b) => (a.order ?? 0) - (b.order ?? 0));
  watch('items', (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

// saveState()에서 호출: 마지막으로 동기화된 내용과 비교해 바뀐 것만 쓴다
function cloudSave() {
  if (!cloudOn() || cloudLoading || !state) return;
  try {
    localStorage.setItem(UI_KEY + cloud.wsId, JSON.stringify({ meId: state.meId, view: state.view, roomId: state.roomId }));
  } catch (e) { /* 무시 */ }
  syncCollection('members', state.members.map((m, i) => ({ ...m, order: i })));
  syncCollection('items', state.items);
}

function syncCollection(name, list) {
  const col = wsRef().collection(name);
  const FV = firebase.firestore.FieldValue;
  const base = cloud.synced[name];
  const next = {};
  const onErr = e => cloudError(e, '저장');

  list.forEach(obj => {
    const doc = plain(obj);
    next[doc.id] = doc;
    const prev = base[doc.id];
    if (!prev) return col.doc(doc.id).set(doc).catch(onErr);

    const patch = {};
    let removedVotes = [];
    new Set([...Object.keys(prev), ...Object.keys(doc)]).forEach(key => {
      if (stable(prev[key]) === stable(doc[key])) return;
      if (key === 'votes' && Array.isArray(prev.votes) && Array.isArray(doc.votes)) {
        // 여러 명이 동시에 투표해도 서로의 표를 덮어쓰지 않도록 배열 연산으로 보낸다
        const added = doc.votes.filter(v => !prev.votes.includes(v));
        removedVotes = prev.votes.filter(v => !doc.votes.includes(v));
        if (added.length) patch.votes = FV.arrayUnion(...added);
        return;
      }
      patch[key] = key in doc ? doc[key] : FV.delete();
    });
    if (Object.keys(patch).length) col.doc(doc.id).update(patch).catch(onErr);
    if (removedVotes.length) col.doc(doc.id).update({ votes: FV.arrayRemove(...removedVotes) }).catch(onErr);
  });
  Object.keys(base).forEach(id => { if (!next[id]) col.doc(id).delete().catch(onErr); });
  cloud.synced[name] = next;
}

// 로컬에서 만든 워크스페이스(새로 만들기·샘플·파일·이 브라우저 데이터)를 Firestore에 올리고 연결한다
async function cloudCreateWorkspace(ws) {
  const { db, uid } = cloud;
  detach(); // 보고 있던 워크스페이스가 있으면 먼저 끊어야 새 데이터와 섞이지 않는다
  cloudLoading = true;
  state = null;
  render();
  try {
    const ref = db.collection('workspaces').doc();
    await ref.set({
      teamName: ws.teamName,
      uids: [uid],
      createdBy: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    const docs = [
      ...ws.members.map((m, i) => [ref.collection('members').doc(m.id), plain({ ...m, order: i })]),
      ...ws.items.map(it => [ref.collection('items').doc(it.id), plain(it)]),
    ];
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(([doc, data]) => batch.set(doc, data));
      await batch.commit();
    }
    await db.collection('users').doc(uid).set({ wsId: ref.id }, { merge: true });
    try {
      localStorage.setItem(UI_KEY + ref.id, JSON.stringify({ meId: ws.meId, view: 'meeting', roomId: null }));
    } catch (e) { /* 무시 */ }
    subscribe(ref.id);
  } catch (e) {
    cloudError(e, '워크스페이스 만들기');
    cloudLoading = false;
    render();
  }
}

// 이 계정에서 워크스페이스 연결만 끊는다 (데이터는 팀원들을 위해 남겨둔다)
async function leaveCloudWorkspace(clearPointer = true) {
  if (!cloud) return;
  const { db, uid } = cloud;
  detach();
  cloudLoading = false;
  state = null;
  if (clearPointer) {
    try { await db.collection('users').doc(uid).set({ wsId: null }, { merge: true }); }
    catch (e) { cloudError(e, '워크스페이스 나가기'); }
  }
  render();
}

function inviteLink() {
  return `${location.origin}${location.pathname}?ws=${cloud.wsId}`;
}
