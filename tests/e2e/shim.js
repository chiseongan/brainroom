// E2E 전용: 진짜 Firestore SDK를 에뮬레이터에 붙이고, Google 로그인만 가짜로 바꾼다.
// 규칙은 에뮬레이터가 실제 firestore.rules로 강제한다. (앱의 index.html 그대로에 이 파일만 끼워 넣는다)
(() => {
  const params = new URLSearchParams(location.search);
  const u = params.get('u');
  const user = parent.USERS[u];
  const PROXY = params.get('proxy');

  // 앱의 실패 로그를 모아 host가 '규칙에 막힌 쓰기'를 찾아낸다
  window.__errors = [];
  const origError = console.error;
  console.error = (...a) => {
    window.__errors.push(a.map(x => (x && x.code ? `${x.code}: ${x.message}` : String(x))).join(' '));
    origError(...a);
  };
  window.__warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => {
    window.__warns.push(a.map(x => (x && x.code ? `${x.code}: ${x.message}` : String(x))).join(' '));
    origWarn(...a);
  };
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`));
  window.addEventListener('error', e => window.__errors.push(`exception: ${e.message}`));
  window.addEventListener('unhandledrejection', e => window.__errors.push(`rejection: ${e.reason?.code || ''} ${e.reason?.message || e.reason}`));

  // 브라우저 기본 창이 다시 쓰이면 바로 드러나게 한다
  window.__systemDialogs = 0;
  window.confirm = () => { window.__systemDialogs++; return true; };
  window.prompt = () => { window.__systemDialogs++; return null; };
  window.alert = () => { window.__systemDialogs++; };
  // 앱의 확인 창은 시험에서 자동으로 답한다 (창 자체는 시나리오에서 따로 시험한다)
  window.__promptAnswer = null;
  window.__dialogChoice = undefined;
  window.__testDialog = opts => {
    if (opts.input) return window.__promptAnswer;
    return window.__dialogChoice !== undefined ? window.__dialogChoice : opts.buttons[opts.buttons.length - 1].value;
  };

  const fbUser = { uid: user.uid, displayName: user.name, email: user.email, photoURL: '' };
  const currentUser = {
    ...fbUser,
    delete: async () => { window.__authDeleted = true; },
    getIdToken: async () => (await fetch(`${PROXY}/test-token?uid=${user.uid}`)).text(),
    reauthenticateWithPopup: async () => { throw new Error('no popup in test'); },
  };
  const fakeAuth = () => ({
    onAuthStateChanged: cb => setTimeout(() => cb(fbUser), 0),
    signOut: async () => {},
    currentUser,
  });
  firebase.auth = Object.assign(fakeAuth, { GoogleAuthProvider: function () {} });

  const realFirestore = firebase.firestore;
  let inst = null;
  firebase.firestore = Object.assign(() => {
    if (inst) return inst;
    inst = realFirestore();
    inst.settings({ ignoreUndefinedProperties: true, merge: true });
    inst.useEmulator('127.0.0.1', 8201 + ['uA', 'uB', 'uC', 'uP', 'uX'].indexOf(u), { mockUserToken: { sub: user.uid, user_id: user.uid, email: user.email } });
    inst.settings = () => {}; // 앱의 settings 호출은 건너뛴다 (이미 같은 값)
    return inst;
  }, realFirestore);
})();
