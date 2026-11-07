// 샘플 체험 전용: GitHub·Figma·Notion API 응답 형식 그대로 만든 가상 데이터.
// 실제 가져오기 코드(syncGithub 등)가 이 응답을 읽으므로, 키워드 추출·물건 배치까지 진짜 연동과 같은 경로로 돈다.
// 샘플 체험 중에는 네트워크로 나가지 않는다 (apiGet → sampleFetch). 사람·저장소·파일은 모두 지어낸 것이다.

const SAMPLE_REPO = 'capstone3/leftover-share';
const SAMPLE_FIGMA_KEY = 'SAMPLEfigmaFile00001';
const SAMPLE_NOTION_PLAN = '11111111-1111-4111-8111-111111111111';
const SAMPLE_NOTION_SURVEY = '22222222-2222-4222-8222-222222222222';
const SAMPLE_GDOC = '1SAMPLEgdoc0000000000000000000000000script';
const AI_TRAILER_LINE = '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';

// 팀원 순서(지민·서준·하은·도윤)대로. 도윤은 일부러 GitHub만 연결해 '연동 안 됨' 표시를 보여 준다
const SAMPLE_PEOPLE = [
  { github: 'jimin-sample', figma: 'fg-jimin', notion: null, gdocs: 'jimin@sample.ac.kr' },
  { github: 'seojun-sample', figma: null, notion: 'nt-seojun', gdocs: 'seojun@sample.ac.kr' },
  { github: 'haeun-sample', figma: 'fg-haeun', notion: 'nt-haeun', gdocs: null },
  { github: 'doyun-sample', figma: null, notion: null, gdocs: null },
];

let sampleNow = 0;   // 가져올 때마다 시각이 달라져 '바뀐 작업'으로 세지 않도록 처음 한 번만 정한다
let sampleRound = 0; // '지금 가져오기'를 다시 누르면 새 커밋이 하나 생긴 것처럼 보여 준다

const sampleAgo = days => new Date(sampleNow - days * 864e5).toISOString();

function sampleCommits(login) {
  const c = (sha, message, days) => ({ sha: sha.padEnd(40, '0'), html_url: '', commit: { message, author: { date: sampleAgo(days) } } });
  const list = {
    'jimin-sample': [
      c('a1', 'feat: 다회용기 반납 QR 스캔 화면', 1),
      c('a2', `fix(auth): 로그인 오류 수정${AI_TRAILER_LINE}`, 3),
      c('a3', 'feat: 탄소 절감량 통계 그래프', 9),
    ],
    'seojun-sample': [
      c('b1', '반찬 나눔 게시판 API 구현', 2),
      c('b2', `test: 결제 모듈 테스트 추가${AI_TRAILER_LINE}`, 4),
      c('b3', 'feat: 배달 음식 포장재 분리수거 안내', 11),
    ],
    'haeun-sample': [
      c('c1', 'style: 로고 색상과 브랜드 가이드 적용', 2),
      c('c2', 'docs: 발표 슬라이드 링크 정리', 6),
    ],
    'doyun-sample': [
      c('d1', `feat: 인공지능 스터디 매칭 추천${AI_TRAILER_LINE}`, 5),
      c('d2', 'feat: 게임처럼 포인트 보상 지급', 8),
    ],
  }[login] || [];
  if (sampleRound > 1 && login === SAMPLE_PEOPLE[0].github) list.unshift(c(`e${sampleRound}`, `feat: 새 알림 푸시 기능 ${sampleRound - 1}차`, 0));
  return list;
}

function samplePulls() {
  const p = (number, title, login, days, state) => ({ number, title, body: '', user: { login }, created_at: sampleAgo(days), html_url: '', state, merged_at: state === 'closed' ? sampleAgo(days - 1) : null });
  return [
    p(12, '동네 지도에서 반찬 나눔 찾기', 'seojun-sample', 1, 'open'),
    p(9, '다회용기 반납 포인트 적립', 'jimin-sample', 6, 'closed'),
  ];
}

// 이슈 목록에는 PR도 섞여 온다 (실제 GitHub과 같게). 가져오기 코드가 PR을 걸러내는지도 이 데이터로 본다
function sampleIssues(creator) {
  const i = (number, title, body, login, days, state, comments = 0, pr = false) => ({
    number, title, body, user: { login }, created_at: sampleAgo(days), html_url: '', state, comments, ...(pr ? { pull_request: { url: 'x' } } : {}),
  });
  return [
    i(21, '다회용기 반납함 위치 데이터 수집', '지도에 표시할 반납함 좌표가 필요해요. 공공데이터 포털을 알아보는 중', 'jimin-sample', 4, 'open', 2),
    i(18, '결제 모듈 테스트가 간헐적으로 실패함', '포인트 할인 적용 시 금액 계산이 어긋나요', 'seojun-sample', 7, 'closed', 1),
    i(15, '브랜드 색상 가이드 문서화', '', 'haeun-sample', 10, 'closed'),
    i(12, '동네 지도에서 반찬 나눔 찾기', '', 'seojun-sample', 1, 'open', 0, true),
  ].filter(x => x.user.login === creator);
}

function sampleIssueComments() {
  const c = (id, body, login, days, issue) => ({ id, body, user: { login }, created_at: sampleAgo(days), html_url: '', issue_url: `https://api.github.com/repos/${SAMPLE_REPO}/issues/${issue}` });
  return [
    c(101, '반납함 좌표는 공공데이터 포털 API로 받기로 해요', 'jimin-sample', 3, 21),
    c(102, '제가 포털 신청서 써 둘게요', 'doyun-sample', 3, 21),
    c(103, '포인트 할인은 서버에서 다시 계산하도록 고쳤어요', 'seojun-sample', 6, 18),
    c(104, '테스트 통과 확인했어요 👍', 'jimin-sample', 5, 18),
  ];
}

const SAMPLE_FIGMA_DOC = { type: 'DOCUMENT', children: [{ type: 'CANVAS', name: '모바일 앱', children: [
  { type: 'FRAME', id: '1:1', name: '로그인 화면', children: [{ type: 'TEXT', characters: '학교 계정으로 시작하기' }, { type: 'RECTANGLE', name: 'Rectangle 1' }] },
  { type: 'FRAME', id: '1:2', name: '다회용기 반납', children: [{ type: 'TEXT', characters: '반납함 지도에서 가까운 위치 찾기' }] },
  { type: 'FRAME', id: '1:3', name: '결제', children: [{ type: 'TEXT', characters: '포인트 할인 적용' }] },
  { type: 'COMPONENT', name: 'Button / Primary' },
] }] };

function sampleFigmaResponse(path) {
  if (path.endsWith('/versions')) {
    return { versions: [
      { id: 'v1', created_at: sampleAgo(1), label: '로그인 화면 UI', user: { id: 'fg-haeun' } },
      { id: 'v2', created_at: sampleAgo(1), label: '결제 화면', user: { id: 'fg-haeun' } },
      { id: 'v3', created_at: sampleAgo(5), label: '브랜드 로고 시안', user: { id: 'fg-haeun' } },
      { id: 'v4', created_at: sampleAgo(3), label: '다회용기 반납 지도', user: { id: 'fg-jimin' } },
    ] };
  }
  if (path.endsWith('/comments')) {
    return { comments: [
      { id: 'k1', message: '결제 버튼 색을 브랜드 색으로 맞춰요', created_at: sampleAgo(1), user: { id: 'fg-haeun' } },
      { id: 'k2', message: '반납함 위치가 지도에서 잘 보이게 해 주세요', created_at: sampleAgo(2), user: { id: 'fg-jimin' } },
    ] };
  }
  return { name: '반찬 나눔 앱', version: 'sample-1', document: SAMPLE_FIGMA_DOC };
}

const SAMPLE_NOTION_CHILD = '33333333-3333-4333-8333-333333333333'; // 설문 보고서 아래 하위 페이지 (검색으로만 찾아진다)

function sampleNotionResponse(path, query, method) {
  const page = (id, title, editor, days, parent) => ({
    id, url: '', last_edited_time: sampleAgo(days), last_edited_by: { id: editor }, parent,
    properties: { 제목: { type: 'title', title: [{ plain_text: title }] } },
  });
  const plan = page(SAMPLE_NOTION_PLAN, '발표 일정과 예산 정리', 'nt-seojun', 1, { type: 'workspace', workspace: true });
  const survey = page(SAMPLE_NOTION_SURVEY, '자취생 인터뷰 설문 보고서', 'nt-haeun', 2, { type: 'workspace', workspace: true });
  const child = page(SAMPLE_NOTION_CHILD, '인터뷰 질문지 초안', 'nt-haeun', 3, { type: 'page_id', page_id: SAMPLE_NOTION_SURVEY });
  if (path === '/v1/search' && method === 'POST') return { results: [plan, survey, child], has_more: false };
  if (path.endsWith('/children')) {
    const text = path.includes(SAMPLE_NOTION_CHILD.replace(/-/g, '')) || path.includes(SAMPLE_NOTION_CHILD) ? '자취 기간, 배달 음식 빈도, 다회용기 사용 의향을 묻는다'
      : path.includes(SAMPLE_NOTION_SURVEY) ? '자취생 12명 인터뷰 설문 응답을 표로 정리' : '발표는 다음 주 금요일, 인쇄비 예산 2만 원';
    return { results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } }] };
  }
  if (path.endsWith(SAMPLE_NOTION_PLAN)) return plan;
  if (path.endsWith(SAMPLE_NOTION_SURVEY)) return survey;
  if (path.endsWith(SAMPLE_NOTION_CHILD)) return child;
  if (path.endsWith('/comments')) {
    const say = (id, who, text, days) => ({ id, created_by: { id: who }, created_time: sampleAgo(days), rich_text: [{ plain_text: text }] });
    const id = query.get('block_id');
    return { results: id === SAMPLE_NOTION_PLAN ? [say('n1', 'nt-seojun', '공모전 마감 일정을 다시 확인해요', 1)]
      : id === SAMPLE_NOTION_SURVEY ? [say('n2', 'nt-haeun', '설문 결과 통계를 표로 정리했어요', 2)] : [] };
  }
  return null;
}

// Google Drive: 발표 대본 문서의 수정 기록과 댓글 (lastModifyingUser.emailAddress로 '나'를 가린다)
function sampleDriveResponse(path) {
  if (path.endsWith('/revisions')) {
    const r = (id, email, days) => ({ id, modifiedTime: sampleAgo(days), lastModifyingUser: { displayName: email.split('@')[0], emailAddress: email, me: false } });
    return { revisions: [r('r1', 'seojun@sample.ac.kr', 2), r('r2', 'seojun@sample.ac.kr', 2), r('r3', 'jimin@sample.ac.kr', 1), r('r4', 'seojun@sample.ac.kr', 6)] };
  }
  if (path.endsWith('/comments')) return { comments: [{ id: 'c1', createdTime: sampleAgo(1), content: '예산 슬라이드는 표로 바꿔요', author: { displayName: 'jimin', emailAddress: 'jimin@sample.ac.kr', me: false } }] };
  if (path.endsWith('/export')) return '다회용기 순환 서비스 발표 대본\n문제: 배달 포장재 쓰레기\n해결: 반납함과 포인트 보상';
  return { id: SAMPLE_GDOC, name: '발표 대본', mimeType: 'application/vnd.google-apps.document', modifiedTime: sampleAgo(1), webViewLink: '' };
}

// fetch 대신 쓰인다. 진짜 Response처럼 ok·status·json()만 갖춘다
async function sampleFetch(url, init = {}) {
  const u = new URL(url);
  const ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => String(body) });
  if (u.hostname === 'www.googleapis.com') return ok(sampleDriveResponse(u.pathname));
  if (u.hostname === 'api.github.com') {
    if (u.pathname.endsWith('/commits')) return ok(sampleCommits(u.searchParams.get('author')));
    if (u.pathname.endsWith('/pulls')) return ok(samplePulls());
    if (u.pathname.endsWith('/issues/comments')) return ok(sampleIssueComments());
    if (u.pathname.endsWith('/issues')) return ok(sampleIssues(u.searchParams.get('creator')));
  }
  if (u.hostname === 'api.figma.com') return ok(sampleFigmaResponse(u.pathname));
  if (u.hostname === 'api.notion.com') {
    const body = sampleNotionResponse(u.pathname, u.searchParams, init.method || 'GET');
    if (body) return ok(body);
  }
  return { ok: false, status: 404, json: async () => ({ message: '샘플에 없는 주소예요' }) };
}

// 팀원마다 차례로 '본인 작업만' 가져온다 (실제와 같은 함수). 샘플 작업에는 눌러도 갈 곳이 없으므로 링크를 비운다.
async function loadSampleApi(manual = false) {
  if (!guestMode || !state) return;
  if (!sampleNow) sampleNow = Date.now();
  sampleRound++;
  state.links = { github: SAMPLE_REPO, figma: [SAMPLE_FIGMA_KEY], notion: [SAMPLE_NOTION_PLAN, SAMPLE_NOTION_SURVEY], gdocs: [SAMPLE_GDOC] };
  const me = state.meId;
  const since = sampleNow - SYNC_DAYS * 864e5;
  let added = 0;
  try {
    for (const [i, m] of state.members.entries()) {
      const who = SAMPLE_PEOPLE[i];
      if (!who) continue;
      state.meId = m.id;
      added += await syncGithub({ login: who.github, token: '' }, SAMPLE_REPO, since);
      setMyConnection('github', 'ok');
      if (who.figma) {
        added += await syncFigma({ token: 'sample', userId: who.figma }, [SAMPLE_FIGMA_KEY], since);
        setMyConnection('figma', 'ok');
      }
      if (who.notion) {
        added += await syncNotion({ token: 'sample', userId: who.notion }, [SAMPLE_NOTION_PLAN, SAMPLE_NOTION_SURVEY], since);
        setMyConnection('notion', 'ok');
      }
      if (who.gdocs) {
        added += await syncGdocs({ token: 'sample', email: who.gdocs }, [SAMPLE_GDOC], since);
        setMyConnection('gdocs', 'ok');
      }
    }
  } finally {
    state.meId = me;
  }
  state.items.forEach(i => { if (i.type === 'work') i.url = ''; });
  saveState();
  render();
  toast(manual
    ? `🔌 샘플 API에서 새 작업 ${added}개를 가져왔어요 (가상 데이터)`
    : `🔌 샘플 API에서 GitHub·Figma·Notion·Google 문서 작업 ${added}개를 가져와 방에 놓았어요 (가상 데이터)`);
  return added;
}
