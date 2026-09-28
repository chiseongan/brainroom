// 주제 → 방 소품 매핑 테이블.
// words 중 하나라도 자료 텍스트에 등장하면 해당 주제로 분류되고, 방에 emoji 소품이 놓인다.
// 영문 단어는 단어 경계로, 한글 단어는 부분 문자열로 비교한다.
const THEMES = [
  { id: 'eco', name: '환경', emoji: '🪴', extra: '♻️', words: ['친환경', '환경', '재활용', '탄소', '플라스틱', '쓰레기', '기후', '업사이클', '제로웨이스트', '분리수거', '포장재', '다회용', 'eco', 'esg'] },
  { id: 'food', name: '음식', emoji: '🍳', extra: '🥗', words: ['음식', '요리', '배달', '식당', '레시피', '식품', '밀키트', '식사', '급식', '카페', '반찬', '식비', 'food'] },
  { id: 'edu', name: '교육', emoji: '📐', extra: '🎓', words: ['교육', '학습', '강의', '공부', '수업', '과외', '수강', '시험', '튜터', '스터디'] },
  { id: 'money', name: '금융', emoji: '💰', extra: '🏦', words: ['금융', '결제', '투자', '은행', '핀테크', '예산', '용돈', '가계부', '소비', '저축', '대출', '절약', 'fintech'] },
  { id: 'health', name: '건강', emoji: '🏋️', extra: '💊', words: ['건강', '운동', '헬스', '의료', '병원', '수면', '다이어트', '멘탈', '스트레스', '웰빙', 'health'] },
  { id: 'travel', name: '여행', emoji: '🧳', extra: '🗺️', words: ['여행', '관광', '숙소', '항공', '지도', 'travel'] },
  { id: 'music', name: '음악', emoji: '🎸', extra: '🎧', words: ['음악', '노래', '공연', '밴드', 'music'] },
  { id: 'game', name: '게임', emoji: '🎮', extra: '🕹️', words: ['게임', '게이미피케이션', '놀이', '퀘스트', '레벨', '챌린지', '배지', 'game'] },
  { id: 'ai', name: 'AI·데이터', emoji: '🤖', extra: '📊', words: ['인공지능', '데이터', '머신러닝', '딥러닝', '알고리즘', '추천', '챗봇', '분석', 'ai', 'llm', 'gpt'] },
  { id: 'pet', name: '반려동물', emoji: '🐶', extra: '🐱', words: ['반려', '강아지', '고양이', '펫', '유기견', '동물', 'pet'] },
  { id: 'fashion', name: '패션', emoji: '👗', extra: '👟', words: ['패션', '의류', '중고거래', '코디', 'fashion'] },
  { id: 'mobility', name: '모빌리티', emoji: '🚲', extra: '🛴', words: ['교통', '자동차', '자전거', '모빌리티', '킥보드', '버스', '지하철', '주차', 'mobility'] },
  { id: 'home', name: '주거', emoji: '🛋️', extra: '🏠', words: ['자취', '주거', '1인가구', '부동산', '원룸', '기숙사', '월세', '인테리어', '룸메이트'] },
  { id: 'social', name: '커뮤니티', emoji: '💬', extra: '🫂', words: ['커뮤니티', 'sns', '소셜', '친구', '모임', '네트워킹', '동아리', '소통', '외로움', '이웃', '나눔'] },
  { id: 'commerce', name: '커머스', emoji: '🛒', extra: '📦', words: ['쇼핑', '커머스', '판매', '마켓', '구매', '구독', '공동구매', '이커머스', '스토어'] },
  { id: 'energy', name: '에너지', emoji: '🔋', extra: '☀️', words: ['에너지', '전기', '태양광', '배터리', '절전', '전력'] },
  { id: 'farm', name: '농업', emoji: '🌾', extra: '🥕', words: ['농업', '농촌', '스마트팜', '농산물', '귀농', '텃밭'] },
  { id: 'science', name: '과학', emoji: '🔭', extra: '🧪', words: ['우주', '과학', '실험', '연구', '논문', 'science'] },
  { id: 'media', name: '콘텐츠', emoji: '🎬', extra: '📺', words: ['영상', '유튜브', '콘텐츠', '미디어', '쇼츠', '크리에이터', '웹툰', 'youtube'] },
  { id: 'art', name: '디자인', emoji: '🎨', extra: '🖼️', words: ['디자인', '예술', '그림', '전시', 'ux', 'ui', '브랜딩', '일러스트'] },
  { id: 'welfare', name: '사회·복지', emoji: '🤝', extra: '🧓', words: ['복지', '노인', '어르신', '장애', '봉사', '기부', '취약', '사회문제', '고령화'] },
  { id: 'safety', name: '안전', emoji: '🛡️', extra: '🚨', words: ['안전', '보안', '재난', '범죄', '개인정보', 'security'] },
  { id: 'career', name: '커리어', emoji: '💼', extra: '📈', words: ['취업', '채용', '커리어', '이력서', '면접', '인턴', '창업', '스타트업', '부업'] },
  { id: 'sports', name: '스포츠', emoji: '⚽', extra: '🏆', words: ['스포츠', '축구', '야구', '농구', '러닝', 'sports'] },
];

const THEME_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));
