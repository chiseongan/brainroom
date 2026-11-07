// 카카오톡 대화 내보내기 가져오기
// - 팀플 단톡방을 '대화 내보내기'(PC) / '대화 내용 내보내기 → 텍스트만'(모바일)로 받은 .txt(.csv)를 읽는다.
//   카카오톡에는 공개 API가 없어 파일로만 가져올 수 있다. 파일은 이 브라우저에서만 읽고 올리지 않는다.
// - 형식은 기기마다 다르다 → 전부 너그럽게 읽는다:
//     PC(Windows/Mac)  "--------------- 2026년 11월 3일 월요일 ---------------" + "[이름] [오후 3:21] 말"
//     Android          "2026년 11월 3일 오후 3:21, 이름 : 말"
//     iOS              "2026. 11. 3. 오후 3:21, 이름 : 말"
//     CSV(Android)     "Date,User,Message" / "2026-11-03 15:21:00,이름,말"
//     영어 설정         "[Name] [3:21 PM] 말", "November 3, 2026 at 3:21 PM, Name : 말"
// - 화자를 팀원과 짝지어 Meet 녹취처럼 '끝난 회의(출처 kakao)'로 저장한다 → 요약·정한 것이 생기고,
//   각 팀원 방에 '내가 한 말'(js/meeting.js syncMyTalks)이 생긴다. 오프라인 방에서는 바로 팀원마다 기록을 만든다.

const KAKAO_DATE_LINE = /^-*\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*\S+요일)?\s*-*$|^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*\S+요일)?$/;
const KAKAO_DATE_LINE_EN = /^-*\s*(?:[A-Z][a-z]+day,\s*)?([A-Z][a-z]+) (\d{1,2}), (\d{4})\s*-*$/;
const KAKAO_PC_MSG = /^\[([^\]]{1,40})\]\s*\[(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\]\s?(.*)$/;
const KAKAO_MOBILE_MSG = /^(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?,\s*(.+?)\s*:\s(.*)$/;
const KAKAO_EN_MSG = /^([A-Z][a-z]+ \d{1,2}, \d{4}) at (\d{1,2}):(\d{2}) (AM|PM),\s*(.+?)\s*:\s(.*)$/;
const KAKAO_CSV_ROW = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?,(.*)$/;
const KAKAO_SYSTEM = /(님이 (들어왔습니다|나갔습니다|초대했습니다|내보냈습니다)|채팅방 관리자가|님을 초대했습니다|메시지가 삭제되었습니다|대화 내용을 저장|톡게시판|오픈채팅방)/;
const KAKAO_NOISE_EXACT = /^(사진|동영상|이모티콘|\(이모티콘\)|음성메시지|삭제된 메시지입니다\.?|보이스톡 (해요|취소|부재중|통화시간 .*)|페이스톡 (해요|취소|부재중|통화시간 .*)|파일: ?.{0,80}|송금 .*|선물 .*|샵검색: .*|지도: .*|연락처: .*)$/;

function isKakaoNoise(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (KAKAO_NOISE_EXACT.test(t)) return true;
  // ㅋㅋ ㅎㅎ ㅇㅇ ㄴㄴ ㅠㅠ 같은 자음·모음 반응, 짧은 추임새
  if (/^[ㄱ-ㅎㅏ-ㅣ!?~.,\s]+$/.test(t)) return true;
  if (t.length <= 3 && /^(넵|넹|네|네네|응|엉|옹|오키|오케|오케이|ok|okay|굿|good|ㄱㄱ|고고|감사|땡큐|ㅇㅋ|ㅇㅋㅇㅋ|헐|대박|ㄹㅇ|인정|ㄴㄴ|아니|앗|아|어|음|흠|넵넵|옙)[.!~]*$/i.test(t)) return true;
  return false;
}

// 오전/오후·AM/PM → 24시
function kakaoHour(h, ampm) {
  const n = Number(h) % 12;
  return /오후|PM/i.test(ampm || '') ? n + 12 : n;
}

// 따옴표가 있는 CSV 한 줄 → 칸 배열 ("" 는 " 하나)
function csvCells(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseKakaoChat(text) {
  const rows = String(text || '').replace(/^﻿/, '').replace(/\r/g, '').split('\n');
  const messages = [];
  let title = '';
  let day = null; // [y, m, d] — PC 형식의 날짜 구분선
  let cur = null;
  const push = (at, name, body) => {
    cur = { at, name: name.trim(), text: body };
    messages.push(cur);
  };
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const t = raw.trim();
    if (i < 3 && !title) {
      const m = t.match(/^(.+?)\s*님과 카카오톡 대화$/) || t.match(/^(.+?) with KakaoTalk Chats$/);
      if (m) { title = m[1].trim(); continue; }
    }
    if (/^저장한 날짜\s*:|^Date Saved\s*:/.test(t)) continue;
    if (i === 0 && /^Date,User,Message$/i.test(t)) continue;
    const dl = t.match(KAKAO_DATE_LINE);
    if (dl) { day = dl[1] ? [dl[1], dl[2], dl[3]] : [dl[4], dl[5], dl[6]]; cur = null; continue; }
    const dle = t.match(KAKAO_DATE_LINE_EN);
    if (dle) { const d = new Date(`${dle[1]} ${dle[2]}, ${dle[3]}`); day = [d.getFullYear(), d.getMonth() + 1, d.getDate()]; cur = null; continue; }
    let m;
    if ((m = t.match(KAKAO_PC_MSG))) {
      if (!day) { const d = new Date(); day = [d.getFullYear(), d.getMonth() + 1, d.getDate()]; } // 날짜 구분선이 없는 파일: 오늘로
      const at = new Date(+day[0], +day[1] - 1, +day[2], kakaoHour(m[3], m[2] || m[5]), +m[4]).getTime();
      if (!KAKAO_SYSTEM.test(m[6])) push(at, m[1], m[6]); else cur = null;
      continue;
    }
    if ((m = t.match(KAKAO_MOBILE_MSG))) {
      const at = new Date(+m[1], +m[2] - 1, +m[3], kakaoHour(m[5], m[4] || m[7]), +m[6]).getTime();
      if (!KAKAO_SYSTEM.test(t)) push(at, m[8], m[9]); else cur = null;
      continue;
    }
    if ((m = t.match(KAKAO_EN_MSG))) {
      const base = new Date(m[1]);
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), kakaoHour(m[2], m[4]), +m[3]).getTime();
      push(at, m[5], m[6]);
      continue;
    }
    if ((m = raw.match(KAKAO_CSV_ROW))) {
      const [name, ...rest] = csvCells(m[7]);
      const at = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
      if (name) push(at, name, rest.join(','));
      continue;
    }
    // 시스템 알림(들어왔습니다 등)은 날짜가 있어도 위에서 cur=null 로 끊는다. 그 밖의 줄은 앞 메시지에 이어진 줄
    if (KAKAO_SYSTEM.test(t)) { cur = null; continue; }
    if (cur && t) cur.text = `${cur.text}\n${t}`;
  }
  return { title, messages: messages.map(m => ({ ...m, text: m.text.trim() })) };
}

// 메시지 → 회의 녹취 줄. 같은 사람이 3분 안에 이어 보낸 말은 한 줄로 합치고, 기간 밖·잡담은 뺀다
function kakaoLines(messages, { since = 0, until = Infinity, map = {}, dropNoise = true } = {}) {
  const lines = [];
  let last = null;
  for (const m of [...messages].sort((a, b) => a.at - b.at)) {
    if (m.at < since || m.at > until) continue;
    if (dropNoise && isKakaoNoise(m.text)) continue;
    if (last && last.name === m.name && m.at - last.lastAt <= 3 * 60e3 && last.text.length < 1500) {
      last.text = `${last.text}\n${m.text}`;
      last.lastAt = m.at;
      continue;
    }
    last = { name: m.name, memberId: map[m.name] || null, text: m.text, at: m.at, lastAt: m.at };
    lines.push(last);
  }
  return lines.map(({ lastAt, ...l }) => ({ ...l, text: l.text.slice(0, 2000) }));
}

// 대화 id: 제목 + 첫·마지막 메시지 시각 → 같은 파일을 다시 가져오면 같은 id
function kakaoCallId(title, lines) {
  const key = `${title}|${lines[0]?.at || 0}|${lines[lines.length - 1]?.at || 0}|${lines.length}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `kakao_${Math.abs(h).toString(36)}`;
}

// 오프라인(데모·샘플) 방: 팀원마다 '내가 한 말' 기록을 바로 만든다. 만든 개수를 돌려준다
function kakaoLocalImport({ title, lines, at = Date.now() }) {
  const callId = kakaoCallId(title, lines);
  const first = lines[0]?.at || at, lastAt = lines[lines.length - 1]?.at || at;
  const c = { id: callId, title: `카카오톡 · ${title}`, startedAt: first, endedAt: lastAt };
  let n = 0;
  for (const m of state.members) {
    const mine = lines.filter(l => l.memberId === m.id);
    const id = `talk_${callId}_${m.id}`;
    if (!mine.length || state.items.some(i => i.id === id)) continue;
    const keywords = kakaoKeywords(mine, 10);
    const transcript = mine.map(l => l.text).join('\n');
    const item = analyze({
      id, memberId: m.id, type: 'talk', title: `「${c.title}」에서 내가 한 말`, content: kakaoSummary(mine, c, keywords),
      url: '', createdAt: lastAt, visibility: 'team', table: null, votes: [],
      talk: { callId, lineCount: mine.length, keywords, transcript: transcript.length > 6000 ? `${transcript.slice(0, 6000)}\n…(이하 생략)` : transcript },
    });
    item.keywords = keywords.slice(0, 6);
    state.items.push(item);
    n++;
  }
  if (n) saveState();
  return n;
}

// 채팅 말투("~해요", "~ㅋㅋ")의 말끝은 키워드에서 뺀다
function kakaoKeywords(lines, n) {
  return extractKeywords(lines.map(l => l.text).join('\n'), 30)
    .filter(k => !/(요|다|니다|까지|게|죠|네|고|서|함|하기|하자|해서|ㅋ+|ㅎ+)$/.test(k) && !/^https?/.test(k) && !['이메일', '전화번호', '주민등록번호'].includes(k))
    .slice(0, n);
}

function kakaoSummary(lines, c, keywords) {
  const said = lines.map(l => ({ ...l, s: l.text.replace(/\s+/g, ' ').trim() })).filter(l => l.s.length >= 6);
  const score = l => keywords.filter(k => l.s.includes(k)).length + (DECISION_PATTERN.test(l.s) ? 3 : 0) + Math.min(l.s.length, 80) / 80;
  const key = [...said].sort((a, b) => score(b) - score(a)).slice(0, 3).sort((a, b) => a.at - b.at);
  const decided = said.filter(l => DECISION_PATTERN.test(l.s)).slice(0, 3);
  const links = [...new Set(lines.flatMap(l => l.text.match(/https?:\/\/\S+/g) || []))];
  return [
    `「${c.title}」 (${fmtDate(c.startedAt, false)} ~ ${fmtDate(c.endedAt, false)}) · 내 메시지 ${lines.length}묶음`,
    `키워드: ${keywords.map(k => `#${k}`).join(' ') || '-'}`,
    '',
    '내 주요 메시지',
    ...(key.length ? key : said.slice(0, 3)).map(l => `- ${l.s.slice(0, 160)}`),
    ...(decided.length ? ['', '내가 정한 것으로 보이는 말', ...decided.map(l => `- ${l.s.slice(0, 160)}`)] : []),
    ...(links.length ? ['', `공유한 링크 ${links.length}개`, ...links.slice(0, 3).map(u => `- ${u}`)] : []),
  ].join('\n');
}

// ---------- 화면 ----------

let kakaoDraft = null; // { messages, title, at }

function openKakaoImport(text, fileName) {
  const parsed = parseKakaoChat(text);
  if (!parsed.messages.length) return toast('카카오톡 대화 내보내기 파일이 아닌 것 같아요. 대화방 → 대화 내보내기(텍스트)로 받은 .txt를 올려 주세요');
  const title = (parsed.title || String(fileName || '단톡방').replace(/\.(txt|csv)$/i, '').replace(/^KakaoTalk(Chats|_Chat)?[_ ]?/i, '')).slice(0, 40) || '단톡방';
  kakaoDraft = { messages: parsed.messages, title, at: Date.now() };
  const speakers = [...new Set(parsed.messages.map(m => m.name))];
  const last = Math.max(...parsed.messages.map(m => m.at));
  const since = new Date(Math.max(Math.min(...parsed.messages.map(m => m.at)), last - 30 * 864e5));
  const local = d => new Date(d - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  openModal(`
    <h2>💬 카카오톡 대화 가져오기</h2>
    <p class="muted sm">메시지 ${parsed.messages.length}개, 참여자 ${speakers.length}명을 찾았어요. 참여자를 팀원과 짝지어 주세요. 짝지은 팀원의 방에 '내가 한 말' 요약이 생기고, 대화 전체 요약과 정한 것 후보가 기록돼요.</p>
    <form id="kakaoImportForm" class="add-form">
      <label class="sm">대화방 이름<input name="title" maxlength="40" value="${esc(title)}"></label>
      <div class="inline-form" style="margin:0"><label class="sm" style="flex:1">이 날부터<input name="since" type="date" value="${local(since)}"></label><label class="sm" style="flex:1">이 날까지<input name="until" type="date" value="${local(last)}"></label></div>
      <div class="meet-map">${speakers.map((sp, i) => {
        const guess = guessMember(sp);
        const mine = parsed.messages.filter(m => m.name === sp);
        const sample = mine.find(m => !isKakaoNoise(m.text))?.text || mine[0]?.text || '';
        return `<label class="sm"><span><b>${esc(sp)}</b> <span class="muted">${mine.length}개 · ${esc(trunc(maskPII(sample.replace(/\s+/g, ' ')), 40))}</span></span>
          <select name="sp${i}" data-speaker="${esc(sp)}">
            <option value="">팀원 아님 (대화는 남기되 누구 방에도 담지 않음)</option>
            ${state.members.map(m => `<option value="${m.id}" ${m.id === guess ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select></label>`;
      }).join('')}</div>
      <label class="check sm"><input type="checkbox" name="noise" checked> ㅋㅋ·ㅇㅇ 같은 짧은 반응, 사진·이모티콘은 빼기</label>
      <p class="notice sm">이메일·전화번호·주민등록번호 형태는 가린 뒤 저장해요. 대화 원문은 이 방 팀원만 볼 수 있어요. 파일은 올리지 않고 이 브라우저에서만 읽어요.</p>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>취소</button><button class="btn primary">가져오기</button></div>
    </form>`);
}

function kakaoDraftLines(form) {
  const data = new FormData(form);
  const map = {};
  form.querySelectorAll('select[data-speaker]').forEach(s => { map[s.dataset.speaker] = s.value; });
  const since = Date.parse(data.get('since')) || 0;
  const until = data.get('until') ? Date.parse(data.get('until')) + 864e5 - 1 : Infinity;
  const title = (data.get('title') || kakaoDraft.title).trim().slice(0, 40) || '단톡방';
  const lines = kakaoLines(kakaoDraft.messages, { since, until, map, dropNoise: data.get('noise') === 'on' })
    .map(l => ({ ...l, text: maskPII(l.text) }));
  return { title, lines };
}

async function importKakao(form) {
  if (!kakaoDraft) return;
  const { title, lines } = kakaoDraftLines(form);
  if (!lines.length) return toast('그 기간에 남길 메시지가 없어요. 기간이나 잡담 빼기 설정을 바꿔 보세요');
  closeModal();
  if (!cloudOn()) {
    const n = kakaoLocalImport({ title, lines });
    kakaoDraft = null;
    toast(n ? `💬 「${title}」 대화에서 팀원 ${n}명의 '내가 한 말'을 방에 담았어요` : '이미 가져온 대화예요');
    render();
    return;
  }
  // 온라인 방: Meet 녹취처럼 '끝난 회의'로 저장 → 요약·정한 것 + 팀원마다 '내가 한 말' (syncMyTalks)
  const callId = kakaoCallId(title, lines);
  if ((state.calls || []).some(c => c.id === callId)) { kakaoDraft = null; return toast('이미 가져온 대화예요'); }
  const ref = callsRef().doc(callId);
  const rows = lines.map(l => ({ uid: myUid(), memberId: l.memberId, name: member(l.memberId)?.name || l.name || '?', text: l.text, at: l.at }));
  const attendees = [...new Set(rows.map(l => l.name))];
  toast('대화를 저장하는 중…');
  try {
    for (let i = 0; i < rows.length; i += 400) {
      const batch = db.batch();
      rows.slice(i, i + 400).forEach(l => batch.set(ref.collection('lines').doc(), l));
      await batch.commit();
    }
    const { summary, summaryBy, decisions } = await meetingSummary(rows, attendees);
    await ref.set({
      id: callId, title: `카카오톡 · ${title}`, status: 'ended', source: 'kakao', imported: true,
      startedBy: myUid(), startedByName: member(state.meId)?.name || authUser.name,
      startedAt: rows[0].at, endedAt: rows[rows.length - 1].at,
      summary, summaryBy, decisions, attendees, lineCount: rows.length,
    });
    kakaoDraft = null;
    toast(`💬 「${title}」 대화를 가져왔어요. 팀원 방에 '내가 한 말'이 곧 생겨요`);
    scheduleTalkSync();
  } catch (e) {
    writeFailed(e, '카카오톡 대화');
  }
}

// 샘플 체험용 단톡방 (사람·내용은 지어낸 것)
const SAMPLE_KAKAO = `캡스톤 3조 님과 카카오톡 대화
저장한 날짜 : 2026-11-06 18:00:00

--------------- 2026년 11월 2일 일요일 ---------------
[지민] [오후 8:12] 다회용기 반납 QR 화면 초안 올렸어요 https://www.figma.com/design/SAMPLEfigmaFile00001
[서준] [오후 8:15] 오 좋네요 반납함 위치는 지도 API 붙이면 될 듯
[하은] [오후 8:20] 브랜드 색은 초록 계열로 가기로 했으니까 버튼도 맞출게요
[도윤] [오후 8:21] ㅇㅇ
--------------- 2026년 11월 4일 화요일 ---------------
[서준] [오후 2:03] 자취생 인터뷰 설문 결과 정리했어요 노션에 올림
[지민] [오후 2:10] 발표는 다음 주 금요일로 확정하기로 했어요
[도윤] [오후 2:12] 포인트 보상 로직은 제가 맡을게요
[하은] [오후 2:15] 사진
[하은] [오후 2:16] 포스터 시안인데 어때요`;

function kakaoCardHTML() {
  return `
    <article class="card integ">
      <header><h2>💬 카카오톡 단톡방</h2>${(state.calls || []).some(c => c.source === 'kakao') || state.items.some(i => i.talk?.callId?.startsWith('kakao_')) ? '<span class="vis-badge vis-prof">✅ 가져옴</span>' : '<span class="vis-badge vis-me">파일로 가져오기</span>'}</header>
      <p class="muted sm">팀플 단톡방의 대화를 가져와요. 참여자를 팀원과 짝지으면 각자 방에 '내가 한 말'이 생기고, 대화 요약과 "~하기로 했다" 같은 정한 것 후보가 기록돼요. 카카오톡은 API가 없어 <b>내보낸 파일</b>로만 가져올 수 있어요.</p>
      <div class="modal-actions" style="justify-content:flex-start">
        <label class="btn file-btn">대화 파일 올리기 (.txt · .csv)<input type="file" id="kakaoFile" accept=".txt,.csv,text/plain,text/csv" hidden></label>
        ${guestMode ? '<button type="button" class="btn" data-kakao="sample">샘플 단톡방으로 체험</button>' : ''}
      </div>
      <details class="sm"><summary>대화 내보내는 법</summary>
        <p><b>PC</b>: 대화방 → 메뉴(≡) → <b>대화 내보내기</b> → 텍스트 파일 저장.<br><b>휴대폰</b>: 대화방 → 메뉴(≡) → 설정(⚙) → <b>대화 내용 내보내기 → 텍스트만</b> → 파일을 나에게 보내거나 저장.<br>파일은 이 브라우저에서만 읽고 어디에도 올리지 않아요. 가져온 뒤 지워도 돼요.</p></details>
    </article>`;
}

document.addEventListener('change', e => {
  if (e.target.id !== 'kakaoFile' || !e.target.files[0]) return;
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => openKakaoImport(reader.result, file.name);
  reader.readAsText(file);
  e.target.value = '';
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-kakao]');
  if (btn?.dataset.kakao === 'sample') openKakaoImport(SAMPLE_KAKAO, '캡스톤 3조.txt');
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'kakaoImportForm') return;
  e.preventDefault();
  importKakao(e.target);
});
