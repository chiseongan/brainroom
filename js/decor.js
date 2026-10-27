// 회의 키워드 → 방에 어울리는 사물 (2.5D). 예: 재활용 → 분리수거함, 교육 → 책상 위 교과서, 일정 → 벽 달력.
// place: desk = 책상 위, floor = 바닥(벽 쪽 빈자리), wall = 벽 (back = 뒷벽 창문과 화이트보드 사이, left = 왼쪽 벽 코르크판 옆)
// 좌표 x, y는 사물의 가운데. 키워드에 words 중 하나가 들어 있으면(또는 반대로) 그 사물이 된다. 한 글자 단어는 정확히 같을 때만.

const DESK_Z = 30; // 책상 윗면 높이

// 가운데 기준 상자
function cbox(x, y, z, w, d, h, color, opts) {
  return box(x - w / 2, y - d / 2, z, w, d, h, color, opts);
}

function isoLine(a, b, color, width = 2) {
  const [x1, y1] = iso(...a), [x2, y2] = iso(...b);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function isoDot(x, y, z, rx, ry, fill, extra = '') {
  const [cx, cy] = iso(x, y, z);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
}

// 앞을 보는 판 (y가 일정한 면)
function frontPanel(x0, x1, y, z0, z1, fill, extra = OUTLINE) {
  return poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, extra);
}

const DECOR = [
  // ---------- 바닥 ----------
  {
    id: 'recycle', name: '분리수거함', place: 'floor',
    words: ['재활용', '다회용', '순환', '분리수거', '쓰레기', '플라스틱', '포장재', '업사이클', '제로웨이스트', 'recycle', 'recycling'],
    draw: (x, y) => [
      cbox(x - 0.23, y, 0, 0.4, 0.4, 24, '#2f9e5f'), cbox(x - 0.23, y, 11, 0.41, 0.41, 3, '#f8fafc'), cbox(x - 0.23, y, 24, 0.44, 0.44, 3, '#1f7a45'),
      cbox(x + 0.23, y, 0, 0.4, 0.4, 24, '#2f6fd1'), cbox(x + 0.23, y, 11, 0.41, 0.41, 3, '#f8fafc'), cbox(x + 0.23, y, 24, 0.44, 0.44, 3, '#2357a8'),
    ].join(''),
  },
  {
    id: 'podium', name: '발표 연단', place: 'floor',
    words: ['발표', '인터뷰', '스피치', '피피티', 'ppt', '슬라이드', '면담', 'presentation', 'slides', 'demo', 'pitch'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.42, 0.32, 30, '#8b5e3c'),
      poly([[x - 0.24, y - 0.18, 30], [x + 0.24, y - 0.18, 30], [x + 0.24, y + 0.18, 26], [x - 0.24, y + 0.18, 26]], '#a0703f', OUTLINE),
      cbox(x, y - 0.1, 30, 0.03, 0.03, 12, '#334155'), cbox(x, y - 0.1, 42, 0.07, 0.07, 5, '#111827', { top: '#94a3b8' }),
    ].join(''),
  },
  {
    id: 'plant', name: '화분', place: 'floor',
    words: ['환경', '친환경', '탄소', '기후', '식물', '나무', '숲', '텃밭', '농업', '스마트팜', '꽃', '자연'],
    draw: (x, y) => palm(x, y, 0.7),
  },
  {
    id: 'lamp', name: '스탠드 조명', place: 'floor',
    words: ['아이디어', '브레인스토밍', '기획', '컨셉', '영감', '발상'],
    draw: (x, y) => floorLamp(x, y, true),
  },
  {
    id: 'gym', name: '운동 매트와 아령', place: 'floor',
    words: ['운동', '건강', '헬스', '러닝', '다이어트', '스포츠', '축구', '야구', '농구'],
    draw: (x, y) => [
      flat(x - 0.38, y - 0.22, 0.76, 0.44, '#a78bfa', 'stroke="#7c3aed" stroke-opacity=".5"'),
      cbox(x - 0.12, y + 0.02, 0.5, 0.22, 0.05, 3, '#64748b'), cbox(x - 0.25, y + 0.02, 0.5, 0.06, 0.13, 7, '#1e293b'), cbox(x + 0.01, y + 0.02, 0.5, 0.06, 0.13, 7, '#1e293b'),
      cbox(x + 0.18, y - 0.06, 0.5, 0.05, 0.22, 3, '#64748b'), cbox(x + 0.18, y - 0.19, 0.5, 0.13, 0.06, 7, '#1e293b'), cbox(x + 0.18, y + 0.07, 0.5, 0.13, 0.06, 7, '#1e293b'),
    ].join(''),
  },
  {
    id: 'pet', name: '반려동물 방석', place: 'floor',
    words: ['반려', '강아지', '고양이', '펫', '유기견', '동물'],
    draw: (x, y) => [
      cbox(x - 0.06, y, 0, 0.58, 0.48, 6, '#fb7185'), cbox(x - 0.06, y, 6, 0.42, 0.32, 1, '#fecdd3'),
      cbox(x + 0.33, y + 0.12, 0, 0.16, 0.16, 4, '#60a5fa', { top: '#bfdbfe' }),
    ].join(''),
  },
  {
    id: 'bags', name: '쇼핑백', place: 'floor',
    words: ['쇼핑', '구매', '구독', '마켓', '판매', '커머스', '이커머스', '공동구매', '스토어'],
    draw: (x, y) => [
      cbox(x - 0.12, y - 0.04, 0, 0.28, 0.14, 20, '#f97316'), isoLine([x - 0.2, y - 0.04, 20], [x - 0.12, y - 0.04, 25], '#7c2d12', 1.5), isoLine([x - 0.04, y - 0.04, 20], [x - 0.12, y - 0.04, 25], '#7c2d12', 1.5),
      cbox(x + 0.16, y + 0.08, 0, 0.24, 0.14, 15, '#14b8a6'), isoLine([x + 0.09, y + 0.08, 15], [x + 0.16, y + 0.08, 20], '#134e4a', 1.5), isoLine([x + 0.23, y + 0.08, 15], [x + 0.16, y + 0.08, 20], '#134e4a', 1.5),
    ].join(''),
  },
  {
    id: 'speaker', name: '스피커', place: 'floor',
    words: ['음악', '노래', '공연', '밴드', '사운드', '음향'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.32, 0.3, 34, '#111827', { top: '#374151' }),
      isoDot(x - 0.02, y + 0.15, 24, 5, 6, '#4b5563', OUTLINE), isoDot(x - 0.02, y + 0.15, 10, 7, 8, '#4b5563', OUTLINE),
    ].join(''),
  },
  {
    id: 'camera', name: '삼각대 카메라', place: 'floor',
    words: ['사진', '영상', '유튜브', '영화', '콘텐츠', '쇼츠', '촬영', '크리에이터', '미디어'],
    draw: (x, y) => [
      isoLine([x, y, 26], [x - 0.22, y + 0.16, 0], '#334155'), isoLine([x, y, 26], [x + 0.22, y + 0.12, 0], '#334155'), isoLine([x, y, 26], [x - 0.02, y - 0.24, 0], '#334155'),
      cbox(x, y, 26, 0.24, 0.14, 12, '#1f2937', { top: '#374151' }), cbox(x + 0.16, y, 29, 0.08, 0.08, 6, '#475569'),
    ].join(''),
  },
  {
    id: 'chart', name: '차트 이젤', place: 'floor',
    words: ['데이터', '통계', '분석', '그래프', '시장', '경쟁', '마케팅', '매출', '수익', '지표', '성장', 'data', 'analytics', 'chart', 'graph', 'dashboard', 'stats', 'metrics'],
    draw: (x, y) => easel(x, y, [
      frontPanel(x - 0.2, x - 0.11, y + 0.01, 24, 32, '#3b82f6', ''), frontPanel(x - 0.05, x + 0.04, y + 0.01, 24, 39, '#22c55e', ''), frontPanel(x + 0.1, x + 0.19, y + 0.01, 24, 47, '#f59e0b', ''),
    ]),
  },
  {
    id: 'art', name: '그림 이젤', place: 'floor',
    words: ['디자인', '그림', '일러스트', '예술', '로고', '브랜드', '브랜딩', '색', 'ui', 'ux', '전시', 'design', 'ui', 'ux', 'figma', 'style', 'css', 'logo', 'icon', 'mockup', 'wireframe'],
    draw: (x, y) => easel(x, y, [
      frontPanel(x - 0.22, x + 0.22, y + 0.01, 24, 50, '#fef3c7', ''),
      isoDot(x - 0.08, y + 0.02, 40, 6, 4, '#f472b6'), isoDot(x + 0.08, y + 0.02, 33, 7, 5, '#60a5fa'), isoDot(x + 0.02, y + 0.02, 44, 4, 3, '#facc15'),
    ]),
  },
  {
    id: 'ballot', name: '투표함', place: 'floor',
    words: ['결정', '투표', '확정', '합의', '선택', '채택', 'vote', 'decision'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.4, 0.4, 24, '#f8fafc', { top: '#e2e8f0' }), cbox(x, y, 9, 0.41, 0.41, 4, '#2563eb'), cbox(x, y, 24, 0.22, 0.04, 1, '#334155'),
    ].join(''),
  },
  {
    id: 'beanbag', name: '빈백 의자', place: 'floor',
    words: ['팀', '팀원', '협업', '같이', '사람', '고객', '사용자', '유저', '이용자', '친구', '이웃', '커뮤니티', '모임', '동아리', '소통', 'team', 'user', 'users', 'community', 'member', 'members'],
    draw: (x, y) => [
      cbox(x, y + 0.04, 0, 0.56, 0.5, 10, '#f59e0b', { top: '#fbbf24' }), cbox(x, y - 0.18, 10, 0.56, 0.16, 12, '#d97706', { top: '#f59e0b' }),
    ].join(''),
  },
  {
    id: 'sofa', name: '소파', place: 'floor',
    words: ['집', '자취', '원룸', '기숙사', '주거', '1인가구', '룸메이트', '인테리어', '월세'],
    draw: (x, y) => [
      cbox(x, y + 0.03, 0, 0.7, 0.4, 12, '#0ea5e9', { top: '#38bdf8' }), cbox(x, y - 0.14, 12, 0.7, 0.1, 12, '#0284c7'),
      cbox(x - 0.32, y + 0.03, 12, 0.07, 0.4, 6, '#0284c7'), cbox(x + 0.32, y + 0.03, 12, 0.07, 0.4, 6, '#0284c7'),
    ].join(''),
  },
  {
    id: 'safe', name: '금고', place: 'floor',
    words: ['보안', '개인정보', '로그인', '계정', '비밀번호', '암호화', '권한', '안전', 'login', 'auth', 'security', 'password', 'rules', 'permission', 'oauth'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.42, 0.4, 30, '#64748b', { top: '#94a3b8' }),
      poly([[x + 0.21, y - 0.08, 12], [x + 0.21, y + 0.08, 12], [x + 0.21, y + 0.08, 22], [x + 0.21, y - 0.08, 22]], '#cbd5e1', OUTLINE),
    ].join(''),
  },
  {
    id: 'donation', name: '기부함', place: 'floor',
    words: ['나눔', '기부', '봉사', '복지', '후원', '취약', '사회문제'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.34, 0.34, 20, '#fde68a', { top: '#fef3c7' }), cbox(x, y, 20, 0.12, 0.12, 2, '#ef4444'),
    ].join(''),
  },
  {
    id: 'toolbox', name: '공구함', place: 'floor',
    words: ['문제', '해결', '버그', '오류', '에러', '테스트', '리스크', '이슈', '수정', '개선', 'fix', 'bug', 'bugfix', 'hotfix', 'error', 'test', 'tests', 'issue', 'refactor'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.44, 0.26, 14, '#dc2626', { top: '#ef4444' }), cbox(x, y, 14, 0.22, 0.04, 4, '#1f2937'),
    ].join(''),
  },
  {
    id: 'bike', name: '자전거 거치대', place: 'floor',
    words: ['교통', '자전거', '킥보드', '모빌리티', '버스', '지하철', '자동차', '주차', '이동'],
    draw: (x, y) => [
      isoDot(x - 0.18, y, 9, 9, 9, 'none', 'stroke="#111827" stroke-width="2"'), isoDot(x + 0.18, y, 9, 9, 9, 'none', 'stroke="#111827" stroke-width="2"'),
      isoLine([x - 0.18, y, 9], [x, y, 14], '#ef4444', 2.5), isoLine([x, y, 14], [x + 0.18, y, 9], '#ef4444', 2.5), isoLine([x, y, 14], [x - 0.04, y, 22], '#ef4444', 2.5),
      isoLine([x + 0.06, y, 20], [x + 0.14, y, 24], '#111827', 2.5),
    ].join(''),
  },

  {
    id: 'rack', name: '옷걸이 행거', place: 'floor',
    words: ['패션', '의류', '옷', '코디', '중고거래', '신발', '스타일'],
    draw: (x, y) => [
      isoLine([x - 0.3, y, 0], [x - 0.3, y, 44], '#475569', 2.5), isoLine([x + 0.3, y, 0], [x + 0.3, y, 44], '#475569', 2.5),
      isoLine([x - 0.3, y, 44], [x + 0.3, y, 44], '#475569', 2.5),
      frontPanel(x - 0.24, x - 0.08, y + 0.01, 18, 42, '#f472b6'), frontPanel(x - 0.06, x + 0.1, y + 0.01, 22, 42, '#60a5fa'), frontPanel(x + 0.12, x + 0.26, y + 0.01, 16, 42, '#facc15'),
    ].join(''),
  },
  {
    id: 'briefcase', name: '서류가방', place: 'floor',
    words: ['취업', '채용', '커리어', '이력서', '면접', '인턴', '창업', '스타트업', '부업', '회사', '직무'],
    draw: (x, y) => [
      cbox(x, y, 0, 0.46, 0.16, 16, '#92400e', { top: '#b45309' }), cbox(x, y, 16, 0.18, 0.04, 4, '#78350f'), cbox(x, y, 7, 0.47, 0.17, 2, '#facc15'),
    ].join(''),
  },

  // ---------- 책상 위 ----------
  {
    id: 'books', name: '교과서', place: 'desk',
    words: ['교육', '공부', '수업', '강의', '학습', '시험', '과제', '책', '독서', '논문', '스터디', '학교', '캠퍼스', '대학', '수강', '교수', 'study', 'education', 'lecture', 'course'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.4, 0.28, 4, '#dc2626', { top: '#fca5a5' }), cbox(x + 0.02, y - 0.01, z + 4, 0.36, 0.26, 4, '#2563eb', { top: '#93c5fd' }),
      cbox(x - 0.02, y + 0.01, z + 8, 0.34, 0.24, 4, '#f59e0b', { top: '#fde68a' }),
    ].join(''),
  },
  {
    id: 'laptop', name: '노트북', place: 'desk',
    words: ['코드', '코딩', '개발', '프로그래밍', '구현', '깃허브', '서버', '배포', '클라우드', '웹', '사이트', '홈페이지', '프로토타입', 'code', 'api', 'server', 'deploy', 'backend', 'frontend', 'react', 'javascript', 'typescript', 'python', 'firebase', 'firestore', 'database', 'github'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.46, 0.32, 2, '#cbd5e1'),
      frontPanel(x - 0.23, x + 0.23, y - 0.16, z + 2, z + 18, '#1e293b'), frontPanel(x - 0.2, x + 0.2, y - 0.159, z + 4, z + 16, '#38bdf8', ''),
    ].join(''),
  },
  {
    id: 'phone', name: '휴대폰', place: 'desk',
    words: ['앱', '어플', '모바일', '휴대폰', '알림', '푸시', '채팅', '메시지', '카톡', 'sns', 'mobile', 'app', 'pwa', 'notification', 'push', 'chat'],
    draw: (x, y, z) => cbox(x, y, z, 0.13, 0.24, 2, '#0f172a', { top: '#38bdf8' }),
  },
  {
    id: 'robot', name: '로봇 피규어', place: 'desk',
    words: ['ai', '인공지능', '챗봇', 'gpt', 'llm', '클로드', '챗지피티', '머신러닝', '딥러닝', '자동화', 'ai', 'gpt', 'llm', 'claude', 'chatbot', 'openai', 'gemini'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.18, 0.14, 9, '#94a3b8'), cbox(x, y, z + 9, 0.16, 0.13, 8, '#cbd5e1'), cbox(x, y, z + 17, 0.02, 0.02, 5, '#ef4444'),
      isoDot(x - 0.03, y + 0.066, z + 13, 1.6, 1.6, '#0f172a'), isoDot(x + 0.03, y + 0.066, z + 13, 1.6, 1.6, '#0f172a'),
    ].join(''),
  },
  {
    id: 'coffee', name: '커피잔', place: 'desk',
    words: ['카페', '커피', '음료', '라떼'],
    draw: (x, y, z) => [cbox(x, y, z, 0.14, 0.14, 9, '#f8fafc', { top: '#7c4a2d' }), cbox(x + 0.1, y, z + 3, 0.05, 0.04, 4, '#f8fafc')].join(''),
  },
  {
    id: 'bento', name: '도시락', place: 'desk',
    words: ['음식', '요리', '레시피', '밀키트', '반찬', '식사', '급식', '식비', '배달', '식당', '먹거리', '푸드'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.4, 0.28, 5, '#be123c', { top: '#fef3c7' }), cbox(x - 0.1, y, z + 5, 0.14, 0.2, 1, '#22c55e'), cbox(x + 0.08, y, z + 5, 0.16, 0.2, 1, '#f97316'),
    ].join(''),
  },
  {
    id: 'piggy', name: '돼지저금통', place: 'desk',
    words: ['예산', '비용', '돈', '가격', '용돈', '결제', '저축', '절약', '할인', '금융', '투자', '은행', '가계부'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.3, 0.2, 11, '#f9a8d4', { top: '#fbcfe8' }), cbox(x + 0.17, y, z + 3, 0.05, 0.1, 5, '#f472b6'),
      cbox(x, y, z + 11, 0.1, 0.02, 4, '#facc15'),
    ].join(''),
  },
  {
    id: 'papers', name: '서류 더미', place: 'desk',
    words: ['자료', '문서', '보고서', '리포트', '설문', '조사', '리서치', '기록', '메모', '노션', '정리', '초안', '기획서', 'docs', 'doc', 'readme', 'document', 'notes', 'report', 'ssrd', 'erd'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.34, 0.26, 2, '#ffffff'), cbox(x + 0.03, y - 0.02, z + 2, 0.34, 0.26, 2, '#f1f5f9'), cbox(x, y - 0.09, z + 4, 0.12, 0.04, 2, '#64748b'),
    ].join(''),
  },
  {
    id: 'trophy', name: '트로피', place: 'desk',
    words: ['성공', '달성', '우승', '수상', '1등', '대회', '공모전'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.18, 0.18, 3, '#78350f'), cbox(x, y, z + 3, 0.05, 0.05, 6, '#eab308'), cbox(x, y, z + 9, 0.2, 0.2, 9, '#facc15', { top: '#fde047' }),
    ].join(''),
  },
  {
    id: 'gamepad', name: '게임패드', place: 'desk',
    words: ['게임', '레벨', '포인트', '보상', '챌린지', '배지', '게이미피케이션', '놀이'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.3, 0.16, 3, '#374151', { top: '#4b5563' }), cbox(x + 0.08, y, z + 3, 0.04, 0.04, 1, '#ef4444'), cbox(x - 0.08, y, z + 3, 0.07, 0.02, 1, '#e5e7eb'),
    ].join(''),
  },
  {
    id: 'globe', name: '지구본', place: 'desk',
    words: ['여행', '관광', '해외', '세계', '글로벌', '국제', '숙소', '항공'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.16, 0.16, 3, '#78350f'), cbox(x, y, z + 3, 0.03, 0.03, 7, '#a16207'),
      isoDot(x, y, z + 19, 10, 10, '#3b82f6', OUTLINE), isoDot(x - 0.02, y, z + 21, 5, 3.5, '#22c55e'), isoDot(x + 0.05, y, z + 15, 3, 2, '#22c55e'),
    ].join(''),
  },

  {
    id: 'microscope', name: '현미경', place: 'desk',
    words: ['연구', '실험', '과학', '우주', '화학', '생물', '분석실'],
    draw: (x, y, z) => [
      cbox(x, y, z, 0.26, 0.2, 3, '#e5e7eb'), cbox(x + 0.06, y - 0.04, z + 3, 0.06, 0.06, 16, '#334155'),
      cbox(x - 0.01, y, z + 13, 0.18, 0.06, 4, '#475569'), cbox(x - 0.06, y, z + 6, 0.06, 0.06, 9, '#1f2937', { top: '#94a3b8' }),
    ].join(''),
  },

  // ---------- 벽 ----------
  {
    id: 'calendar', name: '벽 달력', place: 'wall', wall: 'back',
    words: ['일정', '마감', '기한', '스케줄', '주차', '다음주', '계획', '로드맵', '데드라인', '날짜', 'schedule', 'deadline', 'calendar', 'sprint', 'milestone'],
    draw: () => {
      let s = wallRectY(2.72, 3.1, 70, 104, '#ffffff', OUTLINE) + wallRectY(2.72, 3.1, 96, 104, '#ef4444');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += wallRectY(2.76 + c * 0.11, 2.84 + c * 0.11, 74 + r * 7, 79 + r * 7, r === 1 && c === 2 ? '#fca5a5' : '#cbd5e1');
      return s;
    },
  },
  {
    id: 'map', name: '지도 포스터', place: 'wall', wall: 'left',
    words: ['지도', '위치', '장소', '길', '동네', '지역', 'map', 'location'],
    draw: () => [
      wallRectX(0.15, 0.85, 70, 108, '#bfdbfe', OUTLINE), wallRectX(0.25, 0.5, 84, 100, '#86efac'), wallRectX(0.58, 0.76, 75, 88, '#86efac'),
      wallRectX(0.42, 0.46, 78, 82, '#ef4444'),
    ].join(''),
  },
  {
    id: 'dartboard', name: '다트판', place: 'wall', wall: 'left',
    words: ['목표', '퀘스트', '미션', '주제', '방향', '타겟', '핵심'],
    draw: () => {
      const [cx, cy] = iso(0, 0.5, 90);
      // 왼쪽 벽에 걸린 원판이라 옆으로 눌린 타원으로 그린다
      return [12, 9, 6, 2.5].map((r, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.7}" ry="${r}" fill="${['#111827', '#f8fafc', '#ef4444', '#111827'][i]}" ${i === 0 ? OUTLINE : ''}/>`).join('')
        + `<line x1="${cx + 10}" y1="${cy - 6}" x2="${cx + 1}" y2="${cy}" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>`;
    },
  },
  {
    id: 'clock', name: '벽시계', place: 'wall', wall: 'left',
    words: ['시간', '타이머', '시각', '속도'],
    draw: () => {
      const [cx, cy] = iso(0, 0.5, 92);
      return `<ellipse cx="${cx}" cy="${cy}" rx="9" ry="11" fill="#f8fafc" ${OUTLINE}/>
        <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 7}" stroke="#111827" stroke-width="1.6"/>
        <line x1="${cx}" y1="${cy}" x2="${cx + 4}" y2="${cy + 2}" stroke="#111827" stroke-width="1.6"/>`;
    },
  },
];

// 이젤: 다리 셋 + 앞을 보는 판 위에 그림
function easel(x, y, art) {
  return [
    isoLine([x, y - 0.04, 46], [x, y - 0.3, 0], '#8b5e3c'),
    frontPanel(x - 0.24, x + 0.24, y, 20, 52, '#ffffff'),
    ...art,
    isoLine([x - 0.2, y + 0.02, 22], [x - 0.3, y + 0.16, 0], '#8b5e3c', 2.5), isoLine([x + 0.2, y + 0.02, 22], [x + 0.3, y + 0.16, 0], '#8b5e3c', 2.5),
  ].join('');
}

const DECOR_BY_ID = Object.fromEntries(DECOR.map(d => [d.id, d]));

// 한국어는 부분 일치(다회용기 ⊃ 다회용), 한 글자는 정확히 같을 때만,
// 영어는 단어 단위로만 (build 안의 ui, update 안의 up 같은 우연한 일치를 막는다)
function decorFor(word) {
  const w = (word || '').toLowerCase();
  if (w.length < 2) return null;
  const latinParts = w.split(/[^a-z0-9]+/).filter(Boolean);
  const hit = k => {
    if (/^[a-z0-9]+$/.test(k)) return latinParts.includes(k);
    if (k.length === 1) return w === k;
    return w.includes(k) || k.includes(w);
  };
  return DECOR.find(d => d.words.some(hit)) || null;
}

// 회의 발언에서 자리를 차지할 사물: 같은 사물로 모이는 키워드는 묶고, 자주 말한 순서로
function roomTalkDecor(talks) {
  const groups = new Map();
  roomTalkKeywords(talks, 30, true).forEach(k => {
    const d = decorFor(k.word);
    if (!d) return;
    const g = groups.get(d.id) || { decor: d, words: [], count: 0 };
    g.words.push(k.word);
    g.count += k.count;
    groups.set(d.id, g);
  });
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// 회의 마이크 스탠드 (회의 발언이 하나라도 있으면)
function micStand(x, y, n) {
  return [
    cbox(x, y, 0, 0.24, 0.24, 2, '#334155'), cbox(x, y, 2, 0.04, 0.04, 40, '#64748b'),
    cbox(x, y, 42, 0.11, 0.11, 9, '#1f2937', { top: '#94a3b8' }),
    n > 1 ? isoDot(x, y, 47, 3, 3, '#ef4444', OUTLINE) : '',
  ].join('');
}

// 자동 분류된 주제(js/themes.js) → 물품
const THEME_DECOR = {
  eco: 'plant', food: 'bento', edu: 'books', money: 'piggy', health: 'gym', travel: 'globe', music: 'speaker', game: 'gamepad',
  ai: 'robot', pet: 'pet', fashion: 'rack', mobility: 'bike', home: 'sofa', social: 'beanbag', commerce: 'bags', energy: 'lamp',
  farm: 'plant', science: 'microscope', media: 'camera', art: 'art', welfare: 'donation', safety: 'safe', career: 'briefcase', sports: 'gym',
};

// 기록 하나가 어떤 물품으로 이어지는지 → Map(물품 id → 그 물품이 된 키워드들)
function itemDecorIds(item) {
  const out = new Map();
  const add = (id, word) => { if (!DECOR_BY_ID[id]) return; if (!out.has(id)) out.set(id, new Set()); if (word) out.get(id).add(word); };
  if (item.type === 'work') {
    // 어떤 도구에서 했는지(노트북·이젤·서류) + 작업 내용의 핵심 키워드 → 물품
    const src = typeof SOURCES !== 'undefined' ? SOURCES[item.work?.source] : null;
    if (src) add(src.decor, `${src.name} 작업`);
  }
  const words = item.type === 'talk' && typeof talkKeywords === 'function' ? talkKeywords(item)
    : item.type === 'work' && typeof workKeywords === 'function' ? workKeywords(item)
    : (item.keywords || []);
  words.forEach(w => { const d = decorFor(w); if (d) add(d.id, w); });
  (item.themes || []).forEach(t => add(THEME_DECOR[t], THEME_BY_ID[t]?.name));
  return out;
}

// 모든 기록(자료·메모·아이디어·AI 대화·회의 발언·연동 작업)의 키워드 → 방에 놓을 물품. 많이 나온 순서로.
function roomDecorGroups(items) {
  const groups = new Map();
  items.forEach(it => itemDecorIds(it).forEach((words, id) => {
    const g = groups.get(id) || { decor: DECOR_BY_ID[id], words: new Set(), count: 0, items: [] };
    g.count += 1;
    g.items.push(it);
    words.forEach(w => g.words.add(w));
    groups.set(id, g);
  }));
  return [...groups.values()].map(g => ({ ...g, words: [...g.words] })).sort((a, b) => b.count - a.count);
}

// 옆 카드·전체 보기용 물품 그림 (글 없이). 그린 뒤 fitDecorThumbs()가 물품 크기에 맞게 확대한다
function decorThumbSVG(d) {
  const art = d.place === 'wall' ? d.draw() : d.place === 'desk' ? d.draw(0, 0, 0) : d.draw(0, 0);
  return `<svg class="decor-thumb-svg" viewBox="-60 -100 120 120" aria-hidden="true"><g>${art}</g></svg>`;
}

function fitDecorThumbs() {
  document.querySelectorAll('svg.decor-thumb-svg:not([data-fit])').forEach(svg => {
    try {
      const b = svg.firstElementChild.getBBox();
      if (!b.width) return;
      const pad = Math.max(b.width, b.height) * 0.12;
      svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
      svg.dataset.fit = '1';
    } catch (e) { /* 화면에 없는 그림 */ }
  });
}
