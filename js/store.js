// 워크스페이스 상태 + localStorage 저장. (백엔드 붙이기 전까지는 JSON 내보내기/불러오기로 팀원과 공유)

const STORAGE_KEY = 'brainroom:v1';
const MEMBER_COLORS = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#0ea5e9', '#eab308', '#8b5cf6', '#14b8a6'];
const TYPE_META = {
  link: { icon: '📚', label: '자료·링크', place: '책장' },
  memo: { icon: '🗒️', label: '메모', place: '포스트잇 보드' },
  idea: { icon: '💡', label: '아이디어', place: '화이트보드' },
};

let state = null;

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 저장소 접근 불가 → 새로 시작 */ }
  return null;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}

function newMember(name, index) {
  return { id: uid(), name, color: MEMBER_COLORS[index % MEMBER_COLORS.length], pinnedIdeaId: null };
}

function newWorkspace(teamName, names) {
  const members = names.map(newMember);
  return { version: 1, teamName, members, items: [], meId: members[0]?.id ?? null, view: 'meeting', roomId: null };
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

function itemsOf(memberId) {
  return state.items.filter(i => i.memberId === memberId);
}

function analyze(item) {
  const text = `${item.title} ${item.title} ${item.content}`; // 제목 가중치 2배
  item.keywords = extractKeywords(text);
  item.themes = detectThemes(text).map(t => t.id);
  return item;
}

function addItem({ memberId, type, title, content = '', url = '', createdAt = Date.now() }) {
  const item = analyze({ id: uid(), memberId, type, title, content, url, createdAt, table: null, votes: [] });
  state.items.push(item);
  saveState();
  return item;
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  state.members.forEach(m => { if (m.pinnedIdeaId === id) m.pinnedIdeaId = null; });
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
    pinned: itemById(m?.pinnedIdeaId) || ideas[0] || null,
    last: items[0]?.createdAt ?? 0,
    level: 1 + Math.floor(items.length / 3),
  };
}

function tableItems() {
  return state.items.filter(i => i.table);
}

function placeOnTable(item, x, y) {
  if (x === undefined) {
    const n = tableItems().length;
    x = 8 + ((n * 23) % 64);
    y = 10 + ((Math.floor(n / 3) * 27) % 60);
  }
  item.table = { x: clamp(x, 0, 82), y: clamp(y, 0, 80) };
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
  const ws = newWorkspace('캡스톤 3조', ['지민', '서준', '하은', '도윤']);
  state = ws;
  const [jimin, seojun, haeun, doyun] = ws.members.map(m => m.id);
  const h = 3600 * 1000;
  const now = Date.now();
  const add = (memberId, type, title, content, url, ago) =>
    addItem({ memberId, type, title, content, url, createdAt: now - ago * h });

  add(jimin, 'link', '배달 포장재 쓰레기 통계', '배달 음식 포장재가 생활 플라스틱 쓰레기의 큰 비중을 차지한다는 기사. 재활용률은 생각보다 낮음.', 'https://example.com/packaging-waste', 30);
  add(jimin, 'link', '제로웨이스트 가게 사례 모음', '리필 스테이션, 다회용기 대여 서비스 사례. 대학가 카페와 협업한 사례도 있음.', 'https://example.com/zero-waste', 20);
  add(jimin, 'link', '탄소 발자국 계산 방식', '일상 소비가 만드는 탄소 배출량을 계산하는 방법 정리.', 'https://example.com/carbon', 18);
  add(jimin, 'memo', '다회용기 반납을 게임처럼?', '반납할 때마다 포인트, 레벨업 하면 카페 할인. 게이미피케이션 적용해보기.', '', 6);
  const ecoIdea = add(jimin, 'idea', '캠퍼스 다회용기 순환 서비스', '학교 식당·카페 배달에 다회용기를 쓰고 캠퍼스 반납함에서 회수. 플라스틱 쓰레기 절감.', '', 3);

  add(seojun, 'link', '1인가구 식비 지출 조사', '대학생 자취생의 배달 음식 의존도가 높고 식비가 소비의 큰 부분. 음식물 쓰레기 처리도 고민.', 'https://example.com/single-household', 26);
  add(seojun, 'link', '밀키트 구독 서비스 비교', '1인분 밀키트 구독 가격과 구성 비교. 자취생에게는 아직 비쌈.', 'https://example.com/mealkit', 22);
  add(seojun, 'memo', '자취생 공동구매', '재료를 조금만 사고 싶은데 대용량만 있음 → 원룸 이웃끼리 공동구매 모임?', '', 10);
  add(seojun, 'memo', '혼밥 외로움', '자취하면서 혼자 밥 먹는 게 제일 외롭다는 인터뷰가 많았음.', '', 8);
  const foodIdea = add(seojun, 'idea', '자취생 반찬 나눔 플랫폼', '같은 건물 1인가구 이웃끼리 반찬을 나누는 커뮤니티. 음식물 쓰레기도 줄이고 외로움도 해소.', '', 2);

  add(haeun, 'link', '대학생 소비 패턴 리포트', '20대 가계부 앱 사용률, 구독 서비스 지출 증가. 용돈 관리가 어렵다는 응답이 많음.', 'https://example.com/spending', 40);
  add(haeun, 'memo', '저축을 게임처럼', '친구랑 저축 챌린지, 퀘스트 달성하면 배지 지급.', '', 12);
  const moneyIdea = add(haeun, 'idea', '대학생 식비 절약 챌린지 앱', '식비 예산을 정하고 친구들과 절약 챌린지. 배달 대신 요리하면 포인트.', '', 5);

  add(doyun, 'link', 'AI 튜터 서비스 동향', '인공지능 기반 맞춤형 학습, 챗봇 튜터. 대학 강의 보조 사례.', 'https://example.com/ai-tutor', 120);
  add(doyun, 'memo', '시험기간 스터디 매칭', '과목별로 같이 공부할 사람 추천 알고리즘.', '', 110);

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
