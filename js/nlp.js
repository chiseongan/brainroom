// 규칙 기반 키워드/주제 추출. (AI 연동 전까지 쓰는 가벼운 버전)

const JOSA = [
  '에서는', '으로는', '에게서', '이라는', '했는데', '합니다', '입니다', '하면서',
  '에서', '으로', '에게', '하면', '끼리', '까지', '부터', '처럼', '보다', '이랑', '라는', '하는', '하기', '하고', '해서', '했다', '한다', '이다', '들이', '들을', '들은',
  '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '랑', '들',
].sort((a, b) => b.length - a.length);

const STOPWORDS = new Set([
  '그리고', '하지만', '그래서', '그런데', '이런', '저런', '그런', '있는', '없는', '대한', '위한', '통해', '같은', '정도',
  '아이디어', '생각', '관련', '내용', '정리', '우리', '저희', '이것', '그것', '경우', '때문', '있다', '없다', '된다',
  '가능성', '사례', '서비스', '방법', '문제', '필요', '느낌', '진짜', '그냥', '조금', '많이', '너무', '어떻게', '무엇',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'http', 'https', 'www', 'com',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^0-9a-z가-힣]+/)
    .filter(Boolean);
}

function normalizeToken(token) {
  if (/^[가-힣]+$/.test(token)) {
    for (const j of JOSA) {
      if (token.length - j.length >= 2 && token.endsWith(j)) return token.slice(0, -j.length);
    }
  }
  return token;
}

function extractKeywords(text, limit = 6) {
  const counts = new Map();
  tokenize(text).forEach((raw, idx) => {
    const t = normalizeToken(raw);
    if (t.length < 2 || STOPWORDS.has(t) || /^\d+$/.test(t)) return;
    if (/^[a-z]+$/.test(t) && t.length < 3 && t !== 'ai') return;
    const prev = counts.get(t) || { n: 0, first: idx };
    prev.n += 1;
    counts.set(t, prev);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[0].length - a[0].length || a[1].first - b[1].first)
    .slice(0, limit)
    .map(([t]) => t);
}

function wordMatches(lower, word) {
  if (/^[a-z0-9]+$/.test(word)) return new RegExp(`\\b${word}\\b`).test(lower);
  return lower.includes(word);
}

function detectThemes(text) {
  const lower = (text || '').toLowerCase();
  return THEMES
    .map(theme => ({ id: theme.id, score: theme.words.filter(w => wordMatches(lower, w)).length }))
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score);
}

// 두 자료가 얼마나 연결되는지: 공통 주제(가중치 2) + 공통 키워드(가중치 1)
function relatedness(a, b) {
  const labels = [];
  let score = 0;
  for (const t of a.themes) {
    if (b.themes.includes(t)) {
      score += 2;
      labels.push(`${THEME_BY_ID[t].emoji} ${THEME_BY_ID[t].name}`);
    }
  }
  const seen = new Set();
  for (const ka of a.keywords) {
    for (const kb of b.keywords) {
      const hit = ka === kb || ka.includes(kb) || kb.includes(ka);
      if (!hit) continue;
      const label = ka.length <= kb.length ? ka : kb;
      if (seen.has(label)) continue;
      seen.add(label);
      score += 1;
      labels.push(`#${label}`);
    }
  }
  return { score, labels };
}
