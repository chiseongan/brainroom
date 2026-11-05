// 동의·나이 확인·보호자 동의·내 데이터 내려받기·계정 삭제.
// 누구나 쓸 수 있는 서비스이므로 만 14세 미만은 법정대리인 동의가 있어야 방을 만들거나 들어간다 (규칙도 확인한다).
// 나이는 생년월일 없이 '만 14세 이상인가'만 묻는다.

const CONSENT_VERSION = '2026-11-05'; // 약관·방침을 크게 바꾸면 올린다 → 다시 동의를 받는다
const GUARDIAN_PARAM = 'guardian';
const LEGAL_DOCS = { privacy: 'legal/privacy.html', terms: 'legal/terms.html' };

function guardianTokenInUrl() {
  const t = new URLSearchParams(location.search).get(GUARDIAN_PARAM);
  return t && isId(t) ? t : null;
}

async function loadConsent() {
  const snap = await userRef().get();
  const c = snap.data()?.consent || null;
  cloud.consent = c;
  cloud.guardianStatus = null;
  if (c && c.over14 === false && isId(c.guardianToken)) {
    const g = await db.collection('guardianRequests').doc(c.guardianToken).get().catch(() => null);
    cloud.guardianStatus = g?.exists ? asStr(g.data().status) : 'missing';
  }
  cloud.consentChecked = true;
}

function consentOk() {
  const c = cloud.consent;
  if (!c || c.version !== CONSENT_VERSION || !c.terms || !c.privacy) return false;
  return c.over14 === true || cloud.guardianStatus === 'approved';
}

// 로그인했는데 동의가 아직이면 화면을 대신 그리고 true
function legalGate() {
  if (!CLOUD_ENABLED || !authUser || guestMode) return false;
  if (guardianTokenInUrl()) { renderGuardianApprove(); return true; }
  if (!cloud.consentChecked) return false;
  if (consentOk()) return false;
  // 같은 판에 만 14세 미만으로 답한 사람은 보호자 동의를 기다린다
  if (cloud.consent?.over14 === false && cloud.consent.version === CONSENT_VERSION) { renderGuardianWait(); return true; }
  renderConsent();
  return true;
}

function renderConsent() {
  $('#topbar').hidden = true;
  const again = Boolean(cloud.consent);
  app.innerHTML = `
  <section class="setup">
    <form id="consentForm" class="setup-card consent-card">
      <h1>${again ? '약관이 바뀌었어요' : '시작하기 전에'}</h1>
      <p class="lead">BrainRoom은 무료예요. 팀 방에는 초대받은 사람만 들어올 수 있어요.</p>

      <fieldset>
        <legend>나이를 알려 주세요 <span class="required">필수</span></legend>
        <label class="check"><input type="radio" name="age" value="14plus" required> 만 14세 이상이에요</label>
        <label class="check"><input type="radio" name="age" value="under14" required> 만 14세 미만이에요 <span class="muted sm">(보호자 동의가 필요해요)</span></label>
        <p class="muted sm">생년월일은 받지 않아요. 만 14세 미만으로 고르면 이후에 혼자 바꿀 수 없어요.</p>
      </fieldset>

      <fieldset>
        <legend>동의 항목</legend>
        <label class="check"><input type="checkbox" name="terms" required> <span><span class="required">필수</span> <a href="${LEGAL_DOCS.terms}" target="_blank" rel="noopener">이용약관</a>에 동의해요</span></label>
        <label class="check"><input type="checkbox" name="privacy" required> <span><span class="required">필수</span> <a href="${LEGAL_DOCS.privacy}" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의해요</span></label>
        <details class="sm consent-detail"><summary>수집·이용 내용 요약</summary>
          <ul>
            <li><b>항목:</b> Google 계정 고유번호, 표시 이름, 내가 담은 기록, 받아쓰기를 켠 회의의 글자, 동의 기록</li>
            <li><b>목적:</b> 로그인, 팀 방 운영, 활동 기록</li>
            <li><b>보관:</b> 계정을 지우거나 방을 삭제할 때까지. 언제든 지울 수 있어요</li>
            <li><b>동의하지 않으면:</b> 방을 만들거나 들어갈 수 없어요. 샘플 체험은 그대로 쓸 수 있어요</li>
          </ul>
          <p>받아쓰기, AI 정리, 외부 도구 연동은 여기서 동의받지 않아요. 쓰고 싶을 때 직접 켜요.</p>
        </details>
      </fieldset>

      <div class="modal-actions consent-actions">
        <button type="button" class="btn" id="logoutBtn">동의하지 않고 로그아웃</button>
        <button class="btn">동의하고 계속하기</button>
      </div>
    </form>
  </section>`;
}

async function saveConsent(form) {
  const data = new FormData(form);
  const over14 = data.get('age') === '14plus';
  const consent = { version: CONSENT_VERSION, at: Date.now(), over14, terms: data.get('terms') === 'on', privacy: data.get('privacy') === 'on' };
  try {
    if (over14) {
      await userRef().set({ consent }, { merge: true });
    } else {
      const token = randomCode();
      const batch = db.batch();
      batch.set(db.collection('guardianRequests').doc(token), { childUid: authUser.uid, status: 'pending', createdAt: Date.now(), version: CONSENT_VERSION });
      batch.set(userRef(), { consent: { ...consent, guardianToken: token } }, { merge: true });
      await batch.commit();
    }
    cloud.consentChecked = false;
    return cloudOnAuth();
  } catch (e) {
    writeFailed(e, '동의');
  }
}

function renderGuardianWait() {
  $('#topbar').hidden = true;
  const token = cloud.consent.guardianToken;
  const link = `${location.origin}${location.pathname}?${GUARDIAN_PARAM}=${encodeURIComponent(token)}`;
  const status = cloud.guardianStatus;
  app.innerHTML = `
  <section class="setup">
    <div class="setup-card consent-card">
      <h1>보호자의 동의가 필요해요</h1>
      ${status === 'rejected' || status === 'revoked' ? '<p class="notice">보호자가 동의하지 않았어요. 방을 쓰려면 보호자와 이야기해 보세요.</p>' : ''}
      <p class="lead">만 14세 미만은 보호자가 동의해야 BrainRoom을 쓸 수 있어요. 아래 링크를 보호자에게 보내 주세요.</p>
      <label class="sm invite">보호자에게 보낼 링크 <span><input id="guardianLink" readonly value="${esc(link)}"><button type="button" class="btn sm" id="guardianCopy">복사</button></span></label>
      <p class="muted sm">보호자가 본인 Google 계정으로 로그인해 내용을 읽고 동의해요. 동의 전에는 기록이 저장되지 않아요.</p>
      <div class="modal-actions consent-actions">
        <button class="btn" id="logoutBtn">로그아웃</button>
        <button class="btn primary" id="guardianCheck">동의 확인하기</button>
      </div>
      <button class="btn ghost sm" id="deleteAccountBtn">이 계정 지우기</button>
    </div>
  </section>`;
}

async function renderGuardianApprove() {
  $('#topbar').hidden = true;
  const token = guardianTokenInUrl();
  app.innerHTML = '<div class="loading">불러오는 중…</div>';
  initDb();
  let req = null;
  try {
    const snap = await db.collection('guardianRequests').doc(token).get();
    req = snap.exists ? snap.data() : null;
  } catch (e) { console.error(e); }
  if (guardianTokenInUrl() !== token) return;
  const footer = '<div class="modal-actions consent-actions"><button class="btn" id="guardianDone">끝내기</button></div>';
  if (!req) {
    app.innerHTML = `<section class="setup"><div class="setup-card consent-card"><h1>찾을 수 없는 링크예요</h1><p class="lead">링크가 잘못됐거나 아이의 계정이 삭제됐어요.</p>${footer}</div></section>`;
    return;
  }
  if (req.childUid === authUser.uid) {
    app.innerHTML = `<section class="setup"><div class="setup-card consent-card"><h1>보호자가 열어야 하는 링크예요</h1><p class="lead">이 링크는 보호자가 <b>본인 Google 계정</b>으로 열어야 해요. 보호자에게 보내 주세요.</p>${footer}</div></section>`;
    return;
  }
  const decided = req.status === 'approved' ? '이미 <b>동의</b>한 상태예요.' : req.status === 'rejected' || req.status === 'revoked' ? '<b>동의하지 않은</b> 상태예요.' : '';
  app.innerHTML = `
  <section class="setup">
    <form id="guardianForm" class="setup-card consent-card">
      <h1>만 14세 미만 자녀의 이용 동의</h1>
      <p class="lead">자녀가 BrainRoom을 쓰려고 동의를 요청했어요. 지금 <b>${esc(authUser.email)}</b> 계정으로 로그인해 있어요.</p>
      ${decided ? `<p class="notice">${decided} 아래에서 바꿀 수 있어요.</p>` : ''}
      <h2>동의하면 처리되는 정보</h2>
      <ul class="sm">
        <li><b>자녀의 정보:</b> Google 계정 고유번호, 표시 이름, 자녀가 담은 기록, 받아쓰기를 켠 회의의 글자</li>
        <li><b>보호자의 정보:</b> Google 계정 고유번호, 이메일, 동의 시각 (동의 확인 목적)</li>
        <li><b>목적:</b> 팀 활동 기록. 팀 방에는 초대받은 사람만 들어올 수 있어요</li>
        <li><b>보관:</b> 자녀의 계정을 지울 때까지</li>
        <li><b>외부 전달:</b> Google(로그인·저장). 받아쓰기·AI 정리·외부 도구는 자녀가 직접 켰을 때만</li>
      </ul>
      <p class="sm">회의에서는 자녀의 목소리·영상이 방의 참여자에게 전달돼요. 자세한 내용은 <a href="${LEGAL_DOCS.privacy}" target="_blank" rel="noopener">개인정보처리방침</a>과 <a href="${LEGAL_DOCS.terms}" target="_blank" rel="noopener">이용약관</a>을 보세요.</p>
      <p class="sm">이 링크를 다시 열면 언제든 철회할 수 있어요. 자녀의 정보 열람·삭제는 ${LEGAL.contactEmail ? esc(LEGAL.contactEmail) : '개인정보처리방침의 연락처'}로 요청하세요.</p>
      <label class="check"><input type="checkbox" name="attest" required> <span><span class="required">필수</span> 저는 이 자녀의 법정대리인(부모 등)이고 성인이며, 위 내용에 동의해요</span></label>
      <div class="modal-actions consent-actions">
        <button type="button" class="btn" data-guardian="${req.status === 'approved' ? 'revoked' : 'rejected'}">${req.status === 'approved' ? '동의 철회하기' : '동의하지 않기'}</button>
        <button class="btn" ${req.status === 'approved' ? 'disabled' : ''}>동의하기</button>
      </div>
    </form>
  </section>`;
}

async function decideGuardian(status) {
  const token = guardianTokenInUrl();
  try {
    await db.collection('guardianRequests').doc(token).update({ status, guardianUid: authUser.uid, guardianEmail: authUser.email, decidedAt: Date.now() });
    const text = status === 'approved' ? '동의했어요. 자녀가 이제 BrainRoom을 쓸 수 있어요.' : '동의하지 않음으로 기록했어요.';
    app.innerHTML = `<section class="setup"><div class="setup-card consent-card"><h1>처리했어요</h1><p class="lead">${text}</p><div class="modal-actions consent-actions"><button class="btn" id="guardianDone">끝내기</button></div></div></section>`;
  } catch (e) {
    writeFailed(e, '보호자 동의');
  }
}

document.addEventListener('submit', e => {
  if (e.target.id === 'consentForm') { e.preventDefault(); saveConsent(e.target); }
  if (e.target.id === 'guardianForm') { e.preventDefault(); decideGuardian('approved'); }
});

document.addEventListener('click', async e => {
  const t = e.target;
  if (t.closest('#guardianCopy')) {
    try { await navigator.clipboard.writeText($('#guardianLink').value); toast('링크를 복사했어요'); } catch (err) { $('#guardianLink').select(); }
  } else if (t.closest('#guardianCheck')) {
    await loadConsent();
    if (consentOk()) return cloudOnAuth();
    toast('아직 동의하지 않았어요');
    render();
  } else if (t.closest('[data-guardian]')) {
    decideGuardian(t.closest('[data-guardian]').dataset.guardian);
  } else if (t.closest('#guardianDone')) {
    history.replaceState(null, '', location.pathname);
    signOutUser();
  } else if (t.closest('#downloadMyData')) {
    downloadMyData();
  } else if (t.closest('#deleteAccountBtn')) {
    deleteMyAccount();
  }
});

// ---------- 내 데이터 내려받기 ----------

async function downloadMyData() {
  toast('내 데이터를 모으는 중…');
  try {
    const user = (await userRef().get()).data() || {};
    const rooms = [];
    for (const id of Object.keys(cloud.myTeams)) {
      const t = teamRef(id);
      const role = (await t.collection('members').doc(authUser.uid).get()).data() || {};
      const room = { room: cloud.myTeams[id].name, role: role.role, records: [], lines: [], profile: null };
      if (role.role === 'student') {
        room.records = (await t.collection('items').where('ownerUid', '==', authUser.uid).get()).docs.map(d => d.data());
        if (role.memberId) room.profile = (await t.collection('roster').doc(role.memberId).get()).data() || null;
        for (const c of (await t.collection('calls').get()).docs) {
          const lines = await c.ref.collection('lines').where('uid', '==', authUser.uid).get();
          lines.docs.forEach(l => room.lines.push({ call: c.data().title, ...l.data() }));
        }
      }
      rooms.push(room);
    }
    download('brainroom_내_데이터.json', JSON.stringify({ exportedAt: new Date().toISOString(), account: { uid: authUser.uid, email: authUser.email, name: authUser.name }, consent: user.consent || null, rooms }, null, 2), 'application/json');
    toast('내 데이터를 내려받았어요');
  } catch (e) {
    writeFailed(e, '내 데이터');
  }
}

// ---------- 계정과 데이터 삭제 (동의 철회) ----------

async function deleteMyAccount() {
  const typed = await uiPrompt('계정과 데이터를 모두 지울까요?',
    '내 기록, 회의에서 한 말, 동의 기록, 로그인 계정이 지워지고 되돌릴 수 없어요.\n내가 만든 방은 다른 팀원에게 팀장이 넘어가고, 혼자인 방은 삭제돼요.\n다른 사람이 쓴 기록이나 회의 요약에 적힌 내 이름은 남을 수 있어요.',
    { ok: '모두 지우기', danger: true, label: '계속하려면 "삭제"를 입력하세요', mustEqual: '삭제' });
  if (typed === null) return;
  if (typed.trim() !== '삭제') return toast('"삭제"를 정확히 입력해 주세요');
  closeModal();
  closePanel();
  const failed = [];
  try {
    if (cloud.teamId) {
      await quiesceCloud();
      cloud.teamId = null;
      cloud.loaded = false;
      cloudClose();
    }
    state = null;
    cloud.busy = true;
    render();
    await loadMyTeams().catch(() => {});
    for (const id of Object.keys(cloud.myTeams)) {
      await leaveRoomForDeletion(id).catch(e => { console.error(e); failed.push(cloud.myTeams[id].name); });
    }
    if (failed.length) throw Object.assign(new Error('rooms'), { code: 'rooms-failed' });
    if (cloud.consent?.guardianToken) await db.collection('guardianRequests').doc(cloud.consent.guardianToken).delete().catch(() => {});
    await userRef().delete();
    await deleteAuthAccount();
    wipeLocalData();
    cloud.busy = false;
    toast('계정과 데이터를 지웠어요');
    await signOutUser().catch(() => {});
  } catch (e) {
    console.error(e);
    cloud.busy = false;
    toast(failed.length ? `일부 방(${failed.join(', ')})을 정리하지 못했어요. 다시 시도하거나 운영자에게 요청해 주세요` : '계정을 다 지우지 못했어요. 다시 로그인해 시도하거나 운영자에게 요청해 주세요');
    cloud.consentChecked = false;
    cloudOnAuth();
  }
}

async function leaveRoomForDeletion(id) {
  const t = teamRef(id);
  const roleRef = t.collection('members').doc(authUser.uid);
  const role = (await roleRef.get()).data();
  if (!role) return;
  if (role.role === 'prof') return roleRef.delete();
  const team = (await t.get()).data();
  if (team?.ownerUid === authUser.uid) {
    const others = (await t.collection('members').get()).docs.map(d => d.data()).filter(r => r.uid !== authUser.uid && r.role === 'student');
    if (!others.length) return teardownTeam(id); // 혼자인 방은 삭제
    await t.update({ ownerUid: others[0].uid }); // 가장 먼저 들어온 팀원에게 넘긴다
  }
  await eraseMyRecords(t);
  await t.collection('presence').doc(authUser.uid).delete().catch(() => {});
  const logs = await t.collection('accessLogs').where('uid', '==', authUser.uid).get().catch(() => ({ docs: [] }));
  await deleteDocs(logs.docs).catch(() => {});
  const batch = db.batch();
  if (role.memberId) {
    // 칸은 다른 사람 기록과 이어져 있어 남기되 이름을 지운다
    const entry = (await t.collection('roster').doc(role.memberId).get()).data();
    batch.set(t.collection('roster').doc(role.memberId), { id: role.memberId, name: '탈퇴한 팀원', color: SAFE_COLOR.test(entry?.color || '') ? entry.color : '#94a3b8', at: finite(entry?.at) });
    batch.delete(t.collection('claims').doc(role.memberId));
  }
  batch.delete(roleRef);
  await batch.commit();
}

async function deleteAuthAccount() {
  const user = firebase.auth().currentUser;
  try {
    await user.delete();
  } catch (e) {
    if (e.code !== 'auth/requires-recent-login') throw e;
    await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
    await user.delete();
  }
}

function wipeLocalData() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('brainroom:')).forEach(k => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter(k => k.startsWith('brainroom:')).forEach(k => sessionStorage.removeItem(k));
  } catch (e) { /* 무시 */ }
}

// 화면 아래 운영자 표시
(function fillLegalFooter() {
  const el = typeof document !== 'undefined' && document.getElementById('legalOperator');
  if (el) el.textContent = LEGAL.operator ? `운영: ${LEGAL.operator}${LEGAL.contactEmail ? ` · ${LEGAL.contactEmail}` : ''}` : '운영자 정보 입력 필요';
})();
