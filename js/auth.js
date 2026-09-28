// Google 로그인 (Firebase Authentication, compat SDK).
// FIREBASE_CONFIG가 비어 있으면 로그인 없이 데모 모드로 동작한다.

const AUTH_ENABLED = Boolean(FIREBASE_CONFIG.apiKey) && typeof firebase !== 'undefined';
let authUser = null; // { uid, name, email, photo }
let authReady = false;

if (FIREBASE_CONFIG.apiKey && typeof firebase === 'undefined') {
  console.warn('Firebase SDK를 불러오지 못해 데모 모드로 실행합니다. (인터넷 연결 확인)');
}

function initAuth(onChange) {
  if (!AUTH_ENABLED) {
    authReady = true;
    onChange();
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  firebase.auth().onAuthStateChanged(user => {
    authUser = user && {
      uid: user.uid,
      name: user.displayName || (user.email || '').split('@')[0] || '팀원',
      email: user.email || '',
      photo: user.photoURL || '',
    };
    authReady = true;
    onChange();
  });
}

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    if (e.code === 'auth/popup-blocked') return firebase.auth().signInWithRedirect(provider);
    if (e.code === 'auth/unauthorized-domain') return toast('이 주소는 Firebase 승인된 도메인에 등록되어 있지 않아요');
    toast(`로그인에 실패했어요 (${e.code || e.message})`);
  }
}

function signOutUser() {
  return firebase.auth().signOut();
}
