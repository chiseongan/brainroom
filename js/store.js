// 워크스페이스 상태 + 저장. 온라인 팀은 Firestore(js/cloud.js), 데모 모드는 이 브라우저의 localStorage.

const STORAGE_KEY = 'brainroom:v1';
const MEMBER_COLORS = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#0ea5e9', '#eab308', '#8b5cf6', '#14b8a6'];
const TYPE_META = {
  link: { icon: '📚', label: '자료·링크', place: '책장' },
  memo: { icon: '🗒️', label: '메모', place: '포스트잇 보드' },
  idea: { icon: '💡', label: '아이디어', place: '화이트보드' },
  ai: { icon: '🖥️', label: 'AI 대화', place: '모니터' },
};

let state = null;
let saveSuppressed = false; // 온라인에 올릴 워크스페이스를 만드는 동안 이 브라우저 데이터를 덮어쓰지 않도록

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* 저장소 접근 불가 → 새로 시작 */ }
  return null;
}

// 예전 버전 워크스페이스에 새 필드를 채운다. 공유 범위가 없던 기록은 원래 팀에 공유되던 것이라 '팀'으로 둔다.
function migrate(ws) {
  ws.course ??= '';
  ws.viewer ??= 'student';
  for (const key of ['decisions', 'decisionDismissed', 'quests', 'corrections', 'changeLog', 'accessLog']) ws[key] ??= [];
  ws.items.forEach(i => {
    i.visibility ??= 'team';
    i.votes ??= [];
    if (!TYPE_META[i.type]) i.type = 'memo';
  });
  return ws;
}

// 온라인 팀이면 Firestore로 바뀐 것만 올리고, 아니면 이 브라우저에 저장한다
function saveState() {
  if (guestMode || saveSuppressed) return; // 로그인 없는 체험은 저장하지 않음
  if (state?.teamId || state?.cloudProf) {
    if (typeof cloudPush === 'function') cloudPush();
    return;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}

function newMember(name, index) {
  return { id: uid(), name, color: MEMBER_COLORS[index % MEMBER_COLORS.length], pinnedIdeaId: null };
}

function newWorkspace(teamName, names, course = '') {
  const members = names.map(newMember);
  return migrate({ version: 1, teamName, course, members, items: [], meId: members[0]?.id ?? null, view: 'meeting', roomId: null });
}

function addMember(name) {
  const m = newMember(name, state.members.length);
  state.members.push(m);
  saveState();
  return m;
}

function member(id) {
  return state.members.find(m => m.id === id);
}

// 로그인한 Google 계정과 연결된 팀원
function memberByUid(uid) {
  return state.members.find(m => m.uid === uid);
}

function claimMember(memberId, user) {
  const m = member(memberId);
  m.uid = user.uid;
  m.email = user.email;
  m.photo = user.photo;
  state.meId = m.id;
  saveState();
  return m;
}

function itemById(id) {
  return state.items.find(i => i.id === id);
}

// 지금 보는 사람에게 보이는 기록만 (공유 범위 RQ-6)
function itemsOf(memberId) {
  return state.items.filter(i => i.memberId === memberId && canSee(i));
}

function analyze(item) {
  const text = `${item.title} ${item.title} ${item.content}`; // 제목 가중치 2배
  item.keywords = extractKeywords(text);
  item.themes = detectThemes(text).map(t => t.id);
  return item;
}

// 기본 공유 범위는 '나만' (Win-AGRE-2). 저장 전에 개인정보 형태 문자열을 가린다 (LS-4).
function addItem({ memberId, type, title, content = '', url = '', createdAt = Date.now(), visibility = 'me', ai = null, correctionId = null }) {
  const item = { id: uid(), memberId, type, title: maskPII(title), content: maskPII(content), url, createdAt, visibility, table: null, votes: [] };
  if (ai) item.ai = ai;
  if (correctionId) item.correctionId = correctionId;
  analyze(item);
  state.items.push(item);
  saveState();
  return item;
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  state.members.forEach(m => { if (m.pinnedIdeaId === id) m.pinnedIdeaId = null; });
  // 근거가 사라진 결정은 자동으로 '확인 필요' 목록으로 간다 (ONRQ-2)
  saveState();
}

function profile(memberId) {
  const items = itemsOf(memberId).sort((a, b) => b.createdAt - a.createdAt);
  const themeScore = {};
  const kwScore = {};
  items.forEach(item => {
    item.themes.forEach(t => { themeScore[t] = (themeScore[t] || 0) + 1; });
    item.keywords.forEach(k => { kwScore[k] = (kwScore[k] || 0) + 1; });
  });
  const themes = Object.entries(themeScore)
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ theme: THEME_BY_ID[id], score }));
  const keywords = Object.entries(kwScore).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  const m = member(memberId);
  const ideas = items.filter(i => i.type === 'idea');
  return {
    items,
    themes,
    keywords,
    links: items.filter(i => i.type === 'link'),
    memos: items.filter(i => i.type === 'memo'),
    ideas,
    ais: items.filter(i => i.type === 'ai'),
    pinned: ideas.find(i => i.id === m?.pinnedIdeaId) || ideas[0] || null,
    last: items[0]?.createdAt ?? 0,
  };
}

function tableItems() {
  return state.items.filter(i => i.table && canSee(i));
}

function placeOnTable(item, x, y) {
  if (x === undefined) {
    const n = tableItems().length;
    x = 8 + ((n * 23) % 64);
    y = 10 + ((Math.floor(n / 3) * 27) % 60);
  }
  item.table = { x: clamp(x, 0, 82), y: clamp(y, 0, 80) };
  if (item.visibility === 'me') item.visibility = 'team'; // 회의 테이블에 올리면 팀에 공개
  saveState();
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 서로 다른 팀원의 자료 사이 연결 후보
function crossMemberLinks(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.memberId === b.memberId) continue;
      const rel = relatedness(a, b);
      if (rel.score > 0) pairs.push({ a, b, ...rel });
    }
  }
  return pairs.sort((p, q) => q.score - p.score);
}

function sampleWorkspace() {
  const ws = newWorkspace('캡스톤 3조', ['지민', '서준', '하은', '도윤'], '소프트웨어공학');
  state = ws;
  const [jimin, seojun, haeun, doyun] = ws.members.map(m => m.id);
  const h = 3600 * 1000;
  const now = Date.now();
  const add = (memberId, type, title, content, url, ago, visibility = 'team') =>
    addItem({ memberId, type, title, content, url, createdAt: now - ago * h, visibility });
  const addAi = (memberId, tool, title, prompt, answer, ago, visibility) => {
    const transcript = `👤 ${prompt}

🤖 ${answer}`;
    return addItem({
      memberId, type: 'ai', title, content: aiSummary(prompt), createdAt: now - ago * h, visibility,
      ai: aiFields({ tool, transcript, firstPrompt: prompt, sourceId: `sample:${title}` }),
    });
  };

  add(jimin, 'link', '배달 포장재 쓰레기 통계', '배달 음식 포장재가 생활 플라스틱 쓰레기의 큰 비중을 차지한다는 기사. 재활용률은 생각보다 낮음.', 'https://example.com/packaging-waste', 30);
  add(jimin, 'link', '제로웨이스트 가게 사례 모음', '리필 스테이션, 다회용기 대여 서비스 사례. 대학가 카페와 협업한 사례도 있음.', 'https://example.com/zero-waste', 20);
  add(jimin, 'link', '탄소 발자국 계산 방식', '일상 소비가 만드는 탄소 배출량을 계산하는 방법 정리.', 'https://example.com/carbon', 18);
  add(jimin, 'memo', '다회용기 반납을 게임처럼?', '반납할 때마다 포인트, 레벨업 하면 카페 할인. 게이미피케이션 적용해보기.', '', 6);
  const ecoIdea = add(jimin, 'idea', '캠퍼스 다회용기 순환 서비스', '학교 식당·카페 배달에 다회용기를 쓰고 캠퍼스 반납함에서 회수. 플라스틱 쓰레기 절감.', '', 3);

  add(seojun, 'link', '1인가구 식비 지출 조사', '대학생 자취생의 배달 음식 의존도가 높고 식비가 소비의 큰 부분. 음식물 쓰레기 처리도 고민.', 'https://example.com/single-household', 26);
  add(seojun, 'link', '밀키트 구독 서비스 비교', '1인분 밀키트 구독 가격과 구성 비교. 자취생에게는 아직 비쌈.', 'https://example.com/mealkit', 22);
  add(seojun, 'memo', '자취생 공동구매', '재료를 조금만 사고 싶은데 대용량만 있음 → 원룸 이웃끼리 공동구매 모임?', '', 10);
  add(seojun, 'memo', '혼밥 외로움', '자취하면서 혼자 밥 먹는 게 제일 외롭다는 인터뷰가 많았음.', '', 8);
  add(seojun, 'memo', '1차 회의 메모', '주제 후보를 셋으로 좁혔다. 다음 주까지 자취생 3명을 인터뷰하기로 했다. 발표 자료는 하은이 정리하기로 결정함.', '', 4);
  const foodIdea = add(seojun, 'idea', '자취생 반찬 나눔 플랫폼', '같은 건물 1인가구 이웃끼리 반찬을 나누는 커뮤니티. 음식물 쓰레기도 줄이고 외로움도 해소.', '', 2);

  add(haeun, 'link', '대학생 소비 패턴 리포트', '20대 가계부 앱 사용률, 구독 서비스 지출 증가. 용돈 관리가 어렵다는 응답이 많음.', 'https://example.com/spending', 40);
  add(haeun, 'memo', '저축을 게임처럼', '친구랑 저축 챌린지, 퀘스트 달성하면 배지 지급.', '', 12);
  const moneyIdea = add(haeun, 'idea', '대학생 식비 절약 챌린지 앱', '식비 예산을 정하고 친구들과 절약 챌린지. 배달 대신 요리하면 포인트.', '', 5);

  add(doyun, 'link', 'AI 튜터 서비스 동향', '인공지능 기반 맞춤형 학습, 챗봇 튜터. 대학 강의 보조 사례.', 'https://example.com/ai-tutor', 120);
  add(doyun, 'memo', '시험기간 스터디 매칭', '과목별로 같이 공부할 사람 추천 알고리즘.', '', 110);

  addAi(jimin, 'ChatGPT', '다회용기 회수율 사례 조사', '국내외 다회용기 순환 서비스의 회수율 통계와 사례를 알려줘', '서울시 다회용기 시범사업은 회수율 90% 이상을 보고했습니다. 해외에서는 대학 캠퍼스 반납함 사례가 많습니다.', 9, 'prof');
  addAi(haeun, 'Claude', '발표 대본 초안', '식비 절약 챌린지 앱 발표 대본 초안을 3분 분량으로 작성해줘', '안녕하세요, 저희는 대학생의 식비 고민에서 출발했습니다. … 최종 아이디어는 챌린지 앱으로 가자는 의견이 많았습니다.', 7, 'team');
  addAi(seojun, 'ChatGPT', '설문 문항 번역', '자취생 설문 문항을 영어로 번역해줘', 'How often do you order delivery food per week? …', 15, 'me');

  ws.decisions.push({
    id: uid(), text: '회의에서는 득표가 가장 많은 「자취생 반찬 나눔 플랫폼」을 1순위로 검토한다', sourceIds: [foodIdea.id],
    origin: 'vote', candidateKey: null, createdAt: now - 1 * h, createdBy: seojun,
  });
  ws.quests.push(
    { id: uid(), week: weekStart(now), title: '팀원마다 자료 2개 이상 모으기', target: 'link', count: 8, done: false },
    { id: uid(), week: weekStart(now), title: '이번 주 결정 2개 확정하기', target: 'decision', count: 2, done: false },
    { id: uid(), week: weekStart(now), title: '인터뷰 일정 잡기', target: 'manual', count: 1, done: false },
  );

  ws.members[0].pinnedIdeaId = ecoIdea.id;
  placeOnTable(ecoIdea, 10, 18);
  placeOnTable(foodIdea, 58, 14);
  placeOnTable(moneyIdea, 36, 60);
  ecoIdea.votes = [jimin, seojun];
  foodIdea.votes = [seojun, haeun, jimin];
  moneyIdea.votes = [haeun];
  saveState();
  return ws;
}
