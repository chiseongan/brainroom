// 샘플 체험 전용: GitHub·Figma·Notion API 응답 형식 그대로 만든 가상 데이터.
// 실제 가져오기 코드(syncGithub 등)가 이 응답을 읽으므로, 키워드 추출·물건 배치까지 진짜 연동과 같은 경로로 돈다.
// 샘플 체험 중에는 네트워크로 나가지 않는다 (apiGet → sampleFetch). 사람·저장소·파일은 모두 지어낸 것이다.

const SAMPLE_REPO = 'capstone3/leftover-share';
const SAMPLE_FIGMA_KEY = 'SAMPLEfigmaFile00001';
const SAMPLE_NOTION_PLAN = '11111111-1111-4111-8111-111111111111';
const SAMPLE_NOTION_SURVEY = '22222222-2222-4222-8222-222222222222';
const AI_TRAILER_LINE = '\n\nCo-Authored-By: Claude <noreply@anthropic.com>';

// 팀원 순서(지민·서준·하은·도윤)대로. 도윤은 일부러 GitHub만 연결해 '연동 안 됨' 표시를 보여 준다
const SAMPLE_PEOPLE = [
  { github: 'jimin-sample', figma: 'fg-jimin', notion: null },
  { github: 'seojun-sample', figma: null, notion: 'nt-seojun' },
  { github: 'haeun-sample', figma: 'fg-haeun', notion: 'nt-haeun' },
  { github: 'doyun-sample', figma: null, notion: null },
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

function sampleNotionResponse(path, query) {
  const page = (id, title, editor, days) => ({
    id, url: '', last_edited_time: sampleAgo(days), last_edited_by: { id: editor },
    properties: { 제목: { type: 'title', title: [{ plain_text: title }] } },
  });
  if (path.endsWith(SAMPLE_NOTION_PLAN)) return page(SAMPLE_NOTION_PLAN, '발표 일정과 예산 정리', 'nt-seojun', 1);
  if (path.endsWith(SAMPLE_NOTION_SURVEY)) return page(SAMPLE_NOTION_SURVEY, '자취생 인터뷰 설문 보고서', 'nt-haeun', 2);
  if (path.endsWith('/comments')) {
    const say = (id, who, text, days) => ({ id, created_by: { id: who }, created_time: sampleAgo(days), rich_text: [{ plain_text: text }] });
    return { results: query.get('block_id') === SAMPLE_NOTION_PLAN
      ? [say('n1', 'nt-seojun', '공모전 마감 일정을 다시 확인해요', 1)]
      : [say('n2', 'nt-haeun', '설문 결과 통계를 표로 정리했어요', 2)] };
  }
  return null;
}

// fetch 대신 쓰인다. 진짜 Response처럼 ok·status·json()만 갖춘다
async function sampleFetch(url) {
  const u = new URL(url);
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  if (u.hostname === 'api.github.com') {
    if (u.pathname.endsWith('/commits')) return ok(sampleCommits(u.searchParams.get('author')));
    if (u.pathname.endsWith('/pulls')) return ok(samplePulls());
  }
  if (u.hostname === 'api.figma.com') return ok(sampleFigmaResponse(u.pathname));
  if (u.hostname === 'api.notion.com') {
    const body = sampleNotionResponse(u.pathname, u.searchParams);
    if (body) return ok(body);
  }
  return { ok: false, status: 404, json: async () => ({ message: '샘플에 없는 주소예요' }) };
}

// 팀원마다 차례로 '본인 작업만' 가져온다 (실제와 같은 함수). 샘플 작업에는 눌러도 갈 곳이 없으므로 링크를 비운다.
async function loadSampleApi(manual = false) {
  if (!guestMode || !state) return;
  if (!sampleNow) sampleNow = Date.now();
  sampleRound++;
  state.links = { github: SAMPLE_REPO, figma: [SAMPLE_FIGMA_KEY], notion: [SAMPLE_NOTION_PLAN, SAMPLE_NOTION_SURVEY] };
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
    }
  } finally {
    state.meId = me;
  }
  state.items.forEach(i => { if (i.type === 'work') i.url = ''; });
  saveState();
  render();
  toast(manual
    ? `🔌 샘플 API에서 새 작업 ${added}개를 가져왔어요 (가상 데이터)`
    : `🔌 샘플 API에서 GitHub·Figma·Notion 작업 ${added}개를 가져와 방에 놓았어요 (가상 데이터)`);
  return added;
}
