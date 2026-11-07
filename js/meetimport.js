// Google Meet 녹취록 가져오기 (RQ-4)
// - Google Drive에서 녹취록 문서를 고르거나(Google Picker, drive.file 권한 = 고른 파일만 읽음), 내려받은 .txt/.vtt 파일을 올린다.
// - 화자를 팀원과 짝지어 '끝난 회의'로 저장한다 → 요약이 생기고, 각 팀원 방에 '내가 한 말'(js/meeting.js syncMyTalks)도 생긴다.
// - 녹취록 문서 형식은 Meet 버전에 따라 다를 수 있어 여러 형태를 너그럽게 읽는다:
//     "이름: 말"  /  "이름\n00:01:23\n말"  /  WebVTT "<v 이름>말"  /  SBV·SRT 시간줄

const TIME_LINE = /^\[?\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?\]?(\s*-->\s*.*|,\d{1,2}:\d{2}(:\d{2})?([.,]\d+)?)?$/;
const SKIP_LINE = /^(WEBVTT|NOTE\b|\d+$|transcript$|녹취록$|녹취 기록$|참석자|attendees|meeting ended|회의가 종료|this editable transcript|이 수정 가능한)/i;

function parseTranscript(text) {
  const rows = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim());
  const entries = [];
  let cur = null;
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i];
    if (!t || TIME_LINE.test(t) || SKIP_LINE.test(t)) continue;
    // WebVTT 화자 표시
    const v = t.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/i);
    if (v) { entries.push(cur = { name: v[1].trim(), text: v[2].trim() }); continue; }
    // "이름\n00:01:23\n말" 형태: 다음 줄이 시각이면 이 줄은 화자 이름
    const next = rows.slice(i + 1).find(Boolean) || '';
    if (t.length <= 30 && TIME_LINE.test(next) && !/[.?!。]$/.test(t)) { cur = { name: t.replace(/[:：]$/, ''), text: '' }; entries.push(cur); continue; }
    // "이름: 말" 형태
    const m = t.match(/^([^:：]{1,30}?)\s*[:：]\s*(.+)$/);
    if (m && !/^\d/.test(m[1]) && !/https?$/i.test(m[1])) { entries.push(cur = { name: m[1].trim(), text: m[2].trim() }); continue; }
    if (cur) cur.text = `${cur.text} ${t}`.trim();
    else entries.push(cur = { name: '', text: t });
  }
  // 화자가 있는 녹취록이면 첫 화자 앞의 머리말(문서 제목·날짜 등)은 버린다
  const first = entries.findIndex(e => e.name);
  return (first > 0 ? entries.slice(first) : entries).filter(e => e.text);
}

// 녹취록 화자 이름을 팀원과 짝짓기 (이름이 서로 포함되면 같은 사람으로 본다)
function guessMember(name) {
  const n = (name || '').replace(/\s/g, '').toLowerCase();
  if (!n) return '';
  const hit = state.members.find(m => {
    const mn = m.name.replace(/\s/g, '').toLowerCase();
    return mn === n || n.includes(mn) || mn.includes(n);
  });
  return hit?.id || '';
}

let meetDraft = null; // { entries, title, at }

function openMeetImport(text, title, at = Date.now()) {
  const entries = parseTranscript(text);
  if (!entries.length) return toast('녹취록에서 발언을 찾지 못했어요. 파일 내용을 확인해 주세요');
  meetDraft = { entries, title: (title || 'Google Meet 회의').replace(/\.(txt|vtt|sbv|srt)$/i, '').slice(0, 40), at };
  const speakers = [...new Set(entries.map(e => e.name || '(이름 없음)'))];
  const local = new Date(at - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  openModal(`
    <h2>📥 Google Meet 녹취록 가져오기</h2>
    <p class="muted sm">발언 ${entries.length}개, 화자 ${speakers.length}명을 찾았어요. 화자를 팀원과 짝지어 주세요. 짝지은 팀원의 방에 '내가 한 말' 요약이 생겨요.</p>
    <form id="meetImportForm" class="add-form">
      <label class="sm">회의 제목<input name="title" maxlength="40" value="${esc(meetDraft.title)}"></label>
      <label class="sm">회의 시각<input name="at" type="datetime-local" value="${local}"></label>
      <div class="meet-map">${speakers.map((s, i) => {
        const guess = guessMember(s);
        const sample = entries.find(e => (e.name || '(이름 없음)') === s)?.text || '';
        return `<label class="sm"><span><b>${esc(s)}</b> <span class="muted">${entries.filter(e => (e.name || '(이름 없음)') === s).length}번 · ${esc(trunc(maskPII(sample), 40))}</span></span>
          <select name="sp${i}" data-speaker="${esc(s)}">
            <option value="">팀원 아님 (발언은 남기되 누구 방에도 담지 않음)</option>
            ${state.members.map(m => `<option value="${m.id}" ${m.id === guess ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select></label>`;
      }).join('')}</div>
      <p class="notice sm">이메일·전화번호·주민등록번호 형태는 가린 뒤 저장해요. 녹취 원문은 이 방 팀원만 볼 수 있어요.</p>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">회의로 저장</button></div>
    </form>`);
}

async function importMeet(form) {
  if (!meetDraft || !cloudOn()) return;
  const data = new FormData(form);
  const map = {};
  form.querySelectorAll('select[data-speaker]').forEach(s => { map[s.dataset.speaker] = s.value; });
  const startAt = Date.parse(data.get('at')) || meetDraft.at;
  const lines = meetDraft.entries.map((e, i) => {
    const memberId = map[e.name || '(이름 없음)'] || null;
    return { uid: myUid(), memberId, name: member(memberId)?.name || e.name || '?', text: maskPII(e.text).slice(0, 2000), at: startAt + i * 1000 };
  });
  const attendees = [...new Set(lines.map(l => l.name))];
  const ref = callsRef().doc();
  const title = ((data.get('title') || meetDraft.title).trim() || 'Google Meet 회의').slice(0, 200);
  closeModal();
  toast('녹취록을 저장하는 중…');
  try {
    // 녹취 줄을 먼저(400개씩) 저장하고 회의 문서는 마지막에 — 회의가 보이는 순간 줄도 다 있어야
    // 팀원들의 '내가 한 말' 만들기가 빈 녹취를 보지 않는다
    for (let i = 0; i < lines.length; i += 400) {
      const batch = db.batch();
      lines.slice(i, i + 400).forEach(l => batch.set(ref.collection('lines').doc(), l));
      await batch.commit();
    }
    const { summary, summaryBy, decisions } = await meetingSummary(lines, attendees);
    await ref.set({
      id: ref.id, title, status: 'ended', source: 'meet', imported: true,
      startedBy: myUid(), startedByName: member(state.meId)?.name || authUser.name,
      startedAt: startAt, endedAt: startAt + lines.length * 1000,
      summary, summaryBy, decisions, attendees, lineCount: lines.length,
    });
    meetDraft = null;
    toast(`📥 「${title}」 녹취록을 회의로 저장했어요. 팀원 방에 '내가 한 말'이 곧 생겨요`);
    scheduleTalkSync();
  } catch (e) {
    writeFailed(e, '녹취록');
  }
}

// ---------- Google Drive에서 고르기 (Picker) ----------
// Firebase Google 로그인에 drive.file 권한을 더해 토큰을 받고(고른 파일만 읽을 수 있는 권한),
// Picker로 고른 Google Docs 녹취록을 글자로 내보내 읽는다.
const googleAuth = {}; // scope → { token, until }

// Google API 액세스 토큰 (Firebase Google 로그인에 범위를 더해 다시 승인받는다, 50분 동안 기억)
// interactive=false 면 승인 창을 띄우지 않고, 기억해 둔 토큰이 없으면 null (자동 가져오기에서 창이 불쑥 뜨지 않게)
async function googleToken(scope, { interactive = true } = {}) {
  const cached = googleAuth[scope];
  if (cached && Date.now() < cached.until) return cached.token;
  if (!interactive) return null;
  if (!AUTH_ENABLED || !authUser) throw new Error('google_login_required');
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope(scope);
  provider.setCustomParameters({ login_hint: authUser.email || '' });
  const res = await firebase.auth().currentUser.reauthenticateWithPopup(provider);
  const token = res.credential?.accessToken;
  if (!token) throw new Error('no google token');
  googleAuth[scope] = { token, until: Date.now() + 50 * 60 * 1000 };
  return token;
}

const driveToken = () => googleToken('https://www.googleapis.com/auth/drive.file');

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function pickMeetFromDrive() {
  let token;
  try {
    token = await driveToken();
    await loadScriptOnce('https://apis.google.com/js/api.js');
    await new Promise(r => gapi.load('picker', r));
  } catch (e) {
    console.error(e);
    return toast('Google Drive를 열지 못했어요. 녹취록을 .txt로 내려받아 "파일 올리기"를 써 주세요');
  }
  const view = new google.picker.DocsView(google.picker.ViewId.DOCUMENTS).setMode(google.picker.DocsViewMode.LIST);
  new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(token)
    .setDeveloperKey(FIREBASE_CONFIG.apiKey)
    .setAppId(FIREBASE_CONFIG.messagingSenderId)
    .setLocale('ko')
    .setTitle('Meet 녹취록 문서를 고르세요')
    .setCallback(async res => {
      if (res.action !== google.picker.Action.PICKED) return;
      const doc = res.docs[0];
      try {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`Drive ${r.status}`);
        openMeetImport(await r.text(), doc.name, doc.lastEditedUtc || Date.now());
      } catch (e) {
        console.error(e);
        toast('녹취록을 읽지 못했어요. Google Docs 문서인지 확인해 주세요');
      }
    })
    .build()
    .setVisible(true);
}

function meetImportCardHTML() {
  return `
    <div class="card call-form meet-import">
      <h3>📥 Google Meet 녹취록 가져오기 <span class="muted sm">Meet으로 회의했다면 녹취록을 회의 기록으로 옮겨요</span></h3>
      <div class="modal-actions" style="justify-content:flex-start">
        ${AUTH_ENABLED && authUser ? '<button type="button" class="btn" data-meet="drive">Google Drive에서 고르기</button>' : ''}
        <label class="btn file-btn">파일 올리기 (.txt · .vtt · .sbv)<input type="file" id="meetFile" accept=".txt,.vtt,.sbv,.srt,text/plain" hidden></label>
        <label class="btn file-btn">💬 카카오톡 대화 올리기<input type="file" id="kakaoFile" accept=".txt,.csv,text/plain,text/csv" hidden></label>
      </div>
      <p class="muted sm">Drive에서는 <b>고른 파일만</b> 읽어요. Meet 녹취록은 보통 회의를 연 사람의 Drive "Meet Recordings" 폴더에 있어요.</p>
    </div>`;
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-meet]');
  if (btn?.dataset.meet === 'drive') pickMeetFromDrive();
});

document.addEventListener('change', e => {
  if (e.target.id !== 'meetFile' || !e.target.files[0]) return;
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => openMeetImport(reader.result, file.name, file.lastModified || Date.now());
  reader.readAsText(file);
  e.target.value = '';
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'meetImportForm') return;
  e.preventDefault();
  importMeet(e.target);
});
