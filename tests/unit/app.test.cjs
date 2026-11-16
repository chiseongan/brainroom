// 앱 로직 단위 시험 (네트워크·브라우저 없음): 녹취록 해석, 키워드 → 물품, 연동 작업, 결정 추출 품질
//   node tests/unit/app.test.cjs
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

function makeApp(fakeFetch, names = ['안치성', '김단유', '박채연']) {
  const store = {};
  const ctx = {
    crypto: globalThis.crypto, console, Date, Math, JSON, Object, Array, Set, Map, String, Number, RegExp, Promise, Error, URL, URLSearchParams, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    fetch: fakeFetch || (async () => { throw new Error('이 시험은 네트워크를 쓰지 않는다'); }),
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { querySelector: () => null, addEventListener() {} }, window: {}, navigator: {},
  };
  vm.createContext(ctx);
  vm.runInContext(['themes', 'nlp', 'sanitize', 'store', 'trace', 'iso', 'decor', 'integrations', 'meetimport', 'kakao', 'sampleapi', 'workspace'].map(f => fs.readFileSync(path.join(root, 'js', `${f}.js`), 'utf8')).join('\n;\n')
    + `\n;var guestMode = false, authUser = null, cloud = { loaded: true };
    function render() {} function toast() {} function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } function fmtDate() { return ''; } function trunc(s) { return s; } function timeAgo() { return ''; }
    function safeUrl(u) { const c = cleanUrl(u); return !c ? '' : /^https?:\\/\\//i.test(c) ? c : 'https://' + c; }
    async function aiFeature() { return false; }
    function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
    state = newWorkspace('t', ${JSON.stringify(names)}); state.meId = state.members[0].id;
    globalThis.T = { get state() { return state; }, parseTranscript, guessMember, figmaTextFromDocument, coreKeywords, upsertWork, deleteItem, roomDecorGroups,
      syncGithub, syncFigma, syncNotion, decorFor, workKeywords, itemDecorIds, detectThemes, extractKeywords, addItem, decisionCandidates, DECISION_PATTERN, maskPII, weeklySummary, weekStart, sanitizeForProf, decorMatch, DECOR, DECOR_BY_ID, DESK_Z, feedFilter, feedCardHTML, parseKakaoChat, kakaoLines, kakaoLocalImport, isKakaoNoise, parseGdocId, syncGdocs, cleanMember, cleanLinks };`, ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'room.js'), 'utf8').replace(/function hashCode[\s\S]*?\n}\n/, '') + `\n;globalThis.T.R = { decorPlacement, roomHTML, FLOOR_SLOTS, DESK_SLOTS };`, ctx);
  ctx.T.ctx = ctx;
  return ctx.T;
}
const show = groups => groups.map(g => `${g.decor.name}(${g.count})`).join(' / ');

(async () => {
  const T = makeApp();

  console.log('--- 녹취록 해석');
  const a = T.parseTranscript('회의 녹취록\n참석자: 안치성, 김단유\n\n안치성: 다회용기 순환 서비스를 주제로 하기로 했어요\n김단유: 좋아요. 설문은 제가 만들게요\n이어서 다음 주까지 공유할게요\n박채연: 예산은 얼마나 잡을까요?');
  ok(a.length === 3 && a[1].name === '김단유' && a[1].text.includes('다음 주까지'), '"이름: 말" + 이어지는 줄');
  const b = T.parseTranscript('Transcript\n안치성\n00:00:05\n발표 자료는 제가 정리할게요\n김단유\n00:01:10\n그럼 디자인은 피그마로 할게요');
  ok(b.length === 2 && b[0].name === '안치성' && b[1].text.includes('피그마'), '"이름 / 00:00:05 / 말"');
  const c = T.parseTranscript('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v 박채연>로그인 화면부터 만들어요</v>\n\n2\n00:00:05.000 --> 00:00:07.000\n<v 안치성>네 좋아요');
  ok(c.length === 2 && c[0].name === '박채연' && c[0].text === '로그인 화면부터 만들어요', 'WebVTT <v 화자>');
  ok(T.guessMember('안치성') === T.state.members[0].id && T.guessMember('김단유 (Dan)') === T.state.members[1].id && T.guessMember('외부 손님') === '', '화자 ↔ 팀원 짝짓기');

  console.log('--- 카카오톡 대화 내보내기 해석');
  {
    const pc = T.parseKakaoChat('안치성, 김단유 님과 카카오톡 대화\n저장한 날짜 : 2026-11-06 18:00:00\n\n--------------- 2026년 11월 3일 월요일 ---------------\n[안치성] [오후 3:21] 다회용기 순환 서비스로 가는 거 어때요\n[김단유] [오후 3:22] 좋아요\n설문은 제가 만들게요\n[김단유] [오후 3:22] 이모티콘\n[안치성] [오전 12:05] 자정 넘어서 보냄\n--------------- 2026년 11월 4일 화요일 ---------------\n[박채연] [오전 9:10] 예산은 제가 정리하기로 했어요');
    ok(pc.title === '안치성, 김단유' && pc.messages.length === 5, `PC(Windows) 형식: 제목·메시지 ${pc.messages.length}개`);
    ok(pc.messages[1].name === '김단유' && pc.messages[1].text === '좋아요\n설문은 제가 만들게요', '여러 줄 메시지는 앞 메시지에 이어 붙임');
    const d0 = new Date(pc.messages[0].at), d3 = new Date(pc.messages[3].at), d4 = new Date(pc.messages[4].at);
    ok(d0.getFullYear() === 2026 && d0.getMonth() === 10 && d0.getDate() === 3 && d0.getHours() === 15 && d0.getMinutes() === 21, `날짜 구분선 + 오후 시각 → 현지 시각 (${d0.toString().slice(0, 24)})`);
    ok(d3.getHours() === 0 && d3.getMinutes() === 5 && d4.getDate() === 4 && d4.getHours() === 9, '오전 12시 = 0시, 다음 날짜 구분선 반영');
    const an = T.parseKakaoChat('캡스톤 3조 님과 카카오톡 대화\n저장한 날짜 : 2026년 11월 6일 오후 6:00\n\n2026년 11월 3일 오후 3:21, 안치성 : 다회용기 순환 서비스로 가는 거 어때요\n2026년 11월 3일 오후 3:22, 김단유 : 좋아요\n설문은 제가 만들게요\n2026년 11월 3일 오후 3:23, 김단유님이 들어왔습니다.\n2026년 11월 3일 오후 3:24, 박채연 : 사진');
    ok(an.title === '캡스톤 3조' && an.messages.length === 3 && an.messages[1].text.includes('설문은') && !an.messages.some(m => /들어왔습니다/.test(m.text)), `Android 형식: 입장 알림 제외 (${an.messages.length}개)`);
    const ios = T.parseKakaoChat('2026. 11. 3. 오후 3:21, 안치성 : 반납함 지도 초안 올렸어요\n2026. 11. 3. 오후 3:22, 김단유 : 확인할게요');
    ok(ios.messages.length === 2 && new Date(ios.messages[0].at).getHours() === 15, 'iOS 형식 (2026. 11. 3.)');
    const csv = T.parseKakaoChat('Date,User,Message\n2026-11-03 15:21:00,"안치성","다회용기 순환 서비스로 가는 거 어때요"\n2026-11-03 15:22:00,"김단유","좋아요, ""설문""은 제가"');
    ok(csv.messages.length === 2 && csv.messages[1].text === '좋아요, "설문"은 제가' && new Date(csv.messages[0].at).getHours() === 15, 'CSV 형식 (따옴표·쉼표 포함)');
    const en = T.parseKakaoChat('[Chiseong] [3:21 PM] english export\n[Danyu] [12:10 AM] midnight');
    ok(en.messages.length === 2 && new Date(en.messages[0].at).getHours() === 15 && new Date(en.messages[1].at).getHours() === 0, '영어 설정(AM/PM) 형식');
    ok(T.parseKakaoChat('그냥 아무 글').messages.length === 0, '카카오톡 형식이 아니면 비어 있음');
    ok(T.isKakaoNoise('ㅋㅋㅋ') && T.isKakaoNoise('ㅇㅇ') && T.isKakaoNoise('사진') && T.isKakaoNoise('이모티콘') && T.isKakaoNoise('삭제된 메시지입니다.') && !T.isKakaoNoise('설문은 제가 만들게요'), '짧은 반응·사진·이모티콘·삭제 메시지는 잡담으로');
    const day = 864e5, base = Date.now() - 2 * day;
    const msgs = [
      { at: base, name: '안치성', text: '다회용기 순환 서비스로 가는 거 어때요' }, { at: base + 60e3, name: '안치성', text: '반납함 지도도 필요하고요' },
      { at: base + 90e3, name: '김단유', text: 'ㅇㅇ' }, { at: base + 120e3, name: '김단유', text: '설문은 제가 만들게요 https://forms.gle/abc' },
      { at: base + 20 * 60e3, name: '안치성', text: '20분 뒤 다른 얘기' }, { at: base - 40 * day, name: '안치성', text: '오래된 메시지' },
      { at: base + 130e3, name: '외부 손님', text: '팀원 아님' },
    ];
    const map = { 안치성: T.state.members[0].id, 김단유: T.state.members[1].id, '외부 손님': '' };
    const lines = T.kakaoLines(msgs, { since: Date.now() - 30 * day, map });
    ok(lines.length === 4 && lines[0].text === '다회용기 순환 서비스로 가는 거 어때요\n반납함 지도도 필요하고요' && lines[0].memberId === T.state.members[0].id, `같은 사람이 3분 안에 이어 보낸 말은 한 줄로, 기간 밖·잡담 제외 (${lines.length}줄)`);
    const guest = lines.find(l => l.name === '외부 손님'), later = lines.find(l => l.text === '20분 뒤 다른 얘기');
    ok(lines[1].name === '김단유' && lines[1].text.includes('forms.gle') && later && guest && guest.memberId === null && lines.indexOf(guest) < lines.indexOf(later), '링크는 남기고, 짝 없는 화자는 memberId 없이 시간순으로 남김');
    const K = makeApp(null, ['안치성', '김단유']);
    const made = K.kakaoLocalImport({ title: '캡스톤 3조', lines: T.kakaoLines(msgs, { since: 0, map: { 안치성: K.state.members[0].id, 김단유: K.state.members[1].id } }) });
    const talks = K.state.items.filter(i => i.type === 'talk');
    ok(made === 2 && talks.length === 2 && talks.every(t => t.talk?.callId?.startsWith('kakao_') && t.title.includes('캡스톤 3조')), `오프라인 방: 팀원마다 '내가 한 말' 기록 (${talks.length}개)`);
    const mine = talks.find(t => t.memberId === K.state.members[0].id);
    ok(mine.keywords.includes('다회용기') && mine.content.includes('다회용기 순환') && mine.talk.lineCount === 3, `키워드·주요 발언 (${mine.keywords})`);
    ok(K.kakaoLocalImport({ title: '캡스톤 3조', lines: T.kakaoLines(msgs, { since: 0, map: { 안치성: K.state.members[0].id } }) }) === 0 || K.state.items.filter(i => i.type === 'talk').length === 2, '같은 대화를 다시 가져와도 중복되지 않음');
  }

  console.log('--- 개인정보 가리기');
  const masked = T.maskPII('메일 me@test.com 전화 010-1234-5678 주민 990101-1234567 끝');
  ok(!/me@test\.com|010-1234|990101-1234567/.test(masked), `가림 (${masked})`);

  console.log('--- Figma 글자');
  const doc = { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: '모바일 앱', children: [
    { type: 'FRAME', name: '로그인 화면', children: [{ type: 'TEXT', name: 't', characters: '다회용기 반납하고 포인트 받기' }, { type: 'RECTANGLE', name: 'Rectangle 12' }] },
    { type: 'FRAME', name: 'Frame 3', children: [{ type: 'TEXT', characters: '결제 수단 선택' }] },
    { type: 'COMPONENT', name: 'Button / Primary' },
    { type: 'GROUP', name: 'Group 7' },
  ] }] };
  const text = T.figmaTextFromDocument(doc);
  ok(text.includes('로그인 화면') && text.includes('다회용기 반납하고') && text.includes('결제 수단') && !/Frame 3|Rectangle|Group 7/.test(text), '화면 이름·글자는 뽑고 자동 이름은 뺌');
  const kws = T.coreKeywords(`모바일 앱 디자인 design\n${text}`, 8);
  ok(kws.includes('로그인') && kws.includes('다회용기'), '디자인 글자 → 핵심 키워드');

  console.log('--- 지운 작업');
  const item = { id: 'gh_test1', type: 'work', title: '로그인 버그 수정', content: '', url: '', createdAt: Date.now(), work: { source: 'github' } };
  ok(T.upsertWork({ ...item }) === true, '작업 추가');
  T.deleteItem('gh_test1');
  ok(T.upsertWork({ ...item }) === false && !T.state.items.some(i => i.id === 'gh_test1'), '지운 작업은 다시 가져오지 않음');

  console.log('--- 키워드 → 물품');
  ok(T.decorFor('build')?.id !== 'art', '"build" 안의 ui로 오인하지 않음');
  ok(T.decorFor('ui')?.id === 'art' && T.decorFor('fix')?.id === 'toolbox' && T.decorFor('login')?.id === 'safe', 'ui→이젤, fix→공구함, login→금고');
  ok(T.decorFor('다회용기')?.id === 'recycle' && T.decorFor('서비스')?.id !== 'calendar', '한국어 부분 일치');
  ok(T.coreKeywords('fix(auth): 로그인 오류 수정\n\nCo-Authored-By: Claude').includes('로그인') && !T.coreKeywords('feat: 추가 수정').includes('수정'), '커밋 머리말·꼬리말 제거');

  // 가장 구체적인 단어로 고른다
  const id = w => T.decorFor(w)?.id;
  ok(id('3주차') === 'calendar' && id('주차장') === 'bike', `'3주차'는 일정, '주차장'은 이동 (${id('3주차')}, ${id('주차장')})`);
  ok(id('데이터베이스') === 'laptop' && id('데이터') === 'chart', '데이터베이스는 노트북, 데이터는 차트');
  ok(id('재활용품') === 'recycle' && id('음식물') === 'recycle' && id('음식') === 'bento', '음식물 쓰레기는 분리수거함, 음식은 도시락');
  ok(id('개인정보') === 'safe' && !T.decorFor('정보'), "'정보'만으로 금고가 되지 않음");
  ok(id('자연어') === 'robot' && id('자연') === 'plant', '자연어는 로봇, 자연은 화분');
  ok(id('시각화') === 'chart' && id('시각') === 'clock', '시각화는 차트, 시각은 시계');
  ok(id('택배') === 'parcel' && id('병원') === 'firstaid' && id('화재') === 'extinguisher' && id('태양광') === 'solar', '새 물건: 택배 상자, 구급상자, 소화기, 태양광 패널');
  ok(T.decorMatch('수정').weak && T.decorMatch('팀원').weak && !T.decorMatch('다회용기').weak, '흔한 말은 약한 키워드');
  const objectsOf = kws => [...T.itemDecorIds({ type: 'memo', keywords: kws, themes: [] }).keys()];
  ok(objectsOf(['정리', '다회용기', '수정']).join() === 'recycle', `구체적인 키워드가 있으면 흔한 말은 물건이 안 됨 (${objectsOf(['정리', '다회용기', '수정'])})`);
  ok(objectsOf(['정리', '수정']).includes('papers'), '흔한 말뿐이면 그걸로 물건을 고름');

  // 모든 물건이 어떤 자리에서도 멀쩡히 그려진다
  const bad = T.DECOR.filter(d => /NaN|undefined/.test(d.place === 'wall' ? d.draw(0.5) : d.place === 'desk' ? d.draw(3.5, 3.2, T.DESK_Z) : d.draw(2.4, 1.5)));
  ok(!bad.length, `물건 ${T.DECOR.length}종 그림에 잘못된 좌표 없음${bad.length ? ` → ${bad.map(d => d.id)}` : ''}`);
  const dup = T.DECOR.flatMap(d => [...(d.words || []), ...(d.weak || [])].map(k => [k, d.id])).filter(([k], i, a) => a.findIndex(([x]) => x === k) !== i);
  ok(!dup.length, `같은 단어가 두 물건에 없음${dup.length ? ` → ${dup.slice(0, 5)}` : ''}`);
  ok(T.DECOR.filter(d => d.place === 'floor').every(d => ['low', 'mid', 'tall'].includes(d.height)), '바닥 물건마다 키 정보가 있음');

  // 캐릭터: 같은 팀원은 늘 같은 모습, 좌표 오류 없음, 말풍선은 넘긴 글자 그대로
  const av = (m, o) => vm.runInContext(`avatar(3, 4, ${JSON.stringify(m)}, ${JSON.stringify(o || {})})`, T.ctx);
  ok(av({ id: 'm1', name: '가', color: '#6366f1' }) === av({ id: 'm1', name: '가', color: '#6366f1' }), '같은 팀원은 늘 같은 모습');
  ok(['m1', 'm2', 'm3', 'm4', 'abc', 'xyz'].every(i => !/NaN|undefined/.test(av({ id: i, name: i, color: '#f97316' }, { bubble: '💡' }))), '캐릭터 그림에 잘못된 값 없음');
  ok(new Set(['m1', 'm2', 'm3', 'm4', 'a', 'b', 'c', 'd'].map(i => av({ id: i, name: '가', color: '#000000' }))).size > 1, '팀원마다 모습이 다름');
  ok(av({ id: 'm1', name: '<b>', color: '#000000' }).includes('&lt;b&gt;') || !av({ id: 'm1', name: '<b>', color: '#000000' }).includes('<b>'), '이름은 HTML로 해석되지 않음');

  // 방 배치: 키 큰 물건이 자리를 잃지 않고, 한 자리에 둘이 놓이지 않는다
  const R = T.R;
  const allGroups = T.DECOR.map(decor => ({ decor, words: ['x'], count: 1, items: [] }));
  const placed = R.decorPlacement({ decor: allGroups, talks: [] });
  const floorPicked = allGroups.filter(g => g.decor.place === 'floor').slice(0, R.FLOOR_SLOTS.length);
  const tallPicked = floorPicked.filter(g => g.decor.height === 'tall').length;
  const svgAll = placed.objects.map(o => o.svg).join('');
  const tallShown = floorPicked.filter(g => g.decor.height === 'tall' && svgAll.includes(`decor:${g.decor.id}"`)).length;
  ok(tallShown === Math.min(tallPicked, R.FLOOR_SLOTS.filter(s => s.fit.includes('tall')).length), `키 큰 물건이 빠지지 않음 (${tallShown}/${tallPicked})`);
  const zones = svgAll.match(/data-zone="decor:\w+"/g) || [];
  ok(new Set(zones).size === zones.length && zones.length >= 16, `물건이 겹쳐 놓이지 않음 (${zones.length}개)`);
  const near = R.FLOOR_SLOTS.flatMap((a, i) => R.FLOOR_SLOTS.slice(i + 1).filter(b => Math.hypot(a.x - b.x, a.y - b.y) < 0.9).map(b => [a, b]));
  ok(!near.length, `바닥 자리끼리 충분히 떨어져 있음${near.length ? ` → ${JSON.stringify(near[0])}` : ''}`);
  const wallIds = placed.walls.join('').match(/decor:\w+/g) || [];
  ok(wallIds.length === 3 && new Set(wallIds).size === 3, `벽 물건은 자리마다 하나씩 (${wallIds.length}개)`);
  const few = R.decorPlacement({ decor: [{ decor: T.DECOR_BY_ID.chart, words: ['통계'], count: 3, items: [] }, { decor: T.DECOR_BY_ID.recycle, words: ['재활용'], count: 1, items: [] }], talks: [] });
  ok(few.objects.length === 2, '기록이 적으면 그만큼만 놓임');

  // AI 도구를 썼다고 로봇이 되지 않는다
  const decorOf = it => {
    it.themes = it.themes || T.detectThemes(`${it.title} ${it.content || ''}`).map(x => x.id);
    it.keywords = it.keywords || T.extractKeywords(`${it.title} ${it.content || ''}`);
    return [...T.itemDecorIds(it).keys()];
  };
  let d = decorOf({ type: 'ai', title: 'ChatGPT 다회용기 회수율 통계', content: '질문: GPT야 다회용기 회수율 통계 분석해줘' });
  ok(!d.includes('robot') && d.includes('recycle'), `AI 대화: 주제 물품만 (${d})`);
  d = decorOf({ type: 'ai', title: 'x', keywords: ['Claude', 'gpt-4o', 'GPT로', 'LLM', 'AI', '반려동물'] });
  ok(!d.includes('robot') && d.includes('pet'), `도구 이름은 물품이 안 됨 (${d})`);
  d = decorOf({ type: 'ai', title: '데이터 분석 추천', content: '' });
  ok(!d.includes('robot'), `'데이터·분석'만으로 로봇이 되지 않음 (${d})`);
  d = decorOf({ type: 'idea', title: '인공지능 챗봇 상담 서비스', content: '챗봇이 안내' });
  ok(d.includes('robot'), `내용이 AI를 다루면 로봇 (${d})`);
  d = decorOf({ type: 'memo', title: 'zz', keywords: [], themes: ['pet'] });
  ok(d.includes('pet'), `키워드가 없으면 주제로 채움 (${d})`);

  console.log('--- 연동 작업 → 물품 (가짜 API)');
  const now = new Date().toISOString();
  const j = body => ({ ok: true, json: async () => body });
  console.log('--- 데이터 정화');
  {
    const bad = '"><img src=x onerror=alert(1)>';
    const run = code => vm.runInContext(code, T.ctx);
    const clean = (fn, o, id) => JSON.parse(run(`JSON.stringify(${fn}(${JSON.stringify(o)}${id ? `, ${JSON.stringify(id)}` : ''}))`));
    const m = clean('cleanMember', { id: 'm1', name: bad, color: bad, photo: bad, connections: { github: bad, figma: 'ok', [bad]: 'ok' }, pinnedIdeaId: bad });
    ok(/^#[0-9a-f]{6}$/i.test(m.color) && !m.photo && m.pinnedIdeaId === null && JSON.stringify(m.connections) === '{"figma":"ok"}', '팀원: 색·사진·연결 상태 정화');
    ok(run(`cleanMember(${JSON.stringify({ id: bad })})`) === null, 'id가 잘못된 팀원은 버림');
    const good = { id: 'x1', memberId: 'm1', type: 'memo', visibility: 'team', title: '제목', content: '내용', url: 'example.com/a', createdAt: 5, keywords: ['다회용기'], themes: ['eco'], votes: ['m1'], table: { x: 1, y: 2 }, ownerUid: 'u1' };
    ok(JSON.stringify(clean('cleanItem', good)) === JSON.stringify(good), '올바른 기록은 한 글자도 바뀌지 않음');
    const i = clean('cleanItem', { ...good, type: bad, visibility: bad, url: `javascript:alert(1)`, createdAt: bad, keywords: [bad, 3], themes: [bad, 'eco'], votes: [bad, 'm1'], table: { x: bad, y: 1 } });
    ok(i.type === 'memo' && i.visibility === 'me' && i.url === '' && i.createdAt === 0 && i.table === null && i.votes.join() === 'm1' && i.themes.join() === 'eco', '기록: 잘못된 칸만 안전한 값으로');
    ok(clean('cleanItem', good, 'doc1').id === 'doc1', '문서 안의 id 대신 문서 id를 씀');
    ok(run(`cleanItem(${JSON.stringify({ ...good, memberId: bad })})`) === null, '작성자 id가 잘못된 기록은 버림');
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', 'https://a.b/"><x', ' javascript:alert(1)']) ok(run(`cleanUrl(${JSON.stringify(u)})`) === '', `주소 거부: ${u}`);
    for (const u of ['https://a.b/c?d=1', 'http://a.b', 'example.com/a', '']) ok(run(`cleanUrl(${JSON.stringify(u)})`) === u, `주소 허용: ${u || '(빈 값)'}`);
    const stale = run(`JSON.stringify(sanitizeWorkspace({ members: [{ id: 'm1', name: 'a', color: '#000000' }], items: [{ id: 'a', memberId: 'gone', type: 'memo', visibility: 'team', title: '', content: '', createdAt: 1 }] }))`);
    ok(JSON.parse(stale).items.length === 0, '명단에 없는 팀원의 기록은 파일에서 뺌');
    ok(/^[a-z0-9]+$/.test(run('uid()')), '기록 id 형식');
  }

  const G = makeApp(async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/commits')) return j([{ sha: 'a'.repeat(40), html_url: 'https://github.com/x', commit: { message: 'fix(auth): 로그인 오류 수정\n\nCo-Authored-By: Claude <x@y>', author: { date: now } } }, { sha: 'b'.repeat(40), html_url: 'https://github.com/y', commit: { message: '발표 자료 정리', author: { date: now } } }]);
    if (u.pathname.endsWith('/pulls')) return j([{ number: 3, title: '결제 화면 추가', body: '', user: { login: 'me' }, created_at: now, html_url: 'https://github.com/z', state: 'open' }]);
    if (u.pathname.endsWith('/issues/comments')) return j([
      { id: 11, body: '반납함 위치 데이터는 공공데이터에서 받기로 해요', user: { login: 'me' }, created_at: now, html_url: 'https://github.com/o/r/issues/7#c11', issue_url: 'https://api.github.com/repos/o/r/issues/7' },
      { id: 12, body: '남의 댓글', user: { login: 'other' }, created_at: now, html_url: '', issue_url: 'https://api.github.com/repos/o/r/issues/7' },
    ]);
    if (u.pathname.endsWith('/issues')) {
      ok(u.searchParams.get('creator') === 'me' && u.searchParams.get('state') === 'all', '이슈는 내가 만든 것만(creator) 전체 상태로 조회');
      return j([
        { number: 7, title: '다회용기 반납함 위치 데이터 수집', body: '지도에 표시할 반납함 좌표가 필요해요', user: { login: 'me' }, created_at: now, html_url: 'https://github.com/o/r/issues/7', state: 'open', comments: 2 },
        { number: 3, title: '결제 화면 추가', body: '', user: { login: 'me' }, created_at: now, html_url: 'https://github.com/z', state: 'open', pull_request: { url: 'x' } },
      ]);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }, ['나']);
  await G.syncGithub({ login: 'me', token: '' }, 'o/r', Date.now() - 864e5);
  const works = G.state.items.filter(i => i.type === 'work');
  ok(works.length === 5 && works.every(w => w.work.keywords?.length), `커밋·PR·이슈·이슈 댓글마다 핵심 키워드 (${works.length}개)`);
  const issue = works.find(w => w.work.kind === 'issue');
  ok(issue && issue.title.includes('#7') && issue.keywords.includes('반납함') && !works.some(w => w.work.kind === 'issue' && w.title.includes('#3')), '이슈 기록 (PR은 이슈 목록에서 빼고 PR로만)');
  const ic = works.find(w => w.work.kind === 'issue_comment');
  ok(ic && ic.content.includes('공공데이터') && !ic.content.includes('남의 댓글') && ic.url.includes('#c11'), '내 이슈 댓글만 하루 단위로 묶음');
  ok(works.find(w => w.work.ai)?.title.includes('로그인'), 'AI 공동 작성 커밋 표시');
  const g1 = G.roomDecorGroups(G.state.items);
  console.log('    물품:', show(g1));
  ok(g1.some(g => g.decor.id === 'laptop') && g1.some(g => g.decor.id === 'safe'), 'GitHub: 노트북 + 키워드 물품');

  const ME = 'me';
  const F = makeApp(async url => {
    const u = new URL(url);
    if (u.hostname === 'api.figma.com') {
      if (u.pathname.endsWith('/versions')) return j({ versions: [{ id: 'v', created_at: now, label: '로그인 화면 UI', user: { id: ME } }] });
      if (u.pathname.endsWith('/comments')) return j({ comments: [{ id: 'c', message: '결제 버튼 색 바꿔요', created_at: now, user: { id: ME } }] });
      return j({ name: '모바일 앱 디자인' });
    }
    if (u.pathname.startsWith('/v1/pages/')) return j({ id: 'p', url: 'https://notion.so/p', last_edited_time: now, last_edited_by: { id: ME }, properties: { t: { type: 'title', title: [{ plain_text: '발표 일정과 예산 정리' }] } } });
    if (u.pathname === '/v1/comments') return j({ results: [{ id: 'k', created_time: now, created_by: { id: ME }, rich_text: [{ plain_text: '설문 결과 데이터 확인했어요' }] }] });
    return { ok: false, status: 404, json: async () => ({}) };
  }, ['나']);
  await F.syncFigma({ token: 't', userId: ME }, ['KEY1234567890ABCD'], Date.now() - 864e5);
  await F.syncNotion({ token: 't', userId: ME }, ['1a2b3c4d-5e6f-7081-9203-a4b5c6d7e8f9'], Date.now() - 864e5);
  const ids = F.roomDecorGroups(F.state.items).map(g => g.decor.id);
  ok(ids.includes('art') && ids.includes('papers'), 'Figma→이젤, Notion→서류');
  ok(ids.includes('safe') && ids.includes('phone'), 'Figma 키워드 → 금고(로그인)·휴대폰(모바일)');
  ok(ids.includes('podium') && ids.includes('piggy') && ids.includes('calendar'), 'Notion 제목 → 연단(발표)·저금통(예산)·달력(일정)');
  ok(!F.state.items.some(i => i.type === 'work' && (i.keywords.includes('페이지') || i.keywords.includes('수정'))), '안내 문구는 키워드가 안 됨');

  console.log('--- 주간 요약');
  {
    const W = makeApp(null, ['가', '나']);
    const ws = W.weekStart(Date.UTC(2026, 9, 28));
    const [m1, m2] = W.state.members.map(m => m.id);
    const base = { title: 't', content: '', url: '', votes: [], table: null, themes: [] };
    const ws0 = {
      members: W.state.members,
      items: [
        { ...base, id: 'i1', memberId: m1, type: 'memo', visibility: 'team', createdAt: ws + 1000, keywords: ['다회용기', 'GPT'] },
        { ...base, id: 'i2', memberId: m1, type: 'memo', visibility: 'me', createdAt: ws + 2000, keywords: ['비밀주제'] },
        { ...base, id: 'i3', memberId: m2, type: 'ai', visibility: 'prof', createdAt: ws + 3000, keywords: ['설문'], ai: { tool: 'x', purpose: 'code', transcript: '' } },
        { ...base, id: 'old', memberId: m2, type: 'memo', visibility: 'team', createdAt: ws - 1000, keywords: ['지난주'] },
        { ...base, id: 'next', memberId: m2, type: 'memo', visibility: 'team', createdAt: ws + 7 * 864e5, keywords: ['다음주'] },
      ],
      decisions: [
        { id: 'd1', text: '근거 있는 결정', sourceIds: ['i1'], createdAt: ws + 5 },
        { id: 'd2', text: '근거 없는 결정', sourceIds: ['gone'], createdAt: ws + 6 },
        { id: 'd3', text: '다른 주 결정', sourceIds: ['i1'], createdAt: ws - 5 },
      ],
      calls: [
        { id: 'c1', title: '끝난 회의', status: 'ended', startedAt: ws + 1, endedAt: ws + 2, summary: '요약' },
        { id: 'c2', title: '진행 중', status: 'live', startedAt: ws + 1, endedAt: null },
      ],
      quests: [{ id: 'q', week: ws, title: 'x', target: 'any', count: 2 }, { id: 'q2', week: ws - 7 * 864e5, title: 'y', target: 'any', count: 2 }],
    };
    const w = T.weeklySummary(ws0, ws);
    ok(w.total === 3, `이 주 기록만 센다 (${w.total}건, 나만 기록은 횟수에 포함)`);
    ok(w.members[0].n === 2 && w.members[1].n === 1, '팀원별 횟수');
    ok(JSON.stringify(w.keywords.sort()) === JSON.stringify(['다회용기', '설문'].sort()), `나만 기록·도구 이름·다른 주는 키워드에서 뺌 (${w.keywords})`);
    ok(w.decisions.map(d => d.id).join() === 'd1', '근거 있는 이 주 결정만');
    ok(w.calls.map(c => c.id).join() === 'c1', '끝난 회의만');
    ok(w.quests.map(q => q.id).join() === 'q', '이 주 퀘스트만');
    ok(w.purposes.code === 1, 'AI 사용 목적');
    const forProf = T.weeklySummary(T.sanitizeForProf(ws0), ws);
    ok(forProf.total === 3, '교수자도 횟수는 그대로');
    ok(forProf.keywords.join() === '설문', `교수자: 교수자까지 기록의 키워드만 (${forProf.keywords})`);
    ok(forProf.calls.length === 0, '교수자: 공유하지 않은 회의는 안 보임');
    ok(forProf.quests.length === 0, '교수자: 퀘스트 없음');
    ok(!JSON.stringify(forProf).includes('비밀주제') && !JSON.stringify(forProf).includes('다회용기'), '교수자 요약에 비공개 내용이 없음');
    const empty = T.weeklySummary({ members: W.state.members, items: [] }, ws);
    ok(empty.total === 0 && empty.decisions.length === 0, '기록이 없는 주');
  }

  console.log('--- Notion 전체 검색: 하위 페이지·본문까지');
  {
    const ME2 = 'me', ROOT = '11111111-1111-4111-8111-111111111111', A = '22222222-2222-4222-8222-222222222222', B = '33333333-3333-4333-8333-333333333333', C = '44444444-4444-4444-8444-444444444444', D = '55555555-5555-4555-8555-555555555555';
    const page = (id, title, who, parent) => ({ id, url: `https://notion.so/${id}`, last_edited_time: now, last_edited_by: { id: who }, parent, properties: { t: { type: 'title', title: [{ plain_text: title }] } } });
    const pages = {
      [ROOT]: page(ROOT, '팀 위키', 'other', { type: 'workspace', workspace: true }),
      [A]: page(A, '인터뷰 설문 결과', ME2, { type: 'page_id', page_id: ROOT }),
      [B]: page(B, '남이 고친 페이지', 'other', { type: 'page_id', page_id: ROOT }),
      [C]: page(C, '내 개인 메모', ME2, { type: 'workspace', workspace: true }),
      [D]: page(D, '예산 계획', ME2, { type: 'page_id', page_id: A }),
    };
    let searches = 0, blockReads = 0;
    const N = makeApp(async (url, init = {}) => {
      const u = new URL(url);
      if (u.pathname === '/v1/search') { searches++; ok(init.method === 'POST' && JSON.parse(init.body).sort?.timestamp === 'last_edited_time', 'search: 마지막 수정 시각 순으로 요청'); return j({ results: [pages[A], pages[B], pages[C], pages[D]], has_more: false }); }
      const pg = u.pathname.match(/^\/v1\/pages\/(.+)$/);
      if (pg) return pages[pg[1]] ? j(pages[pg[1]]) : { ok: false, status: 404, json: async () => ({}) };
      const bl = u.pathname.match(/^\/v1\/blocks\/(.+)\/children$/);
      if (bl) { blockReads++; return j({ results: bl[1] === A ? [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: '자취생 12명 인터뷰 설문 응답을 표로 정리' }] } }, { type: 'heading_2', heading_2: { rich_text: [{ plain_text: '다회용기 선호도' }] } }] : [{ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: '발표 자료 인쇄비' }] } }] }); }
      if (u.pathname === '/v1/comments') return j({ results: [] });
      return { ok: false, status: 404, json: async () => ({}) };
    }, ['나']);
    await N.syncNotion({ token: 't', userId: ME2 }, [ROOT], Date.now() - 864e5);
    const got = N.state.items.filter(i => i.type === 'work' && i.work.source === 'notion');
    ok(got.length === 2 && got.some(w => w.work.page === A) && got.some(w => w.work.page === D), `연결한 페이지 아래의 내 수정만 (하위·손자 페이지 포함, 남의 수정·내 개인 메모 제외) → ${got.map(w => w.title)}`);
    ok(got.find(w => w.work.page === A)?.keywords.some(k => /설문|인터뷰|다회용기/.test(k)), `페이지 본문에서 키워드 (${got.find(w => w.work.page === A)?.keywords})`);
    ok(searches === 1 && blockReads === 2, `검색 1번, 본문 읽기는 내 수정 페이지만 (${searches}, ${blockReads})`);
    blockReads = 0;
    await N.syncNotion({ token: 't', userId: ME2 }, [ROOT], Date.now() - 864e5);
    ok(blockReads === 0, '같은 수정 시각이면 본문을 다시 읽지 않음 (캐시)');
    const N2 = makeApp(async (url, init = {}) => {
      const u = new URL(url);
      if (u.pathname === '/v1/search') return j({ results: [pages[A], pages[B], pages[C], pages[D]], has_more: false });
      const bl = u.pathname.match(/^\/v1\/blocks\/(.+)\/children$/);
      if (bl) return j({ results: [] });
      if (u.pathname === '/v1/comments') return j({ results: [] });
      return { ok: false, status: 404, json: async () => ({}) };
    }, ['나']);
    await N2.syncNotion({ token: 't', userId: ME2 }, [], Date.now() - 864e5);
    ok(N2.state.items.filter(i => i.type === 'work').length === 3, '연결한 페이지가 없으면 통합에 공유된 모든 페이지에서 내 수정을 가져옴');
  }

  console.log('--- Google 문서: 수정 기록·댓글');
  {
    const gid = '1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789';
    ok(T.parseGdocId(`https://docs.google.com/document/d/${gid}/edit?usp=sharing`) === gid && T.parseGdocId(`https://docs.google.com/spreadsheets/d/${gid}/edit#gid=0`) === gid && T.parseGdocId(`https://docs.google.com/presentation/d/${gid}/edit`) === gid && T.parseGdocId(`https://drive.google.com/file/d/${gid}/view`) === gid && T.parseGdocId(`https://drive.google.com/open?id=${gid}`) === gid && T.parseGdocId('그냥 글') === '' && T.parseGdocId('https://docs.google.com/document/d/short/edit') === '', 'Docs·Sheets·Slides·Drive 링크에서 파일 id (짧은 가짜 id는 거절)');
    const calls = [];
    const G2 = makeApp(async (url, init = {}) => {
      const u = new URL(url); calls.push(u.pathname + u.search);
      if (init.headers?.Authorization !== 'Bearer ya29.test') calls.push('BAD-AUTH');
      if (u.pathname === '/drive/v3/files/1DOC') return j({ id: '1DOC', name: '발표 대본', mimeType: 'application/vnd.google-apps.document', modifiedTime: now, webViewLink: 'https://docs.google.com/document/d/1DOC/edit' });
      if (u.pathname === '/drive/v3/files/1DOC/revisions') return j({ revisions: [
        { id: 'r1', modifiedTime: now, lastModifyingUser: { displayName: '나', me: true } },
        { id: 'r2', modifiedTime: now, lastModifyingUser: { displayName: '나', me: true } },
        { id: 'r3', modifiedTime: now, lastModifyingUser: { displayName: '남', me: false } },
        { id: 'r0', modifiedTime: new Date(Date.now() - 40 * 864e5).toISOString(), lastModifyingUser: { displayName: '나', me: true } },
      ] });
      if (u.pathname === '/drive/v3/files/1DOC/export') return { ok: true, status: 200, json: async () => { throw new Error('text'); }, text: async () => '다회용기 순환 서비스 발표 대본\n1. 문제: 배달 포장재 쓰레기\n2. 해결: 반납함과 포인트' };
      if (u.pathname === '/drive/v3/files/1DOC/comments') return j({ comments: [
        { id: 'c1', createdTime: now, content: '예산 슬라이드는 표로 바꿔요', author: { displayName: '나', me: true } },
        { id: 'c2', createdTime: now, content: '남의 댓글', author: { displayName: '남', me: false } },
      ] });
      return { ok: false, status: 404, json: async () => ({}) };
    }, ['나']);
    const n = await G2.syncGdocs({ token: 'ya29.test', email: 'me@x.com' }, ['1DOC'], Date.now() - 30 * 864e5);
    const gd = G2.state.items.filter(i => i.type === 'work' && i.work.source === 'gdocs');
    const edit = gd.find(w => w.work.kind === 'edit'), cm = gd.find(w => w.work.kind === 'comment');
    ok(n === 2 && gd.length === 2 && edit && cm, `수정(하루 묶음)·댓글 기록 (${gd.map(w => w.work.kind)})`);
    ok(edit.title.includes('발표 대본') && edit.work.count === 2 && edit.url === 'https://docs.google.com/document/d/1DOC/edit', `내 수정만 세어 하루 2번 (${edit.title}, ${edit.work.count}번)`);
    ok(edit.keywords.some(k => /다회용기|포장재|반납함/.test(k)), `문서 본문에서 키워드 (${edit.keywords})`);
    ok(cm.content.includes('예산 슬라이드') && !cm.content.includes('남의 댓글'), '내 댓글만');
    ok(calls.some(c => c.includes('/export?mimeType=text%2Fplain')) && calls.some(c => c.includes('/revisions?')) && calls.some(c => c.includes('fields=')) && !calls.includes('BAD-AUTH'), `Drive API: files·revisions·export·comments, 모두 Bearer 토큰 (${calls.length}번)`);
    calls.length = 0;
    await G2.syncGdocs({ token: 'ya29.test', email: 'me@x.com' }, ['1DOC'], Date.now() - 30 * 864e5);
    ok(!calls.some(c => c.includes('/export')), '수정 시각이 같으면 본문을 다시 읽지 않음 (캐시)');
    const m = T.cleanMember({ id: 'm1', name: 'x', color: '#000000', connections: { gdocs: 'ok', github: 'error' } });
    ok(m.connections.gdocs === 'ok' && T.cleanLinks({ gdocs: ['1DOC', 7] }).gdocs.join() === '1DOC', 'sanitize: gdocs 연결 상태·링크 통과');
  }

  console.log('--- 프록시 경유 (PROXY_URL + 로그인 + config.proxy)');
  {
    const sent = [];
    const P = makeApp(async (url, init = {}) => {
      sent.push({ url, init });
      const u = new URL(url);
      if (u.pathname === '/v1/config') return j({ proxy: { github: true, figma: true, notion: true }, features: {} });
      if (u.pathname.endsWith('/versions')) return j({ versions: [] });
      if (u.pathname.endsWith('/comments')) return j({ comments: [], results: [] });
      if (u.pathname.endsWith('/search')) return j({ results: [] });
      if (u.pathname.includes('/v1/pages/')) return { ok: false, status: 404, json: async () => ({}) };
      if (u.pathname.endsWith('/query')) return j({ results: [] });
      return j({ name: 'f' });
    }, ['나']);
    const run = code => vm.runInContext(code, P.ctx);
    run(`var PROXY_URL = 'https://proxy.example'; var AUTH_ENABLED = true; authUser = { uid: 'u1' };
      var firebase = { auth: () => ({ currentUser: { getIdToken: async () => 'id-token' } }) };
      function proxyReady() { return true; } async function proxyConfig() { return (await fetch(PROXY_URL + '/v1/config')).json(); }`);
    await P.syncFigma({ token: 'figd_pat', userId: 'me' }, ['KEY1234567890ABCD'], Date.now() - 864e5);
    const fg = sent.find(x => x.url.includes('/files/KEY1234567890ABCD/versions'));
    ok(fg && fg.url === 'https://proxy.example/v1/proxy/figma/v1/files/KEY1234567890ABCD/versions', `Figma 요청이 프록시 경로로 바뀜 (${fg && fg.url})`);
    ok(fg && fg.init.headers.Authorization === 'Bearer id-token' && fg.init.headers['X-BR-Token'] === 'figd_pat' && !fg.init.headers['X-Figma-Token'], 'Figma 토큰은 X-BR-Token으로만, 로그인 토큰은 Authorization');
    await P.syncNotion({ token: 'ntn_s', userId: 'me' }, ['1a2b3c4d-5e6f-7081-9203-a4b5c6d7e8f9'], Date.now() - 864e5);
    const q = sent.find(x => x.url.endsWith('/query'));
    ok(q && q.url.startsWith('https://proxy.example/v1/proxy/notion/v1/databases/') && q.init.method === 'POST' && JSON.parse(q.init.body).page_size === 50 && q.init.headers['Content-Type'] === 'application/json', 'Notion 조회(POST)도 프록시로, 본문 그대로');
    ok(sent.every(x => !x.url.includes('api.figma.com') && !x.url.includes('api.notion.com')), '프록시가 있으면 서비스로 직접 나가지 않음');
    run(`proxyConfigCache = null; proxyConfig = async () => ({ proxy: { github: true }, features: {} });`);
    sent.length = 0;
    await P.syncFigma({ token: 'figd_pat', userId: 'me' }, ['KEY1234567890ABCD'], Date.now() - 864e5);
    ok(sent.length && sent.every(x => x.url.startsWith('https://api.figma.com/') && x.init.headers['X-Figma-Token'] === 'figd_pat'), '프록시가 그 소스를 중계하지 않으면 직접 호출로 폴백');
  }

  console.log('--- 샘플 체험의 가상 API 데이터');
  {
    let realCalls = 0;
    const S = makeApp(async () => { realCalls++; throw new Error('실제 네트워크를 쓰면 안 된다'); }, ['지민', '서준', '하은', '도윤']);
    const run = code => vm.runInContext(code, S.ctx);
    run('guestMode = true');
    const me = S.state.meId;
    const added = await run('loadSampleApi()');
    const works = S.state.items.filter(i => i.type === 'work');
    console.log(`    작업 ${works.length}개:`, works.map(w => w.work.source).reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {}));
    ok(realCalls === 0, '실제 네트워크 요청 없음');
    ok(added === works.length && works.length >= 15, `가져오기 코드로 작업이 생김 (${works.length}개)`);
    ok(S.state.meId === me, '가져온 뒤 현재 사용자가 그대로');
    const m = S.state.members;
    const ofMember = (i, src) => works.filter(w => w.memberId === m[i].id && w.work.source === src);
    ok(ofMember(0, 'github').length === 7 && ofMember(1, 'github').length === 6 && ofMember(3, 'github').length === 3, `팀원마다 자기 커밋·PR·이슈·이슈 댓글만 (${[0, 1, 2, 3].map(i => ofMember(i, 'github').length)})`);
    ok(works.some(w => w.work.kind === 'issue' && w.title.includes('#21')) && !works.some(w => w.work.kind === 'issue' && w.title.includes('#12')), '샘플 이슈: PR은 이슈로 세지 않음');
    ok(ofMember(2, 'figma').length === 3 && ofMember(0, 'figma').length === 2 && !ofMember(1, 'figma').length, 'Figma: 자기 버전·댓글만, 미연결 팀원은 없음');
    ok(ofMember(1, 'notion').length === 2 && ofMember(2, 'notion').length === 3 && !ofMember(0, 'notion').length, `Notion: 마지막 수정자·자기 댓글만, 하위 페이지 포함 (${[0, 1, 2].map(i => ofMember(i, 'notion').length)})`);
    ok(works.filter(w => w.work.ai).length === 3, 'AI 공동 작성 커밋 표시');
    ok(ofMember(1, 'gdocs').length === 2 && ofMember(0, 'gdocs').length === 2 && !ofMember(2, 'gdocs').length, `Google 문서: 수정한 날·댓글만 (${[0, 1, 2].map(i => ofMember(i, 'gdocs').length)})`);
    ok(works.every(w => w.url === ''), '가상 데이터에는 갈 곳 없는 링크가 없음');
    ok(m[3].connections.github === 'ok' && !m[3].connections.figma, '도윤은 GitHub만 연결 (연동 안 됨 표시용)');
    const objs = i => S.roomDecorGroups(S.state.items.filter(x => x.memberId === m[i].id)).map(g => g.decor.id);
    ok(objs(0).includes('laptop') && objs(0).includes('safe') && objs(0).includes('art'), `지민 방: 노트북·금고·이젤 (${objs(0).slice(0, 8)})`);
    ok(objs(2).includes('art') && objs(2).includes('papers'), `하은 방: 이젤·서류 (${objs(2).slice(0, 8)})`);
    ok(objs(3).includes('robot') && objs(3).includes('gamepad'), `도윤 방: 로봇·게임패드 (${objs(3).slice(0, 8)})`);
    ok(await run('syncAllWork(true)') === 1, '지금 가져오기: 새 커밋 1개');
    ok(await run('syncAllWork(false)') === undefined, '자동 가져오기는 샘플에서 돌지 않음');
    const again = S.state.items.filter(i => i.type === 'work');
    ok(again.length === works.length + 1 && new Set(again.map(w => w.id)).size === again.length, `같은 작업이 두 번 생기지 않음 (${works.length} → ${again.length})`);
    ok(S.roomDecorGroups([{ type: 'work', keywords: [], themes: [], work: { source: 'figma', keywords: ['반찬', '나눔', '디자인'] }, title: 't' }]).every(g => g.decor.id !== 'donation'), "'반찬 나눔'은 기부함이 되지 않음");
    ok(realCalls === 0, '다시 가져와도 네트워크 요청 없음');
  }

  console.log('--- 데이터 모델: 마일스톤·산출물·기여도');
  {
    const D = makeApp(null, ['지민', '서준', '하은']);
    const run = code => vm.runInContext(code, D.ctx);
    // ① 구버전 워크스페이스 마이그레이션(필드 없음 → [])
    const mg = run('migrate({ version: 1, items: [], members: [] })');
    ok(Array.isArray(mg.milestones) && mg.milestones.length === 0, 'migrate: milestones 기본 []');
    ok(Array.isArray(mg.deliverables) && mg.deliverables.length === 0, 'migrate: deliverables 기본 []');
    // ② 산출물 추가·수정·삭제
    const d = run("addDeliverable({ title: 'SSRD', docType: 'SSRD', ownerId: state.meId })");
    ok(D.state.deliverables.length === 1, '산출물 추가 → 목록 1개');
    ok(d.status === 'draft', '산출물 기본 상태 draft');
    run(`updateDeliverable(${JSON.stringify(d.id)}, { status: 'submitted' })`);
    ok(D.state.deliverables[0].status === 'submitted', '산출물 상태 변경 반영');
    const ms = run("addMilestone({ title: '공감 단계 마감', kind: 'phase' })");
    run(`updateDeliverable(${JSON.stringify(d.id)}, { milestoneId: ${JSON.stringify(ms.id)} })`);
    run(`removeMilestone(${JSON.stringify(ms.id)})`);
    ok(D.state.milestones.length === 0 && D.state.deliverables[0].milestoneId === null, '마일스톤 삭제 시 산출물 연결 해제');
    // ③ 기여도: 팀원 work 아이템을 소스별로 집계
    run(`['github', 'github', 'figma'].forEach((s, n) => state.items.push({ id: uid(), memberId: state.meId, type: 'work', title: 'w' + n, content: '', url: '', createdAt: Date.now(), keywords: ['api'], themes: [], visibility: 'team', work: { source: s } }));
      state.items.push({ id: uid(), memberId: state.meId, type: 'memo', title: 'm', content: '', url: '', createdAt: Date.now(), keywords: ['api'], themes: [], visibility: 'team' });`);
    const c = run('contribution(state.meId)');
    ok(c.counts.github === 2 && c.counts.figma === 1, `기여도: 소스별 work 집계 (${JSON.stringify(c.counts)})`);
    ok(c.byType.work === 3 && c.byType.memo === 1, '기여도: 타입별 집계');
    ok(c.topKeywords.includes('api') && c.last > 0, '기여도: 키워드·최근활동');
    // ④ 샘플 워크스페이스에 마일스톤·산출물 시드
    const SW = makeApp(null);
    const sw = vm.runInContext('sampleWorkspace()', SW.ctx);
    ok(sw.milestones.length >= 1, `샘플: 마일스톤 시드 (${sw.milestones.length})`);
    ok(sw.deliverables.length >= 1, `샘플: 산출물 시드 (${sw.deliverables.length})`);
  }

  console.log('--- 전송 계층: GitHub 프록시 라우팅');
  {
    const calls = [];
    const P = makeApp(async (url, init) => { calls.push({ url: String(url), init: init || {} }); return { ok: true, status: 200, async json() { return []; } }; }, ['지민', '서준', '하은']);
    const run = code => vm.runInContext(code, P.ctx);
    // 프록시 가용 환경: 실모드 + PROXY_URL + /v1/config.proxy.github
    run(`PROXY_URL = 'https://pxy.example'; guestMode = false;
      proxyReady = () => Boolean(PROXY_URL) && !guestMode;
      proxyConfig = async () => ({ proxy: { github: true } });
      firebase = { auth: () => ({ currentUser: { getIdToken: async () => 'idtok-1' } }) };`);
    await run(`apiGet('github', 'https://api.github.com/repos/o/r/commits?per_page=5', 'ghp_x')`);
    const viaProxy = calls.at(-1);
    ok(viaProxy && viaProxy.url === 'https://pxy.example/v1/proxy/github/repos/o/r/commits?per_page=5', `프록시 URL로 라우팅 (${viaProxy && viaProxy.url})`);
    ok(viaProxy && viaProxy.init.headers['X-BR-Token'] === 'ghp_x', 'X-BR-Token에 GitHub 토큰');
    ok(viaProxy && viaProxy.init.headers.Authorization === 'Bearer idtok-1', 'Authorization에 Firebase ID 토큰');

    // 폴백: PROXY_URL 미설정이면 원 URL로 직접 fetch
    calls.length = 0;
    run(`PROXY_URL = '';`);
    await run(`apiGet('github', 'https://api.github.com/repos/o/r/issues', 'ghp_y')`);
    const direct = calls.at(-1);
    ok(direct && direct.url === 'https://api.github.com/repos/o/r/issues', `프록시 없으면 직접 fetch (${direct && direct.url})`);
    ok(direct && direct.init.headers.Authorization === 'Bearer ghp_y', '직접 호출은 GitHub 토큰을 Authorization에');

    // 데모 모드: 네트워크 없이 sampleFetch
    calls.length = 0;
    run(`PROXY_URL = 'https://pxy.example'; guestMode = true;`);
    try { await run(`apiGet('github', 'https://api.github.com/repos/o/r/commits', 'ghp_z')`); } catch (e) { /* sampleFetch 미지원 URL 무시 */ }
    ok(calls.length === 0, '데모 모드는 네트워크 호출 없음 (sampleFetch 경유)');
  }

  console.log('--- 코크핏 피드 필터·카드');
  {
    const F = makeApp(null, ['지민', '서준', '하은']);
    const run = code => vm.runInContext(code, F.ctx);
    const me = F.state.meId, other = F.state.members[1].id;
    run(`state.items = [
      { id: 'i1', memberId: ${JSON.stringify(me)}, type: 'work', title: '다회용기 커밋', content: '', url: 'https://x/1', createdAt: 100, keywords: ['다회용기'], themes: [], visibility: 'team', work: { source: 'github' } },
      { id: 'i2', memberId: ${JSON.stringify(me)}, type: 'work', title: '피그마 시안', content: '', url: '', createdAt: 90, keywords: ['디자인'], themes: [], visibility: 'team', work: { source: 'figma' } },
      { id: 'i3', memberId: ${JSON.stringify(other)}, type: 'memo', title: '비공개 메모', content: '다회용기 생각', url: '', createdAt: 80, keywords: [], themes: [], visibility: 'me' },
    ];`);
    const byQ = run("feedFilter(state.items, { q: '다회용기' }).map(i => i.id)");
    ok(byQ.includes('i1'), `검색어가 제목/키워드 매칭 (${byQ})`);
    const bySrc = run("feedFilter(state.items, { source: 'github' }).map(i => i.id)");
    ok(bySrc.length === 1 && bySrc[0] === 'i1', `소스 필터: github work만 (${bySrc})`);
    const vis = run('feedFilter(state.items, {}).map(i => i.id)');
    ok(!vis.includes('i3'), '다른 팀원의 visibility:me 아이템 제외 (canSee)');
    const card = run(`feedCardHTML({ id: 'x', memberId: ${JSON.stringify(me)}, type: 'memo', title: '<script>bad</script>', keywords: [], createdAt: 0 })`);
    ok(card.includes('&lt;script&gt;') && !card.includes('<script>bad'), '카드 제목 이스케이프(저장형 XSS 방어)');
    const jsCard = run(`feedCardHTML({ id: 'y', memberId: ${JSON.stringify(me)}, type: 'link', title: '링크', url: 'javascript:alert(1)', keywords: [], createdAt: 0 })`);
    ok(!/javascript:/i.test(jsCard), 'feedCardHTML: javascript: URL이 href에서 제거됨(safeUrl)');
  }

  // ---------- 결정 추출 품질 (SSRD LS-7: 80% 이상) ----------
  // 직접 쓴 회의체 문장으로 잰 값이다. SSRD가 요구하는 '실제 회의 5건' 측정은 tests/data/ 에 녹취를 넣어 같은 방식으로 한다.
  console.log('--- 결정 추출 품질 (LS-7)');
  const { yes, no } = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/decision-sentences.json'), 'utf8'));
  const hit = s => T.DECISION_PATTERN.test(s);
  const tp = yes.filter(hit).length, fp = no.filter(hit).length;
  const precision = tp / (tp + fp), recall = tp / yes.length;
  console.log(`    정밀도 ${(precision * 100).toFixed(0)}% (${tp}/${tp + fp}) · 재현율 ${(recall * 100).toFixed(0)}% (${tp}/${yes.length})`);
  yes.filter(s => !hit(s)).forEach(s => console.log(`    놓침: ${s}`));
  no.filter(hit).forEach(s => console.log(`    잘못 잡음: ${s}`));
  ok(precision >= 0.8, `정밀도 80% 이상 (${(precision * 100).toFixed(0)}%)`);
  ok(recall >= 0.8, `재현율 80% 이상 (${(recall * 100).toFixed(0)}%)`);
  console.log(process.exitCode ? '\n단위 시험: 실패 있음' : '\n단위 시험: 모두 통과');
})();
