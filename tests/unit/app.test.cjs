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
    console, Date, Math, JSON, Object, Array, Set, Map, String, Number, RegExp, Promise, Error, URL, URLSearchParams, encodeURIComponent,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    fetch: fakeFetch || (async () => { throw new Error('이 시험은 네트워크를 쓰지 않는다'); }),
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { querySelector: () => null, addEventListener() {} }, window: {}, navigator: {},
  };
  vm.createContext(ctx);
  vm.runInContext(['themes', 'nlp', 'store', 'trace', 'iso', 'decor', 'integrations', 'meetimport'].map(f => fs.readFileSync(path.join(root, 'js', `${f}.js`), 'utf8')).join('\n;\n')
    + `\n;var guestMode = false, authUser = null, cloud = { loaded: true };
    function render() {} function toast() {} function esc(s) { return String(s); } function fmtDate() { return ''; } function trunc(s) { return s; }
    state = newWorkspace('t', ${JSON.stringify(names)}); state.meId = state.members[0].id;
    globalThis.T = { get state() { return state; }, parseTranscript, guessMember, figmaTextFromDocument, coreKeywords, upsertWork, deleteItem, roomDecorGroups,
      syncGithub, syncFigma, syncNotion, decorFor, workKeywords, itemDecorIds, detectThemes, extractKeywords, addItem, decisionCandidates, DECISION_PATTERN, maskPII, weeklySummary, weekStart, sanitizeForProf };`, ctx);
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
  const G = makeApp(async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/commits')) return j([{ sha: 'a'.repeat(40), html_url: 'https://github.com/x', commit: { message: 'fix(auth): 로그인 오류 수정\n\nCo-Authored-By: Claude <x@y>', author: { date: now } } }, { sha: 'b'.repeat(40), html_url: 'https://github.com/y', commit: { message: '발표 자료 정리', author: { date: now } } }]);
    if (u.pathname.endsWith('/pulls')) return j([{ number: 3, title: '결제 화면 추가', body: '', user: { login: 'me' }, created_at: now, html_url: 'https://github.com/z', state: 'open' }]);
    return { ok: false, status: 404, json: async () => ({}) };
  }, ['나']);
  await G.syncGithub({ login: 'me', token: '' }, 'o/r', Date.now() - 864e5);
  const works = G.state.items.filter(i => i.type === 'work');
  ok(works.length === 3 && works.every(w => w.work.keywords?.length), '커밋·PR마다 핵심 키워드');
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
