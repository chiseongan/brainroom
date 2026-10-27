// 방 안 음성·화상 회의 + 발언자별 자동 녹취 + 요약 (온라인 방 전용)
// - 연결: 브라우저끼리 직접(WebRTC, 4명 안팎 권장). 연결 정보 교환만 Firestore로 한다.
// - 녹취: 각자 자기 마이크만 받아쓴다(Web Speech API) → 누가 말했는지 정확하다.
// - 요약: 규칙 기반(참석자·발언 수·키워드·주요 발언·정한 것). LLM 요약은 프록시 서버를 붙인 뒤.
//
// Firestore: teams/{t}/calls/{callId}            { title, status: live|ended, startedAt, endedAt, summary }
//                       /calls/{callId}/peers/{uid}   참여 중인 사람 (20초마다 살아 있음 표시)
//                       /calls/{callId}/signals/{id}  연결 정보 (받는 사람이 읽고 지움)
//                       /calls/{callId}/lines/{id}    녹취 한 줄 { uid, memberId, name, text, at }

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const PEER_STALE_MS = 60000; // 이 시간 동안 살아 있음 표시가 없으면 나간 것으로 본다
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

const call = {
  id: null, title: '', joinedAt: 0, stream: null,
  mic: true, cam: false, stt: false, rec: null, interim: '',
  pcs: new Map(),    // 상대 uid → { pc, joinedAt, stream, pendingIce }
  peers: new Map(),  // 상대 uid → peers 문서
  peersSnap: null, lines: [], unsubs: [], heartbeat: null, sigChain: Promise.resolve(),
  big: true,         // 떠 있는 창을 크게/작게
};
const tiles = new Map();          // uid → 영상 칸 (다시 그려도 영상이 끊기지 않도록 유지)
const pastLines = new Map();      // 지난 회의 callId → 녹취 줄 (펼칠 때 한 번만 읽음)

const callsRef = () => teamRef().collection('calls');
const myUid = () => authUser.uid;

function liveCalls() {
  return (state.calls || []).filter(c => c.status === 'live');
}

// ---------- 회의 시작 / 참여 / 나가기 ----------

async function startCall(title, opts) {
  const ref = callsRef().doc();
  try {
    await ref.set({
      id: ref.id, title: title || `${fmtDate(Date.now(), false)} 회의`, status: 'live',
      startedBy: myUid(), startedByName: member(state.meId)?.name || authUser.name,
      startedAt: Date.now(), endedAt: null, summary: null,
    });
  } catch (e) {
    return writeFailed(e);
  }
  joinCall(ref.id, opts);
}

async function joinCall(id, { cam = false, stt = true } = {}) {
  if (call.id) return toast('이미 회의에 참여 중이에요');
  if (!navigator.mediaDevices?.getUserMedia) return toast('이 브라우저에서는 회의를 할 수 없어요 (Chrome·Edge 권장)');
  try {
    call.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: cam ? { width: { ideal: 640 }, height: { ideal: 360 } } : false,
    });
  } catch (e) {
    console.error(e);
    return toast(cam ? '마이크·카메라를 쓸 수 있게 허용해 주세요' : '마이크를 쓸 수 있게 허용해 주세요');
  }
  const c = callsRef().doc(id);
  Object.assign(call, { id, joinedAt: Date.now(), mic: true, cam, lines: [], interim: '', sigChain: Promise.resolve() });
  call.title = liveCalls().find(x => x.id === id)?.title || '회의';
  try {
    await c.collection('peers').doc(myUid()).set({
      uid: myUid(), memberId: state.meId, name: member(state.meId)?.name || authUser.name,
      joinedAt: call.joinedAt, beat: Date.now(), leftAt: null, cam,
    });
  } catch (e) {
    writeFailed(e);
    return leaveCall(false);
  }
  call.heartbeat = setInterval(() => {
    c.collection('peers').doc(myUid()).update({ beat: Date.now() }).catch(() => { /* 다음에 다시 */ });
    if (call.peersSnap) onPeers(call.peersSnap); // 응답 없는 사람 정리
  }, 20000);
  call.unsubs.push(
    c.collection('peers').onSnapshot(onPeers, e => console.error(e)),
    c.collection('signals').where('to', '==', myUid()).onSnapshot(onSignals, e => console.error(e)),
    c.collection('lines').orderBy('at').onSnapshot(snap => {
      call.lines = snap.docs.map(d => d.data());
      renderTranscript();
    }, e => console.error(e)),
    c.onSnapshot(snap => {
      if (snap.data()?.status === 'ended' && call.id === id) { toast('회의가 끝났어요. 요약은 🎙️ 회의 화면에 있어요'); leaveCall(false); }
    }),
  );
  window.addEventListener('beforeunload', markLeft);
  if (stt) startStt();
  renderDock();
  render();
}

function markLeft() {
  if (call.id) callsRef().doc(call.id).collection('peers').doc(myUid()).update({ leftAt: Date.now() }).catch(() => {});
}

// update=false: 이미 끝난 회의에서 정리만 할 때
async function leaveCall(update = true) {
  const id = call.id;
  if (!id) return;
  const ref = callsRef().doc(id); // 방을 떠나는 중이어도 이 회의 경로는 그대로 쓴다
  const othersLeft = [...call.peers.values()].length;
  stopStt();
  clearInterval(call.heartbeat);
  call.unsubs.forEach(u => u());
  call.unsubs = [];
  [...call.pcs.keys()].forEach(closePeer);
  call.stream?.getTracks().forEach(t => t.stop());
  Object.assign(call, { id: null, stream: null, peers: new Map(), peersSnap: null, lines: [], interim: '' });
  tiles.forEach(t => t.remove());
  tiles.clear();
  window.removeEventListener('beforeunload', markLeft);
  renderDock();
  if (update) {
    await ref.collection('peers').doc(myUid()).update({ leftAt: Date.now() }).catch(() => {});
    if (!othersLeft) await endCall(id, ref); // 마지막 사람이 나가면 회의를 끝내고 요약한다
  }
  render();
}

// 회의 끝내기: 녹취를 모아 요약을 저장한다. 참여 중인 사람들은 자동으로 나가진다.
async function endCall(id, c = callsRef().doc(id)) {
  try {
    const [lines, peers] = await Promise.all([c.collection('lines').orderBy('at').get(), c.collection('peers').get()]);
    const ls = lines.docs.map(d => d.data());
    const attendees = [...new Set(peers.docs.map(d => d.data().name))];
    await c.update({ status: 'ended', endedAt: Date.now(), summary: summarizeMeeting(ls, attendees), attendees, lineCount: ls.length });
  } catch (e) {
    writeFailed(e);
  }
}

// ---------- 연결 (WebRTC) ----------

function onPeers(snap) {
  if (!call.id) return;
  call.peersSnap = snap;
  const now = Date.now();
  const active = new Map();
  snap.docs.forEach(d => {
    const p = d.data();
    if (p.uid !== myUid() && !p.leftAt && now - p.beat < PEER_STALE_MS) active.set(p.uid, p);
  });
  call.peers = active;
  for (const [uid, conn] of call.pcs) {
    const p = active.get(uid);
    if (!p || p.joinedAt !== conn.joinedAt) closePeer(uid);
  }
  // 두 사람이 동시에 연결을 시작하지 않도록 uid가 작은 쪽이 먼저 건다
  for (const [uid, p] of active) {
    if (call.pcs.has(uid)) continue;
    const conn = makePeer(uid, p.joinedAt);
    if (myUid() < uid) sendOffer(uid, conn);
  }
  renderDock();
}

function makePeer(uid, joinedAt) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const conn = { pc, joinedAt, stream: null, pendingIce: [] };
  call.stream.getTracks().forEach(t => pc.addTrack(t, call.stream));
  pc.onicecandidate = e => { if (e.candidate) sendSignal(uid, conn, 'candidate', e.candidate.toJSON()); };
  pc.ontrack = e => { conn.stream = e.streams[0]; renderDock(); };
  pc.onconnectionstatechange = () => renderDock();
  call.pcs.set(uid, conn);
  return conn;
}

function closePeer(uid) {
  const conn = call.pcs.get(uid);
  if (!conn) return;
  conn.pc.close();
  call.pcs.delete(uid);
  tiles.get(uid)?.remove();
  tiles.delete(uid);
}

async function sendOffer(uid, conn) {
  try {
    const offer = await conn.pc.createOffer();
    await conn.pc.setLocalDescription(offer);
    sendSignal(uid, conn, 'offer', { type: offer.type, sdp: offer.sdp });
  } catch (e) { console.error(e); }
}

function sendSignal(uid, conn, type, data) {
  if (!call.id) return;
  callsRef().doc(call.id).collection('signals').add({
    from: myUid(), to: uid, fromAt: call.joinedAt, toAt: conn.joinedAt, type, data, at: Date.now(),
  }).catch(e => console.error(e));
}

function onSignals(snap) {
  snap.docChanges().filter(ch => ch.type === 'added').forEach(ch => {
    const s = ch.doc.data();
    ch.doc.ref.delete().catch(() => {});
    if (s.toAt !== call.joinedAt) return; // 예전 접속에 보낸 신호
    call.sigChain = call.sigChain.then(() => handleSignal(s)).catch(e => console.error(e));
  });
}

async function handleSignal(s) {
  if (!call.id) return;
  let conn = call.pcs.get(s.from);
  if (conn && conn.joinedAt !== s.fromAt) { closePeer(s.from); conn = null; }
  if (!conn) conn = makePeer(s.from, s.fromAt);
  const { pc } = conn;
  if (s.type === 'offer') {
    await pc.setRemoteDescription(s.data);
    for (const c of conn.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal(s.from, conn, 'answer', { type: answer.type, sdp: answer.sdp });
  } else if (s.type === 'answer') {
    await pc.setRemoteDescription(s.data);
    for (const c of conn.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  } else if (s.type === 'candidate') {
    if (pc.remoteDescription) await pc.addIceCandidate(s.data).catch(() => {});
    else conn.pendingIce.push(s.data);
  }
}

// ---------- 받아쓰기 (각자 자기 마이크만) ----------

function startStt() {
  if (!SpeechRec) return toast('이 브라우저는 받아쓰기를 지원하지 않아요 (Chrome·Edge 권장)');
  const rec = new SpeechRec();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) saveLine(r[0].transcript);
      else interim += r[0].transcript;
    }
    call.interim = call.mic ? interim : '';
    renderTranscript();
  };
  // 조용하면 저절로 멈추므로 회의 중에는 다시 켠다
  rec.onend = () => { if (call.stt && call.id && call.rec === rec) setTimeout(() => { try { rec.start(); } catch (e) { /* 이미 켜짐 */ } }, 300); };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('받아쓰기를 쓸 수 없어요 (마이크 권한 또는 브라우저 설정 확인)');
      stopStt();
      renderDock();
    }
  };
  call.rec = rec;
  call.stt = true;
  try { rec.start(); } catch (e) { /* 이미 켜짐 */ }
}

function stopStt() {
  call.stt = false;
  const rec = call.rec;
  call.rec = null;
  call.interim = '';
  try { rec?.stop(); } catch (e) { /* 무시 */ }
}

function saveLine(text) {
  const t = maskPII(text).trim();
  if (!t || !call.id || !call.mic) return; // 마이크를 끈 동안의 말은 남기지 않는다
  callsRef().doc(call.id).collection('lines').add({
    uid: myUid(), memberId: state.meId, name: member(state.meId)?.name || authUser.name, text: t, at: Date.now(),
  }).catch(e => console.error(e));
}

// ---------- 요약 (규칙 기반) ----------

// 말로 한 문장이라 "~할게요", "~입니다", "~하기" 같은 말끝과 개인정보 가림 표시는 키워드에서 뺀다
function spokenKeywords(lines, n) {
  return extractKeywords(lines.map(l => l.text).join('\n'), 30)
    .filter(k => !/(요|다|니다|까지|게|죠|네|고|서|함|하기|하자|해서)$/.test(k) && !['이메일', '전화번호', '주민등록번호'].includes(k))
    .slice(0, n);
}

// 회의 발언 기록의 키워드 (예전에 만든 기록은 저장된 발언에서 다시 뽑는다)
function talkKeywords(item) {
  if (item.talk?.keywords) return item.talk.keywords;
  return spokenKeywords((item.talk?.transcript || '').split('\n').map(text => ({ text })), 10);
}

// 내 방에 소품으로 놓을 회의 키워드: 여러 회의에서 자주 말한 순, 이모지가 있는 것만, 이모지는 겹치지 않게
// raw = true: 이모지와 상관없이 자주 말한 순 목록 (방 옆 카드·사물 고르기용)
function roomTalkKeywords(talks, n = 6, raw = false) {
  const counts = new Map();
  talks.forEach(it => talkKeywords(it).forEach(k => {
    const e = counts.get(k) || { word: k, count: 0, itemIds: [] };
    e.count += 1;
    e.itemIds.push(it.id);
    counts.set(k, e);
  }));
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count || b.word.length - a.word.length);
  if (raw) return sorted.slice(0, n).map(e => ({ ...e, emoji: keywordEmoji(e.word) }));
  const usedEmoji = new Set();
  const out = [];
  for (const e of sorted) {
    const emoji = keywordEmoji(e.word);
    if (!emoji || usedEmoji.has(emoji)) continue;
    usedEmoji.add(emoji);
    out.push({ ...e, emoji });
    if (out.length >= n) break;
  }
  return out;
}

// 한 사람이 그 회의에서 한 말만 요약 (내 방의 🎙️ 회의 발언 기록)
function summarizeMine(lines, c) {
  const keywords = spokenKeywords(lines, 5);
  const said = lines.map(l => ({ ...l, s: l.text.trim() })).filter(l => l.s.length >= 6);
  const score = l => keywords.filter(k => l.s.includes(k)).length + (DECISION_PATTERN.test(l.s) ? 3 : 0) + Math.min(l.s.length, 80) / 80;
  const key = [...said].sort((a, b) => score(b) - score(a)).slice(0, 3).sort((a, b) => a.at - b.at);
  const decided = said.filter(l => DECISION_PATTERN.test(l.s)).slice(0, 3);
  return [
    `「${c.title}」 회의 (${fmtDate(c.startedAt)}) · 발언 ${lines.length}번`,
    `키워드: ${keywords.map(k => `#${k}`).join(' ') || '-'}`,
    '',
    '내 주요 발언',
    ...(key.length ? key : lines.slice(0, 3).map(l => ({ s: l.text.trim() }))).map(l => `- ${l.s}`),
    ...(decided.length ? ['', '내가 정한 것으로 보이는 말', ...decided.map(l => `- ${l.s}`)] : []),
  ].join('\n');
}

// 끝난 회의에서 내가 한 말이 있으면 요약해 내 방에 담는다.
// 보안 규칙상 남의 방에는 쓸 수 없어서 각자 자기 것을 만든다. 접속해 있지 않았으면 다음에 방을 열 때 만든다.
const TALK_DONE_KEY = 'brainroom:talks-done'; // 한 번 만든 것은 지워도 다시 만들지 않는다
let talkTimer = null;
let talkRunning = false;

function scheduleTalkSync() {
  clearTimeout(talkTimer);
  talkTimer = setTimeout(syncMyTalks, 2500); // 기록 목록을 다 받은 뒤에 확인
}

function talksDone() {
  try { return new Set(JSON.parse(localStorage.getItem(TALK_DONE_KEY)) || []); } catch (e) { return new Set(); }
}

async function syncMyTalks() {
  if (talkRunning || !cloudOn() || !cloud.loaded || !state?.meId || !Array.isArray(state.calls)) return;
  talkRunning = true;
  const teamId = cloud.teamId;
  const done = talksDone();
  const recent = state.calls.filter(c => c.status === 'ended' && Date.now() - (c.endedAt || 0) < 14 * 864e5);
  for (const c of recent) {
    const id = `talk_${c.id}_${state.meId}`;
    if (done.has(id) || state.items.some(i => i.id === id)) continue;
    let lines;
    try {
      const snap = await callsRef().doc(c.id).collection('lines').where('uid', '==', myUid()).get();
      lines = snap.docs.map(d => d.data()).sort((a, b) => a.at - b.at);
    } catch (e) {
      console.error(e);
      continue;
    }
    if (cloud.teamId !== teamId) break;
    done.add(id);
    if (!lines.length || state.items.some(i => i.id === id)) continue;
    const transcript = lines.map(l => l.text).join('\n');
    const keywords = spokenKeywords(lines, 10); // 내가 한 말에서 뽑은 키워드 (방 소품이 된다)
    const item = analyze({
      id, memberId: state.meId, type: 'talk', title: `${c.title}에서 내가 한 말`, content: summarizeMine(lines, c),
      url: '', createdAt: c.endedAt || Date.now(), visibility: 'team', table: null, votes: [],
      talk: { callId: c.id, lineCount: lines.length, keywords, transcript: transcript.length > 6000 ? `${transcript.slice(0, 6000)}\n…(이하 생략)` : transcript },
    });
    item.keywords = keywords.slice(0, 6); // 자동 분석 대신 발언 키워드로 (회의실 추천 연결에도 쓰임)
    state.items.push(item);
    saveState();
    toast(`🎙️ 「${c.title}」에서 한 말을 요약해 내 방 마이크에 담았어요`);
  }
  try { localStorage.setItem(TALK_DONE_KEY, JSON.stringify([...done].slice(-200))); } catch (e) { /* 무시 */ }
  talkRunning = false;
  render();
}

function summarizeMeeting(lines, attendees = []) {
  const names = attendees.length ? attendees : [...new Set(lines.map(l => l.name))];
  if (!lines.length) return `참석: ${names.join(', ') || '-'}\n녹취된 발언이 없어요.`;
  const counts = {};
  lines.forEach(l => { counts[l.name] = (counts[l.name] || 0) + 1; });
  // 말로 한 문장이라 "~할게요", "~입니다", "~하기" 같은 말끝과 개인정보 가림 표시는 키워드에서 뺀다
  const keywords = spokenKeywords(lines, 8);
  const said = lines.map(l => ({ ...l, s: l.text.trim() })).filter(l => l.s.length >= 6);
  const score = l => keywords.filter(k => l.s.includes(k)).length + (DECISION_PATTERN.test(l.s) ? 3 : 0) + Math.min(l.s.length, 80) / 80;
  const key = [...said].sort((a, b) => score(b) - score(a)).slice(0, 5).sort((a, b) => a.at - b.at);
  const decided = said.filter(l => DECISION_PATTERN.test(l.s)).slice(0, 5);
  const minutes = Math.max(1, Math.round((lines.at(-1).at - lines[0].at) / 60000));
  return [
    `참석: ${names.join(', ')}`,
    `녹취 시간: 약 ${minutes}분 · 발언 수: ${Object.entries(counts).map(([n, c]) => `${n} ${c}`).join(' · ')}`,
    `핵심 키워드: ${keywords.map(k => `#${k}`).join(' ') || '-'}`,
    '',
    '주요 발언',
    ...key.map(l => `- ${l.name}: ${l.s}`),
    ...(decided.length ? ['', '정한 것으로 보이는 말', ...decided.map(l => `- ${l.name}: ${l.s}`)] : []),
  ].join('\n');
}

// ---------- 떠 있는 회의 창 ----------

function getTile(uid, name, local) {
  let t = tiles.get(uid);
  if (!t) {
    t = document.createElement('div');
    t.className = 'call-tile';
    t.innerHTML = '<video autoplay playsinline></video><span class="tile-name"></span><span class="tile-state"></span>';
    if (local) t.querySelector('video').muted = true; // 내 소리가 내 스피커로 다시 나오지 않도록
    tiles.set(uid, t);
  }
  t.querySelector('.tile-name').textContent = name;
  return t;
}

const STATE_TEXT = { new: '연결 준비', connecting: '연결 중…', connected: '', disconnected: '연결 끊김', failed: '연결 실패', closed: '나감' };

function renderDock() {
  let dock = document.getElementById('callDock');
  if (!call.id) { dock?.remove(); return; }
  if (!dock) {
    dock = document.createElement('aside');
    dock.id = 'callDock';
    document.body.appendChild(dock);
  }
  dock.className = `call-dock ${call.big ? '' : 'small'}`;
  dock.innerHTML = `
    <header class="call-head">
      <b>🔴 ${esc(call.title)}</b><span class="muted sm">${call.peers.size + 1}명</span>
      <button class="btn icon" data-mt="size" title="${call.big ? '작게' : '크게'}">${call.big ? '➖' : '⬜'}</button>
    </header>
    <div class="call-grid"></div>
    <div class="call-transcript" aria-live="polite"></div>
    <div class="call-controls">
      <button class="btn sm ${call.mic ? '' : 'off'}" data-mt="mic">${call.mic ? '🎤 마이크 켜짐' : '🔇 마이크 꺼짐'}</button>
      ${call.cam !== null && call.stream?.getVideoTracks().length
        ? `<button class="btn sm ${call.cam ? '' : 'off'}" data-mt="cam">${call.cam ? '📷 카메라 켜짐' : '📷 카메라 꺼짐'}</button>` : ''}
      <button class="btn sm ${call.stt ? '' : 'off'}" data-mt="stt">${call.stt ? '📝 받아쓰기 켜짐' : '📝 받아쓰기 꺼짐'}</button>
      <button class="btn sm" data-mt="leave">🚪 나가기</button>
      <button class="btn sm danger" data-mt="end">⏹ 회의 끝내기</button>
    </div>`;
  const grid = dock.querySelector('.call-grid');
  const me = getTile(myUid(), `${member(state.meId)?.name || authUser.name} (나)`, true);
  const meVideo = me.querySelector('video');
  if (meVideo.srcObject !== call.stream) meVideo.srcObject = call.stream;
  me.classList.toggle('no-video', !(call.cam && call.stream?.getVideoTracks().length));
  me.querySelector('.tile-state').textContent = call.mic ? '' : '🔇';
  grid.appendChild(me);
  for (const [uid, p] of call.peers) {
    const conn = call.pcs.get(uid);
    const t = getTile(uid, p.name, false);
    const v = t.querySelector('video');
    if (conn?.stream && v.srcObject !== conn.stream) v.srcObject = conn.stream;
    t.classList.toggle('no-video', !(p.cam && conn?.stream?.getVideoTracks().length));
    t.querySelector('.tile-state').textContent = STATE_TEXT[conn?.pc.connectionState] ?? '';
    grid.appendChild(t);
  }
  renderTranscript();
}

function renderTranscript() {
  const box = document.querySelector('#callDock .call-transcript');
  if (!box) return;
  const recent = call.lines.slice(-30);
  box.innerHTML = (recent.map(l => `<p><b>${esc(l.name)}</b> ${esc(l.text)}</p>`).join('')
    + (call.interim ? `<p class="interim"><b>${esc(member(state.meId)?.name || '나')}</b> ${esc(call.interim)}…</p>` : ''))
    || `<p class="muted sm">${call.stt ? '말하면 여기에 받아써져요.' : '받아쓰기가 꺼져 있어요.'}</p>`;
  box.scrollTop = box.scrollHeight;
}

// ---------- 🎙️ 회의 화면 ----------

const STT_NOTICE = '📝 받아쓰기를 켜면 브라우저(Chrome·Edge)가 <b>내 마이크 소리만</b> 음성 인식 서버로 보내 글자로 바꿔요. 녹취록은 이 방 팀원만 볼 수 있어요. 이어폰을 쓰면 다른 사람 목소리가 내 발언으로 잘못 받아써지는 걸 막을 수 있어요.';

function callOptionsHTML() {
  return `
    <label class="check"><input type="checkbox" name="cam"> 📷 카메라 켜고 참여</label>
    <label class="check"><input type="checkbox" name="stt" ${SpeechRec ? 'checked' : 'disabled'}> 📝 내 발언 받아쓰기${SpeechRec ? '' : ' (이 브라우저는 지원 안 함)'}</label>`;
}

function renderMeetings() {
  if (!cloudOn()) {
    app.innerHTML = `
    <section><div class="page-head"><div><h1>🎙️ 회의</h1></div></div>
      <p class="card">음성·화상 회의는 <b>온라인 방</b>에서만 할 수 있어요. 로그인한 뒤 🏠 방 목록에서 방을 만들거나 참여해 주세요.</p></section>`;
    return;
  }
  const live = liveCalls();
  const past = (state.calls || []).filter(c => c.status === 'ended');
  app.innerHTML = `
  <section>
    <div class="page-head">
      <div>
        <h1>🎙️ 회의</h1>
        <p class="muted">방 팀원끼리 음성·화상으로 회의하고, 각자 자기 마이크를 받아써 발언자별 녹취록과 요약을 남겨요. 회의 중에도 다른 화면을 볼 수 있어요.</p>
      </div>
    </div>
    ${state.calls === null ? '<p class="notice">⚠️ 회의 기록을 읽을 권한이 없어요. Firebase 콘솔의 Firestore 규칙을 최신 <code>firestore.rules</code>로 다시 게시해 주세요.</p>' : ''}

    ${live.map(c => `
      <div class="card live-call">
        <h3>🔴 진행 중: ${esc(c.title)}</h3>
        <p class="muted sm">${esc(c.startedByName || '')} 님이 ${fmtDate(c.startedAt)}에 시작</p>
        ${call.id === c.id ? '<p><b>참여 중이에요.</b> 오른쪽 아래 회의 창을 보세요.</p>' : `
        <form class="call-form" data-join="${c.id}">
          ${callOptionsHTML()}
          <p class="notice sm">${STT_NOTICE}</p>
          <div class="modal-actions"><button type="button" class="btn ghost sm danger" data-mt="end:${c.id}">회의 끝내기</button><button class="btn primary">참여하기</button></div>
        </form>`}
      </div>`).join('')}

    ${live.length || call.id ? '' : `
      <form id="callStartForm" class="card call-form">
        <h3>새 회의 시작</h3>
        <input name="title" maxlength="40" placeholder="회의 제목 (예: ${fmtDate(Date.now(), false)} 주제 정하기)">
        ${callOptionsHTML()}
        <p class="notice sm">${STT_NOTICE}</p>
        <div class="modal-actions"><button class="btn primary">🎙️ 회의 시작</button></div>
      </form>`}

    <h2 class="past-title">지난 회의 <span class="muted sm">${past.length}건</span></h2>
    <div class="past-list">${past.map(c => `
      <article class="card past-call">
        <header><b>${esc(c.title)}</b>
          <span class="muted sm">${fmtDate(c.startedAt)} · 약 ${Math.max(1, Math.round(((c.endedAt || c.startedAt) - c.startedAt) / 60000))}분 · 녹취 ${c.lineCount ?? 0}줄</span></header>
        <details open><summary>요약</summary><pre class="call-summary">${esc(c.summary || '요약이 없어요.')}</pre></details>
        <details data-lines="${c.id}"><summary>전체 녹취록</summary><div class="call-lines">${pastLinesHTML(c.id)}</div></details>
      </article>`).join('') || '<p class="muted">아직 끝난 회의가 없어요.</p>'}</div>
  </section>`;
}

function pastLinesHTML(id) {
  const lines = pastLines.get(id);
  if (!lines) return '<p class="muted sm">불러오는 중…</p>';
  return lines.map(l => `<p><span class="muted sm">${fmtDate(l.at).split(' ')[1]}</span> <b>${esc(l.name)}</b> ${esc(l.text)}</p>`).join('')
    || '<p class="muted sm">녹취된 발언이 없어요.</p>';
}

async function loadPastLines(id) {
  if (pastLines.has(id)) return;
  try {
    const snap = await callsRef().doc(id).collection('lines').orderBy('at').get();
    pastLines.set(id, snap.docs.map(d => d.data()));
  } catch (e) {
    pastLines.set(id, []);
    writeFailed(e);
  }
  const box = document.querySelector(`[data-lines="${id}"] .call-lines`);
  if (box) box.innerHTML = pastLinesHTML(id);
}

// ---------- 이벤트 ----------

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-mt]');
  if (!btn) return;
  const [act, arg] = btn.dataset.mt.split(':');
  if (act === 'size') { call.big = !call.big; return renderDock(); }
  if (act === 'mic') {
    call.mic = !call.mic;
    call.stream?.getAudioTracks().forEach(t => { t.enabled = call.mic; });
    if (!call.mic) call.interim = '';
    return renderDock();
  }
  if (act === 'cam') {
    call.cam = !call.cam;
    call.stream?.getVideoTracks().forEach(t => { t.enabled = call.cam; });
    callsRef().doc(call.id).collection('peers').doc(myUid()).update({ cam: call.cam }).catch(() => {});
    return renderDock();
  }
  if (act === 'stt') {
    if (call.stt) stopStt(); else startStt();
    return renderDock();
  }
  if (act === 'leave') return leaveCall();
  if (act === 'end') {
    const id = arg || call.id;
    if (!confirm('회의를 끝내고 녹취록을 요약할까요? 참여 중인 사람은 모두 나가져요.')) return;
    return endCall(id).then(() => { if (call.id === id) leaveCall(false); toast('회의를 끝내고 요약했어요'); });
  }
});

document.addEventListener('toggle', e => {
  const d = e.target;
  if (d.matches?.('[data-lines]') && d.open) loadPastLines(d.dataset.lines);
}, true);

document.addEventListener('submit', e => {
  const form = e.target;
  if (form.id !== 'callStartForm' && !form.dataset.join) return;
  e.preventDefault();
  const data = new FormData(form);
  const opts = { cam: data.get('cam') === 'on', stt: data.get('stt') === 'on' };
  if (form.id === 'callStartForm') startCall(data.get('title').trim(), opts);
  else joinCall(form.dataset.join, opts);
});
