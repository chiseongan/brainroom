// 연동 토큰 암호화 보관 (LS-6)
// 이 브라우저 안에서만 쓰는 AES-GCM 키를 '꺼낼 수 없는(non-extractable)' 형태로 만들어 IndexedDB에 두고,
// 토큰은 그 키로 암호화한 값만 localStorage에 저장한다. 저장소 파일을 복사해 가도 키 없이는 풀 수 없다.
// (IndexedDB를 못 쓰는 환경에서는 예전처럼 평문으로 두고, 쓸 수 있게 되면 다음 저장 때 암호화된다)

const SECURE_DB = 'brainroom-secure';
let secureKeyPromise = null;

function secureKey() {
  if (secureKeyPromise) return secureKeyPromise;
  secureKeyPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !crypto?.subtle) return resolve(null);
    const open = indexedDB.open(SECURE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction('keys').objectStore('keys').get('token-key');
      get.onsuccess = async () => {
        if (get.result) return resolve(get.result);
        try {
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          const tx = db.transaction('keys', 'readwrite');
          tx.objectStore('keys').put(key, 'token-key');
          tx.oncomplete = () => resolve(key);
          tx.onerror = () => resolve(null);
        } catch (e) { reject(e); }
      };
      get.onerror = () => resolve(null);
    };
  }).catch(() => null);
  return secureKeyPromise;
}

const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// 평문 토큰 → { sealed: 1, iv, data } (키가 없으면 평문 그대로)
async function sealToken(plain) {
  if (!plain) return '';
  const key = await secureKey();
  if (!key) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { sealed: 1, iv: toB64(iv), data: toB64(data) };
}

// 암호화된 토큰 → 평문 (예전에 평문으로 저장된 것은 그대로)
async function openToken(stored) {
  if (!stored) return '';
  if (typeof stored === 'string') return stored;
  const key = await secureKey();
  if (!key) return '';
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(stored.iv) }, key, fromB64(stored.data));
    return new TextDecoder().decode(plain);
  } catch (e) {
    return ''; // 다른 브라우저에서 옮겨 온 값 등 → 다시 연결해야 한다
  }
}
