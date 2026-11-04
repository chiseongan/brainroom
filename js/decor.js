// 회의 키워드 → 방에 어울리는 사물 (2.5D). 예: 재활용 → 분리수거함, 교육 → 책상 위 교과서, 일정 → 벽 달력.
// place: desk = 책상 위, floor = 바닥, wall = 벽 (back = 뒷벽 창문과 화이트보드 사이, left = 왼쪽 벽)
// height: 바닥 물건의 키 (low·mid·tall) → 방에서 다른 가구를 가리지 않는 자리에 놓는다 (js/room.js)
// words = 그 물건을 뜻하는 구체적인 말, weak = 흔한 말 (decorMatch 참고). 좌표 x, y는 사물의 가운데.

const DESK_Z = 30; // 책상 윗면 높이

// 가운데 기준 상자
function cbox(x, y, z, w, d, h, color, opts) {
  return box(x - w / 2, y - d / 2, z, w, d, h, color, opts);
}

// 여러 점을 잇는 부드러운 선의 d 값 (손잡이, 구부러진 마이크 등)
function isoPath(points) {
  const p = points.map(q => iso(...q));
  if (p.length === 3) return `M${p[0]} Q${p[1]} ${p[2]}`;
  if (p.length === 4) return `M${p[0]} C${p[1]} ${p[2]} ${p[3]}`;
  return `M${p.join(' L')}`;
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
    id: 'recycle', name: '분리수거함', place: 'floor', height: 'mid',
    words: ['재활용', '다회용', '순환', '분리수거', '쓰레기', '플라스틱', '포장재', '업사이클', '제로웨이스트', '음식물', '일회용', '텀블러', 'recycle', 'recycling'],
    draw: (x, y) => {
      const bin = (bx, color, lid) => [
        cbox(bx, y, 0, 0.36, 0.38, 30, color),
        // 뚜껑과 투입구
        cbox(bx, y, 30, 0.4, 0.42, 3, lid),
        poly([[bx - 0.11, y - 0.06, 33.2], [bx + 0.11, y - 0.06, 33.2], [bx + 0.11, y + 0.1, 33.2], [bx - 0.11, y + 0.1, 33.2]], '#1b2430', 'opacity=".75"'),
        // 재활용 표시
        poly([[bx - 0.08, y + 0.19, 10], [bx + 0.08, y + 0.19, 10], [bx, y + 0.19, 22]], 'none', 'stroke="#fff" stroke-width="1.6" stroke-linejoin="round"'),
      ].join('');
      return shadow(x, y, 1, 0.5) + bin(x - 0.21, '#3a9d68', '#2a7a4f') + bin(x + 0.21, '#3d78c9', '#2d5da3');
    },
  },
  {
    id: 'podium', name: '발표 연단', place: 'floor', height: 'mid',
    words: ['발표', '인터뷰', '스피치', '피피티', 'ppt', '슬라이드', '면담', '프레젠테이션', '시연', 'presentation', 'slides', 'demo', 'pitch'],
    draw: (x, y) => [
      shadow(x, y, 0.7, 0.55),
      cbox(x, y, 0, 0.5, 0.4, 3, '#5b3c23'),
      cbox(x, y, 3, 0.4, 0.3, 30, '#8a5c37'),
      frontPanel(x - 0.13, x + 0.13, y + 0.151, 9, 27, '#a9764a'),
      // 기울어진 윗판과 원고
      poly([[x - 0.25, y - 0.2, 37], [x + 0.25, y - 0.2, 37], [x + 0.25, y + 0.22, 31], [x - 0.25, y + 0.22, 31]], '#a9764a', OUTLINE),
      poly([[x - 0.14, y - 0.1, 36.4], [x + 0.14, y - 0.1, 36.4], [x + 0.14, y + 0.12, 33], [x - 0.14, y + 0.12, 33]], '#fbfbf6', OUTLINE),
      // 구부러진 마이크
      `<path d="${isoPath([[x + 0.18, y - 0.14, 36], [x + 0.2, y - 0.1, 48], [x + 0.08, y, 52]])}" fill="none" stroke="#2b3240" stroke-width="1.6" stroke-linecap="round"/>`,
      isoDot(x + 0.07, y + 0.01, 52, 2.4, 2.4, '#1a1f2a'),
    ].join(''),
  },
  {
    id: 'plant', name: '화분', place: 'floor', height: 'tall',
    words: ['환경', '친환경', '탄소', '기후', '식물', '나무', '숲', '텃밭', '농업', '스마트팜', '꽃', '자연', '정원', '농산물'],
    draw: (x, y) => palm(x, y, 0.72),
  },
  {
    id: 'lamp', name: '스탠드 조명', place: 'floor', height: 'tall', weak: ['아이디어', '기획', '컨셉', '브레인스토밍'],
    words: ['영감', '발상'],
    draw: (x, y) => floorLamp(x, y, true),
  },
  {
    id: 'solar', name: '태양광 패널', place: 'floor', height: 'mid',
    words: ['에너지', '전기', '태양광', '배터리', '절전', '전력', '발전소', '신재생'],
    draw: (x, y) => {
      let cells = '';
      const a = [x - 0.34, y - 0.12, 34], c = [x + 0.34, y + 0.2, 12]; // 비스듬한 판: 뒤쪽이 높다
      const at = (u, v) => [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * v, a[2] + (c[2] - a[2]) * v];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        cells += poly([at(i / 4 + 0.012, j / 3 + 0.02), at((i + 1) / 4 - 0.012, j / 3 + 0.02), at((i + 1) / 4 - 0.012, (j + 1) / 3 - 0.02), at(i / 4 + 0.012, (j + 1) / 3 - 0.02)], (i + j) % 2 ? '#1e3f78' : '#25508f');
      }
      return [
        shadow(x, y, 0.9, 0.6),
        isoLine([x - 0.26, y - 0.1, 33], [x - 0.26, y - 0.1, 0], '#6b7280', 2.5), isoLine([x + 0.26, y - 0.1, 33], [x + 0.26, y - 0.1, 0], '#6b7280', 2.5),
        isoLine([x - 0.26, y + 0.17, 13], [x - 0.26, y + 0.17, 0], '#6b7280', 2.5), isoLine([x + 0.26, y + 0.17, 13], [x + 0.26, y + 0.17, 0], '#6b7280', 2.5),
        poly([at(0, 0), at(1, 0), at(1, 1), at(0, 1)], '#c7ccd4', OUTLINE),
        cells,
        cbox(x + 0.36, y + 0.32, 0, 0.14, 0.1, 12, '#2e7d5b', { top: '#3fa578' }),
      ].join('');
    },
  },
  {
    id: 'gym', name: '운동 매트와 아령', place: 'floor', height: 'low',
    words: ['운동', '건강', '헬스', '러닝', '다이어트', '스포츠', '축구', '야구', '농구', '체육', '요가'],
    draw: (x, y) => [
      shadow(x, y, 0.9, 0.5, 0.14),
      flat(x - 0.42, y - 0.24, 0.84, 0.48, '#7f6bd6', 'stroke="#5a48ad" stroke-opacity=".6"'),
      flat(x - 0.42, y - 0.24, 0.1, 0.48, '#6a57c2'),
      // 아령 한 쌍: 원판 두 개와 손잡이
      faceCircle(x - 0.2, y + 0.02, 5, 4.5, 'x', '#2a303c', OUTLINE), isoLine([x - 0.2, y + 0.02, 5], [x + 0.02, y + 0.02, 5], '#aab2bd', 2.2), faceCircle(x - 0.14, y + 0.02, 5, 4.5, 'x', '#3a4150'), faceCircle(x + 0.02, y + 0.02, 5, 4.5, 'x', '#2a303c', OUTLINE), faceCircle(x + 0.08, y + 0.02, 5, 4.5, 'x', '#3a4150', OUTLINE),
      faceCircle(x + 0.2, y - 0.16, 5, 4.5, 'y', '#2a303c', OUTLINE), isoLine([x + 0.2, y - 0.16, 5], [x + 0.2, y + 0.08, 5], '#aab2bd', 2.2), faceCircle(x + 0.2, y - 0.1, 5, 4.5, 'y', '#3a4150'), faceCircle(x + 0.2, y + 0.08, 5, 4.5, 'y', '#2a303c', OUTLINE), faceCircle(x + 0.2, y + 0.14, 5, 4.5, 'y', '#3a4150', OUTLINE),
    ].join(''),
  },
  {
    id: 'pet', name: '반려동물 방석', place: 'floor', height: 'low',
    words: ['반려', '강아지', '고양이', '펫', '유기견', '유기묘', '동물', '산책'],
    draw: (x, y) => {
      const [cx, cy] = iso(x - 0.05, y, 7);
      return [
        shadow(x - 0.05, y, 0.8, 0.8),
        cyl(x - 0.05, y, 0, 18, 7, '#c9745f', { top: '#e7a48f' }),
        `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="6.5" fill="#f5e3d3"/>`,
        // 웅크린 고양이
        `<ellipse cx="${cx - 1}" cy="${cy - 3}" rx="9" ry="5" fill="#e0a15c" stroke="#1b1b2a" stroke-opacity=".3"/>`,
        `<circle cx="${cx + 6}" cy="${cy - 6}" r="3.6" fill="#e0a15c" stroke="#1b1b2a" stroke-opacity=".3"/>`,
        `<polygon points="${cx + 3.6},${cy - 8.6} ${cx + 4.6},${cy - 11} ${cx + 6.2},${cy - 9.4}" fill="#c98744"/><polygon points="${cx + 6.6},${cy - 9.4} ${cx + 8.4},${cy - 11} ${cx + 8.8},${cy - 8.4}" fill="#c98744"/>`,
        `<path d="M${cx - 9},${cy - 2} q-3,3 2,4" fill="none" stroke="#c98744" stroke-width="2" stroke-linecap="round"/>`,
        // 밥그릇
        cyl(x + 0.42, y + 0.2, 0, 7, 4, '#5e8fc9', { r2: 8, top: '#3a4a5e' }),
      ].join('');
    },
  },
  {
    id: 'bags', name: '쇼핑백', place: 'floor', height: 'low',
    words: ['쇼핑', '구매', '구독', '마켓', '판매', '커머스', '이커머스', '공동구매', '스토어', '소비', '가게'],
    draw: (x, y) => {
      const bag = (bx, by, w, h, color, handle) => [
        cbox(bx, by, 0, w, 0.12, h, color),
        poly([[bx - w / 2, by - 0.06, h], [bx + w / 2, by - 0.06, h], [bx + w / 2, by + 0.06, h], [bx - w / 2, by + 0.06, h]], shade(color, -0.45)),
        `<path d="${isoPath([[bx - w * 0.22, by + 0.06, h], [bx - w * 0.14, by + 0.06, h + 6], [bx + w * 0.14, by + 0.06, h + 6], [bx + w * 0.22, by + 0.06, h]])}" fill="none" stroke="${handle}" stroke-width="1.5"/>`,
        faceCircle(bx, by + 0.061, h * 0.5, w * 12, 'y', '#fff', 'opacity=".85"'),
      ].join('');
      return shadow(x, y, 0.8, 0.45) + bag(x - 0.12, y - 0.05, 0.3, 24, '#d9773f', '#6e3a1c') + bag(x + 0.16, y + 0.08, 0.26, 17, '#2d9c8d', '#165a51');
    },
  },
  {
    id: 'parcel', name: '택배 상자', place: 'floor', height: 'low',
    words: ['택배', '물류', '배송', '유통', '창고', '재고', '포장'],
    draw: (x, y) => {
      const carton = (bx, by, z, w, h, cn) => [
        cbox(bx, by, z, w, w * 0.8, h, cn, { top: shade(cn, 0.14) }),
        poly([[bx - 0.03, by - w * 0.4, z + h + 0.1], [bx + 0.03, by - w * 0.4, z + h + 0.1], [bx + 0.03, by + w * 0.4, z + h + 0.1], [bx - 0.03, by + w * 0.4, z + h + 0.1]], '#e8d9b5', 'opacity=".9"'),
        frontPanel(bx - 0.03, bx + 0.03, by + w * 0.4, z + h - 4, z + h, '#e8d9b5', ''),
      ].join('');
      return shadow(x, y, 0.9, 0.7) + carton(x - 0.08, y, 0, 0.5, 19, '#c49a6c') + frontPanel(x - 0.28, x - 0.14, y + 0.2, 6, 13, '#fbfbf6') + carton(x + 0.02, y - 0.01, 19, 0.3, 12, '#b9895a');
    },
  },
  {
    id: 'speaker', name: '스피커', place: 'floor', height: 'mid',
    words: ['음악', '노래', '공연', '밴드', '사운드', '음향', '작곡', '악기'],
    draw: (x, y) => [
      shadow(x, y, 0.6, 0.55),
      cbox(x, y, 0, 0.32, 0.3, 44, '#23262f', { top: '#3a3f4c' }),
      faceCircle(x, y + 0.151, 13, 8, 'y', '#14161c'), faceCircle(x, y + 0.151, 13, 5, 'y', '#3a3f4c'), faceCircle(x, y + 0.151, 13, 1.8, 'y', '#14161c'),
      faceCircle(x, y + 0.151, 32, 4.5, 'y', '#14161c'), faceCircle(x, y + 0.151, 32, 2, 'y', '#9aa3b2'),
    ].join(''),
  },
  {
    id: 'camera', name: '삼각대 카메라', place: 'floor', height: 'tall',
    words: ['사진', '영상', '유튜브', '영화', '콘텐츠', '쇼츠', '촬영', '크리에이터', '미디어', '방송', '브이로그'],
    draw: (x, y) => [
      shadow(x, y, 0.8, 0.8, 0.12),
      isoLine([x, y, 38], [x - 0.24, y + 0.18, 0], '#3b4252', 2), isoLine([x, y, 38], [x + 0.24, y + 0.14, 0], '#3b4252', 2), isoLine([x, y, 38], [x - 0.02, y - 0.26, 0], '#3b4252', 2),
      cbox(x, y, 38, 0.06, 0.06, 4, '#3b4252'),
      cbox(x, y, 42, 0.26, 0.12, 14, '#20242c', { top: '#333945' }),
      cbox(x - 0.04, y, 56, 0.1, 0.08, 3, '#333945'),
      faceCircle(x, y + 0.061, 49, 5.4, 'y', '#11141a'), faceCircle(x, y + 0.061, 49, 3.2, 'y', '#3f6fa8'), faceCircle(x - 0.8 / 64, y + 0.061, 50, 1, 'y', '#cfe4ff'),
      isoDot(x + 0.1, y + 0.061, 54, 1.2, 1.2, '#ef4444'),
    ].join(''),
  },
  {
    id: 'chart', name: '차트 보드', place: 'floor', height: 'tall',
    words: ['데이터', '통계', '분석', '그래프', '시각화', '경쟁', '마케팅', '매출', '수익', '지표', '성장', '수요', '점유율', 'data', 'analytics', 'chart', 'graph', 'dashboard', 'stats', 'metrics'],
    weak: ['시장'],
    draw: (x, y) => easel(x, y, [
      isoLine([x - 0.2, y + 0.011, 26], [x + 0.2, y + 0.011, 26], '#9aa3b2', 1),
      frontPanel(x - 0.18, x - 0.09, y + 0.011, 26, 34, '#4c82d8', ''), frontPanel(x - 0.04, x + 0.05, y + 0.011, 26, 41, '#3fae7a', ''), frontPanel(x + 0.1, x + 0.19, y + 0.011, 26, 49, '#e6a23c', ''),
      `<path d="${isoPath([[x - 0.16, y + 0.012, 37], [x, y + 0.012, 44], [x + 0.15, y + 0.012, 53]])}" fill="none" stroke="#d9534f" stroke-width="1.5" stroke-linecap="round"/>`,
    ]),
  },
  {
    id: 'art', name: '그림 이젤', place: 'floor', height: 'tall',
    words: ['디자인', '그림', '일러스트', '예술', '로고', '브랜드', '브랜딩', '색', 'ui', 'ux', '전시', '미술', 'design', 'figma', 'style', 'css', 'logo', 'icon', 'mockup', 'wireframe'],
    draw: (x, y) => easel(x, y, [
      frontPanel(x - 0.22, x + 0.22, y + 0.011, 40, 56, '#a8d3ef', ''),
      frontPanel(x - 0.22, x + 0.22, y + 0.011, 24, 40, '#85b86b', ''),
      poly([[x - 0.22, y + 0.012, 40], [x - 0.04, y + 0.012, 50], [x + 0.08, y + 0.012, 40]], '#6c8f9f'),
      poly([[x - 0.04, y + 0.012, 40], [x + 0.12, y + 0.012, 52], [x + 0.22, y + 0.012, 40]], '#7fa2b0'),
      isoDot(x + 0.13, y + 0.012, 53, 3, 3, '#f7d774'),
    ]),
  },
  {
    id: 'ballot', name: '투표함', place: 'floor', height: 'mid',
    words: ['투표', '채택', '설문조사', 'vote', 'decision'],
    weak: ['결정', '확정', '합의', '선택'],
    draw: (x, y) => [
      shadow(x, y, 0.8, 0.6),
      cbox(x, y, 0, 0.42, 0.42, 30, '#eef1f5', { top: '#fafbfc' }),
      frontPanel(x - 0.17, x + 0.17, y + 0.211, 9, 23, '#2f6bc4', ''),
      `<path d="M${iso(x - 0.12, y + 0.211, 16)} L${iso(x - 0.03, y + 0.211, 12)} L${iso(x + 0.13, y + 0.211, 21)}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
      poly([[x - 0.13, y - 0.02, 30.2], [x + 0.13, y - 0.02, 30.2], [x + 0.13, y + 0.02, 30.2], [x - 0.13, y + 0.02, 30.2]], '#1f2530'),
      // 넣는 중인 투표지
      poly([[x - 0.06, y, 30], [x + 0.06, y, 30], [x + 0.06, y, 38], [x - 0.06, y, 38]], '#ffffff', OUTLINE),
    ].join(''),
  },
  {
    id: 'beanbag', name: '빈백 의자', place: 'floor', height: 'low',
    words: ['협업', '커뮤니티', '모임', '동아리', '소통', '이웃', 'community'],
    weak: ['팀', '팀원', '같이', '사람', '고객', '사용자', '유저', '이용자', '친구', 'team', 'user', 'users', 'member', 'members'],
    draw: (x, y) => {
      const [cx, cy] = iso(x, y, 0);
      return shadow(x, y, 0.9, 0.9) + `
        <path d="M${cx - 22},${cy - 2} C${cx - 25},${cy - 18} ${cx - 15},${cy - 33} ${cx - 2},${cy - 34} C${cx + 13},${cy - 35} ${cx + 25},${cy - 16} ${cx + 22},${cy - 2} C${cx + 16},${cy + 9} ${cx - 16},${cy + 9} ${cx - 22},${cy - 2} Z" fill="#d98a3d" ${OUTLINE}/>
        <path d="M${cx - 22},${cy - 2} C${cx - 25},${cy - 18} ${cx - 15},${cy - 33} ${cx - 2},${cy - 34} C${cx + 13},${cy - 35} ${cx + 25},${cy - 16} ${cx + 22},${cy - 2} C${cx + 16},${cy + 9} ${cx - 16},${cy + 9} ${cx - 22},${cy - 2} Z" fill="url(#brRound)"/>
        <path d="M${cx - 14},${cy - 8} Q${cx},${cy + 2} ${cx + 15},${cy - 9}" fill="none" stroke="#8f5620" stroke-opacity=".55" stroke-width="1.5"/>
        <path d="M${cx - 2},${cy - 34} q2,12 -1,23" fill="none" stroke="#8f5620" stroke-opacity=".35" stroke-width="1"/>`;
    },
  },
  {
    id: 'sofa', name: '소파', place: 'floor', height: 'low',
    words: ['집', '자취', '원룸', '기숙사', '주거', '1인가구', '룸메이트', '인테리어', '월세', '부동산', '가구'],
    draw: (x, y) => {
      const c = '#5f88a8';
      const leg = (lx, ly) => cbox(lx, ly, 0, 0.04, 0.04, 3, '#4a3423');
      return [
        shadow(x, y, 1.1, 0.6),
        leg(x - 0.38, y + 0.18), leg(x + 0.38, y + 0.18), leg(x + 0.38, y - 0.18),
        cbox(x, y - 0.17, 3, 0.86, 0.14, 26, shade(c, -0.05)), // 등받이
        cbox(x, y + 0.04, 3, 0.86, 0.36, 9, shade(c, -0.15)), // 받침
        cbox(x - 0.2, y + 0.04, 12, 0.36, 0.34, 4, c, { top: shade(c, 0.18) }), cbox(x + 0.2, y + 0.04, 12, 0.36, 0.34, 4, c, { top: shade(c, 0.18) }), // 방석
        cbox(x + 0.2, y - 0.09, 16, 0.2, 0.05, 11, '#e8b75a', { top: '#f3cf85' }), // 쿠션
        cbox(x - 0.42, y + 0.02, 3, 0.1, 0.44, 19, c, { top: shade(c, 0.1) }), cbox(x + 0.42, y + 0.02, 3, 0.1, 0.44, 19, c, { top: shade(c, 0.1) }), // 팔걸이
      ].join('');
    },
  },
  {
    id: 'safe', name: '금고', place: 'floor', height: 'mid',
    words: ['보안', '개인정보', '로그인', '계정', '비밀번호', '암호화', '권한', 'login', 'auth', 'security', 'password', 'rules', 'permission', 'oauth'],
    draw: (x, y) => [
      shadow(x, y, 0.8, 0.7),
      cbox(x, y, 0, 0.44, 0.42, 34, '#59626f', { top: '#7c8592' }),
      frontPanel(x - 0.18, x + 0.18, y + 0.211, 4, 30, '#6b7482'),
      faceCircle(x - 0.03, y + 0.212, 18, 5.2, 'y', '#d8dde4', OUTLINE), faceCircle(x - 0.03, y + 0.212, 18, 1.6, 'y', '#59626f'),
      frontPanel(x + 0.1, x + 0.14, y + 0.212, 13, 23, '#c7ccd4'),
      frontPanel(x - 0.21, x - 0.18, y + 0.212, 23, 27, '#3b424d', ''), frontPanel(x - 0.21, x - 0.18, y + 0.212, 8, 12, '#3b424d', ''),
    ].join(''),
  },
  {
    id: 'extinguisher', name: '소화기', place: 'floor', height: 'mid',
    words: ['안전', '재난', '화재', '소방', '사고', '범죄', '대피'],
    draw: (x, y) => [
      shadow(x, y, 0.45, 0.45),
      cyl(x, y, 0, 8.5, 32, '#cf3a33', { top: '#b32c26' }),
      cyl(x, y, 32, 8.5, 4, '#cf3a33', { r2: 3.5, top: '#2b2f38' }),
      cbox(x, y, 36, 0.05, 0.05, 6, '#2b2f38'),
      isoLine([x, y, 42], [x + 0.14, y, 45], '#2b2f38', 2.5),
      `<path d="${isoPath([[x - 0.02, y, 41], [x - 0.2, y + 0.06, 36], [x - 0.2, y + 0.1, 18]])}" fill="none" stroke="#20242c" stroke-width="2" stroke-linecap="round"/>`,
      frontPanel(x - 0.08, x + 0.08, y + 0.13, 11, 23, '#f4f1e6', ''),
    ].join(''),
  },
  {
    id: 'donation', name: '기부함', place: 'floor', height: 'mid',
    words: ['나눔', '기부', '봉사', '복지', '후원', '취약', '사회문제', '어르신', '노인', '장애'],
    draw: (x, y) => [
      shadow(x, y, 0.6, 0.6),
      cbox(x, y, 0, 0.24, 0.24, 16, '#8a6a4a'),
      // 투명 상자와 안의 동전
      cbox(x, y, 16, 0.3, 0.3, 19, '#dbeafe', { top: '#eff6ff', left: '#c5dcf5', right: '#b4cfec', attrs: 'opacity=".8"' }),
      isoDot(x - 0.04, y + 0.04, 19, 4, 2.2, '#e8b730'), isoDot(x + 0.05, y, 20, 4, 2.2, '#f0c648'), isoDot(x, y + 0.06, 23, 4, 2.2, '#e8b730'),
      poly([[x - 0.07, y, 35.1], [x + 0.07, y, 35.1], [x + 0.07, y + 0.02, 35.1], [x - 0.07, y + 0.02, 35.1]], '#3b424d'),
      `<text x="${iso(x, y + 0.13, 8)[0]}" y="${iso(x, y + 0.13, 8)[1] + 4}" font-size="10" text-anchor="middle" fill="#ef6461">♥</text>`,
    ].join(''),
  },
  {
    id: 'toolbox', name: '공구함', place: 'floor', height: 'low',
    words: ['버그', '오류', '에러', '테스트', '리스크', '장애물', '수리', 'fix', 'bug', 'bugfix', 'hotfix', 'error', 'test', 'tests', 'issue', 'refactor'],
    weak: ['문제', '해결', '이슈', '수정', '개선'],
    draw: (x, y) => [
      shadow(x, y, 0.8, 0.45),
      cbox(x, y, 0, 0.5, 0.26, 13, '#c43a33'),
      cbox(x, y, 13, 0.52, 0.28, 5, '#d9504a', { top: '#e56a64' }),
      frontPanel(x - 0.17, x - 0.11, y + 0.141, 10, 16, '#e7e9ee'), frontPanel(x + 0.11, x + 0.17, y + 0.141, 10, 16, '#e7e9ee'),
      `<path d="${isoPath([[x - 0.12, y, 18], [x - 0.08, y, 24], [x + 0.08, y, 24], [x + 0.12, y, 18]])}" fill="none" stroke="#20242c" stroke-width="2.5" stroke-linejoin="round"/>`,
    ].join(''),
  },
  {
    id: 'bike', name: '자전거', place: 'floor', height: 'mid',
    words: ['교통', '자전거', '킥보드', '모빌리티', '버스', '지하철', '자동차', '주차', '주차장', '통학', '통근', '이동'],
    draw: (x, y) => {
      const wheel = wx => faceCircle(wx, y, 11, 11, 'y', 'none', 'stroke="#20242c" stroke-width="2.2"') + faceCircle(wx, y, 11, 1.8, 'y', '#8a93a1');
      const frame = '#c8473d';
      return [
        shadow(x, y, 1.1, 0.25, 0.16),
        wheel(x - 0.3), wheel(x + 0.3),
        isoLine([x - 0.3, y, 11], [x - 0.04, y, 11], frame, 2.2), isoLine([x - 0.04, y, 11], [x + 0.16, y, 25], frame, 2.2),
        isoLine([x - 0.3, y, 11], [x - 0.1, y, 25], frame, 2.2), isoLine([x - 0.1, y, 25], [x + 0.16, y, 25], frame, 2.2), isoLine([x - 0.1, y, 25], [x - 0.04, y, 11], frame, 2.2),
        isoLine([x + 0.3, y, 11], [x + 0.16, y, 30], frame, 2.2),
        isoLine([x - 0.1, y, 25], [x - 0.12, y, 30], '#2b303b', 2), isoLine([x - 0.19, y, 31], [x - 0.05, y, 31], '#20242c', 3.4),
        isoLine([x + 0.16, y, 30], [x + 0.13, y - 0.1, 31], '#2b303b', 2), isoLine([x + 0.16, y, 30], [x + 0.13, y + 0.1, 31], '#2b303b', 2),
      ].join('');
    },
  },
  {
    id: 'rack', name: '옷걸이 행거', place: 'floor', height: 'tall',
    words: ['패션', '의류', '옷', '코디', '중고거래', '신발', '스타일링', '빈티지'],
    draw: (x, y) => {
      const garment = (gx, color, len) => {
        const top = 47;
        return isoLine([gx, y, 53], [gx, y, top + 2], '#7a818d', 1) + poly([[gx - 0.08, y, top], [gx + 0.08, y, top], [gx + 0.07, y, top - len], [gx - 0.07, y, top - len]], color, OUTLINE)
          + poly([[gx - 0.08, y, top], [gx - 0.12, y, top - 8], [gx - 0.08, y, top - 10]], shade(color, -0.12)) + poly([[gx + 0.08, y, top], [gx + 0.12, y, top - 8], [gx + 0.08, y, top - 10]], shade(color, -0.12));
      };
      return [
        shadow(x, y, 1, 0.3, 0.14),
        isoLine([x - 0.38, y - 0.1, 1], [x - 0.38, y + 0.1, 1], '#59606c', 2.5), isoLine([x + 0.38, y - 0.1, 1], [x + 0.38, y + 0.1, 1], '#59606c', 2.5),
        isoLine([x - 0.38, y, 1], [x - 0.38, y, 54], '#59606c', 2.2), isoLine([x + 0.38, y, 1], [x + 0.38, y, 54], '#59606c', 2.2),
        isoLine([x - 0.38, y, 54], [x + 0.38, y, 54], '#59606c', 2.2),
        garment(x - 0.22, '#c9607f', 30), garment(x, '#4f79b8', 36), garment(x + 0.22, '#d9a93f', 26),
      ].join('');
    },
  },
  {
    id: 'briefcase', name: '서류가방', place: 'floor', height: 'low',
    words: ['취업', '채용', '커리어', '이력서', '면접', '인턴', '창업', '스타트업', '부업', '회사', '직무', '직장', '자기소개서'],
    draw: (x, y) => [
      shadow(x, y, 0.75, 0.3),
      cbox(x, y, 0, 0.5, 0.15, 21, '#7a4a25', { top: '#935d31' }),
      frontPanel(x - 0.25, x + 0.25, y + 0.076, 13, 14.5, '#5c3719', ''),
      frontPanel(x - 0.15, x - 0.09, y + 0.077, 11, 16, '#d6b24a'), frontPanel(x + 0.09, x + 0.15, y + 0.077, 11, 16, '#d6b24a'),
      `<path d="${isoPath([[x - 0.09, y, 21], [x - 0.06, y, 27], [x + 0.06, y, 27], [x + 0.09, y, 21]])}" fill="none" stroke="#54321a" stroke-width="2.5"/>`,
    ].join(''),
  },

  // ---------- 책상 위 ----------
  {
    id: 'books', name: '교과서', place: 'desk',
    words: ['교육', '공부', '수업', '강의', '학습', '시험', '과제', '책', '독서', '논문', '스터디', '수강', '교수', '교재', '과외', '언어', '영어', '번역', 'study', 'education', 'lecture', 'course'],
    weak: ['학교', '캠퍼스', '대학', '대학생', '학생'],
    draw: (x, y, z) => [
      shadow(x, y, 0.5, 0.4, 0.16, z),
      cbox(x, y, z, 0.4, 0.28, 5, '#bf4a43', { top: '#d8665f', left: '#f4f1e6' }),
      cbox(x + 0.02, y - 0.01, z + 5, 0.36, 0.26, 4, '#3b6fb5', { top: '#5a8dd0', left: '#f4f1e6' }),
      cbox(x - 0.02, y + 0.01, z + 9, 0.32, 0.23, 4, '#d9a93f', { top: '#ebc362', left: '#f4f1e6' }),
    ].join(''),
  },
  {
    id: 'laptop', name: '노트북', place: 'desk',
    words: ['코드', '코딩', '개발', '프로그래밍', '구현', '깃허브', '서버', '배포', '클라우드', '웹', '웹사이트', '사이트', '홈페이지', '프로토타입', '데이터베이스', '소프트웨어', 'code', 'api', 'server', 'deploy', 'backend', 'frontend', 'react', 'javascript', 'typescript', 'python', 'firebase', 'firestore', 'database', 'github'],
    draw: (x, y, z) => [
      shadow(x, y, 0.6, 0.45, 0.16, z),
      cbox(x, y, z, 0.48, 0.34, 2, '#b9c0ca', { top: '#d6dbe2' }),
      poly([[x - 0.17, y - 0.1, z + 2.2], [x + 0.17, y - 0.1, z + 2.2], [x + 0.17, y + 0.04, z + 2.2], [x - 0.17, y + 0.04, z + 2.2]], '#3d4350'),
      frontPanel(x - 0.24, x + 0.24, y - 0.17, z + 2, z + 21, '#2a2f39'), frontPanel(x - 0.21, x + 0.21, y - 0.169, z + 4, z + 19, '#1d3550', ''),
      isoLine([x - 0.17, y - 0.168, z + 15], [x + 0.02, y - 0.168, z + 15], '#7fd0ff', 1.2), isoLine([x - 0.13, y - 0.168, z + 12], [x + 0.11, y - 0.168, z + 12], '#9be3b0', 1.2), isoLine([x - 0.13, y - 0.168, z + 9], [x + 0.05, y - 0.168, z + 9], '#f3c97a', 1.2),
    ].join(''),
  },
  {
    id: 'phone', name: '휴대폰', place: 'desk',
    words: ['앱', '어플', '모바일', '휴대폰', '스마트폰', '알림', '푸시', '채팅', '메시지', '카톡', 'sns', 'mobile', 'app', 'pwa', 'notification', 'push', 'chat'],
    draw: (x, y, z) => [
      shadow(x, y, 0.28, 0.2, 0.2, z),
      cbox(x, y + 0.03, z, 0.16, 0.12, 2, '#59606c'),
      // 거치대에 기대 세운 휴대폰
      poly([[x - 0.07, y - 0.03, z + 2], [x + 0.07, y - 0.03, z + 2], [x + 0.07, y - 0.08, z + 19], [x - 0.07, y - 0.08, z + 19]], '#171a21', OUTLINE),
      poly([[x - 0.06, y - 0.031, z + 3.5], [x + 0.06, y - 0.031, z + 3.5], [x + 0.06, y - 0.078, z + 18], [x - 0.06, y - 0.078, z + 18]], '#4fa3e0'),
      poly([[x - 0.04, y - 0.045, z + 9], [x + 0.04, y - 0.045, z + 9], [x + 0.04, y - 0.06, z + 14], [x - 0.04, y - 0.06, z + 14]], '#e8f4ff'),
    ].join(''),
  },
  {
    id: 'robot', name: '로봇 피규어', place: 'desk',
    words: ['ai', '인공지능', '챗봇', '머신러닝', '딥러닝', '자동화', '로봇', '자연어', '알고리즘', 'chatbot', 'robot'], // 도구 이름(GPT·Claude 등)은 주제가 아니라 빼 둔다 (AI_TOOL_WORDS)
    draw: (x, y, z) => [
      shadow(x, y, 0.3, 0.26, 0.2, z),
      cbox(x - 0.05, y, z, 0.05, 0.06, 4, '#59606c'), cbox(x + 0.05, y, z, 0.05, 0.06, 4, '#59606c'),
      cbox(x, y, z + 4, 0.2, 0.14, 10, '#c3cad4', { top: '#dde2e9' }),
      frontPanel(x - 0.05, x + 0.05, y + 0.071, z + 7, z + 12, '#3f8fd1', ''),
      cbox(x, y, z + 14, 0.24, 0.17, 11, '#e4e8ee', { top: '#f3f5f8' }),
      frontPanel(x - 0.09, x + 0.09, y + 0.086, z + 16, z + 23, '#20242c', ''),
      isoDot(x - 0.045, y + 0.087, z + 20, 1.5, 1.5, '#6fe3ff'), isoDot(x + 0.045, y + 0.087, z + 20, 1.5, 1.5, '#6fe3ff'),
      isoLine([x, y, z + 25], [x, y, z + 30], '#7a818d', 1.2), isoDot(x, y, z + 31, 1.7, 1.7, '#ef5350'),
    ].join(''),
  },
  {
    id: 'coffee', name: '커피잔', place: 'desk',
    words: ['카페', '커피', '음료', '라떼', '디저트'],
    draw: (x, y, z) => {
      const [cx, cy] = iso(x, y, z + 15);
      return [
        shadow(x, y, 0.22, 0.22, 0.22, z),
        `<path d="M${cx + 6},${cy + 4} a4.5,4.5 0 1 1 0,8" transform="translate(0,0)" fill="none" stroke="#e7e9ee" stroke-width="2.2"/>`,
        cyl(x, y, z, 6.5, 15, '#f4f4f0', { top: '#f4f4f0' }),
        `<ellipse cx="${cx}" cy="${cy}" rx="5" ry="2.5" fill="#6e4426"/>`,
        `<path d="M${cx - 2},${cy - 4} q-2,-3 0,-6 q2,-3 0,-6" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>`,
        `<path d="M${cx + 2},${cy - 3} q-2,-3 0,-5 q2,-3 0,-5" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.2" stroke-linecap="round"/>`,
      ].join('');
    },
  },
  {
    id: 'bento', name: '도시락', place: 'desk',
    words: ['음식', '요리', '레시피', '밀키트', '반찬', '식사', '급식', '배달', '식당', '먹거리', '푸드', '맛집', '식단'],
    draw: (x, y, z) => {
      const cell = (x0, x1, y0, y1, fill) => poly([[x0, y0, z + 6.2], [x1, y0, z + 6.2], [x1, y1, z + 6.2], [x0, y1, z + 6.2]], fill, 'stroke="#7a2a2a" stroke-opacity=".5"');
      return [
        shadow(x, y, 0.5, 0.36, 0.16, z),
        cbox(x, y, z, 0.44, 0.3, 6, '#a8322e', { top: '#3a1d1a' }),
        cell(x - 0.2, x - 0.01, y - 0.13, y + 0.13, '#f7f4ea'),
        isoDot(x - 0.1, y, z + 6.6, 3, 1.6, '#c9463f'),
        cell(x + 0.01, x + 0.2, y - 0.13, y, '#7cb95f'),
        cell(x + 0.01, x + 0.2, y, y + 0.13, '#eea63c'),
      ].join('');
    },
  },
  {
    id: 'piggy', name: '돼지저금통', place: 'desk',
    words: ['예산', '비용', '돈', '가격', '용돈', '결제', '저축', '절약', '할인', '금융', '투자', '은행', '가계부', '핀테크', '식비', '수입'],
    draw: (x, y, z) => {
      const [cx, cy] = iso(x, y, z + 11);
      const pink = '#efa3bc';
      return [
        shadow(x, y, 0.36, 0.28, 0.2, z),
        cbox(x - 0.09, y + 0.05, z, 0.04, 0.04, 4, '#d57f9b'), cbox(x + 0.09, y + 0.05, z, 0.04, 0.04, 4, '#d57f9b'), cbox(x - 0.09, y - 0.05, z, 0.04, 0.04, 4, '#d57f9b'), cbox(x + 0.09, y - 0.05, z, 0.04, 0.04, 4, '#d57f9b'),
        `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="9.5" fill="${pink}" ${OUTLINE}/><ellipse cx="${cx}" cy="${cy}" rx="13" ry="9.5" fill="url(#brRound)"/>`,
        `<ellipse cx="${cx + 11}" cy="${cy + 2}" rx="3.4" ry="4" fill="#e58aa8" ${OUTLINE}/>`,
        `<polygon points="${cx + 4},${cy - 8} ${cx + 7},${cy - 12} ${cx + 8.5},${cy - 6.5}" fill="#e58aa8"/>`,
        `<circle cx="${cx + 6.5}" cy="${cy - 2.5}" r="1.1" fill="#2a2030"/>`,
        `<rect x="${cx - 4}" y="${cy - 9.6}" width="7" height="1.6" fill="#7b4158" rx=".8"/>`,
        // 넣는 동전
        `<ellipse cx="${cx - 0.5}" cy="${cy - 13}" rx="3.2" ry="4" fill="#efc23f" stroke="#a97c10" stroke-width=".7"/>`,
      ].join('');
    },
  },
  {
    id: 'firstaid', name: '구급상자', place: 'desk',
    words: ['의료', '병원', '진료', '약', '약국', '간호', '응급', '치료', '처방', '수면', '정신건강'],
    draw: (x, y, z) => [
      shadow(x, y, 0.42, 0.3, 0.18, z),
      cbox(x, y, z, 0.36, 0.22, 16, '#f4f5f2', { top: '#ffffff' }),
      frontPanel(x - 0.03, x + 0.03, y + 0.111, z + 3, z + 13, '#d6403a', ''), frontPanel(x - 0.09, x + 0.09, y + 0.111, z + 6, z + 10, '#d6403a', ''),
      `<path d="${isoPath([[x - 0.06, y, z + 16], [x - 0.04, y, z + 20], [x + 0.04, y, z + 20], [x + 0.06, y, z + 16]])}" fill="none" stroke="#59606c" stroke-width="2"/>`,
    ].join(''),
  },
  {
    id: 'papers', name: '서류 더미', place: 'desk',
    words: ['보고서', '리포트', '설문', '리서치', '기획서', '회의록', '노션', '초안', '문헌', 'docs', 'doc', 'readme', 'document', 'report', 'ssrd', 'erd'],
    weak: ['자료', '문서', '조사', '기록', '메모', '정리', 'notes'],
    draw: (x, y, z) => [
      shadow(x, y, 0.46, 0.34, 0.14, z),
      cbox(x - 0.01, y, z, 0.36, 0.27, 2, '#f7f7f2'), cbox(x + 0.02, y - 0.01, z + 2, 0.36, 0.27, 2, '#ecefe9'), cbox(x, y + 0.01, z + 4, 0.36, 0.27, 2, '#ffffff'),
      isoLine([x - 0.11, y - 0.07, z + 6.3], [x + 0.11, y - 0.07, z + 6.3], '#aab2bd', 1), isoLine([x - 0.11, y, z + 6.3], [x + 0.11, y, z + 6.3], '#aab2bd', 1), isoLine([x - 0.11, y + 0.07, z + 6.3], [x + 0.03, y + 0.07, z + 6.3], '#aab2bd', 1),
      cbox(x - 0.14, y - 0.12, z + 6, 0.06, 0.04, 1.5, '#3b424d'),
      isoLine([x + 0.06, y + 0.16, z + 7], [x + 0.2, y + 0.04, z + 7], '#2f6bc4', 2),
    ].join(''),
  },
  {
    id: 'trophy', name: '트로피', place: 'desk',
    words: ['성공', '달성', '우승', '수상', '1등', '대회', '공모전', '장학금', '상금'],
    draw: (x, y, z) => {
      const [cx, cy] = iso(x, y, z + 20);
      return [
        shadow(x, y, 0.28, 0.28, 0.22, z),
        cbox(x, y, z, 0.2, 0.2, 5, '#4a2f1b', { top: '#5c3b24' }),
        cyl(x, y, z + 5, 2.2, 8, '#c99b26', { top: '#c99b26' }),
        `<path d="M${cx - 8},${cy - 7} q-6,1 -5,5 q1,5 8,6 M${cx + 8},${cy - 7} q6,1 5,5 q-1,5 -8,6" fill="none" stroke="#d7a92c" stroke-width="1.8"/>`,
        cyl(x, y, z + 13, 3, 14, '#e8bd3a', { r2: 8.5, top: '#fbe28a' }),
      ].join('');
    },
  },
  {
    id: 'gamepad', name: '게임패드', place: 'desk',
    words: ['게임', '레벨', '포인트', '보상', '챌린지', '배지', '게이미피케이션', '놀이'],
    draw: (x, y, z) => {
      const [cx, cy] = iso(x, y, z + 4);
      return shadow(x, y, 0.4, 0.26, 0.18, z) + `
        <path d="M${cx - 15},${cy + 3} C${cx - 16},${cy - 5} ${cx - 8},${cy - 7} ${cx - 3},${cy - 5} L${cx + 3},${cy - 5} C${cx + 8},${cy - 7} ${cx + 16},${cy - 5} ${cx + 15},${cy + 3} C${cx + 14},${cy + 8} ${cx + 9},${cy + 7} ${cx + 6},${cy + 3} L${cx - 6},${cy + 3} C${cx - 9},${cy + 7} ${cx - 14},${cy + 8} ${cx - 15},${cy + 3} Z" fill="#3c4252" stroke="#1b1b2a" stroke-opacity=".5"/>
        <rect x="${cx - 11}" y="${cy - 2.2}" width="6.4" height="2" fill="#c8ced8"/><rect x="${cx - 8.8}" y="${cy - 4.2}" width="2" height="6" fill="#c8ced8"/>
        <circle cx="${cx + 6}" cy="${cy - 2.5}" r="1.5" fill="#ef5350"/><circle cx="${cx + 10}" cy="${cy - 0.8}" r="1.5" fill="#4fc3f7"/>`;
    },
  },
  {
    id: 'globe', name: '지구본', place: 'desk',
    words: ['여행', '관광', '해외', '세계', '글로벌', '국제', '숙소', '항공', '유학', '외국'],
    draw: (x, y, z) => {
      const [cx, cy] = iso(x, y, z + 20);
      return [
        shadow(x, y, 0.28, 0.28, 0.22, z),
        cyl(x, y, z, 6, 2.5, '#6a4426', { top: '#7e5430' }),
        cbox(x, y, z + 2.5, 0.03, 0.03, 6, '#a58a3a'),
        `<circle cx="${cx}" cy="${cy}" r="11" fill="#4c8fd1" ${OUTLINE}/>`,
        `<path d="M${cx - 7},${cy - 6} q4,-3 7,-1 q2,3 -2,5 q-3,3 -6,0 Z M${cx + 2},${cy + 2} q5,-1 6,2 q-1,4 -5,4 q-3,-3 -1,-6 Z M${cx + 3},${cy - 8} q3,0 4,2 l-3,1 Z" fill="#6fb36a"/>`,
        `<circle cx="${cx}" cy="${cy}" r="11" fill="url(#brRound)"/>`,
        `<path d="M${cx - 2},${cy - 14} A14,14 0 0 1 ${cx + 2},${cy + 13}" fill="none" stroke="#a58a3a" stroke-width="1.5"/>`,
      ].join('');
    },
  },
  {
    id: 'microscope', name: '현미경', place: 'desk',
    words: ['연구', '실험', '과학', '우주', '화학', '생물', '분석실', '논문연구'],
    draw: (x, y, z) => [
      shadow(x, y, 0.36, 0.28, 0.2, z),
      cbox(x, y, z, 0.28, 0.2, 3, '#3a404c', { top: '#4b5260' }),
      `<path d="${isoPath([[x + 0.08, y, z + 3], [x + 0.11, y, z + 15], [x + 0.03, y, z + 25]])}" fill="none" stroke="#e7e9ee" stroke-width="4" stroke-linecap="round"/>`,
      cbox(x - 0.02, y, z + 9, 0.16, 0.12, 1.5, '#20242c', { top: '#59606c' }),
      isoLine([x - 0.05, y, z + 13], [x + 0.02, y, z + 28], '#20242c', 4.5), isoLine([x + 0.02, y, z + 28], [x + 0.035, y, z + 31], '#8a93a1', 4.5),
    ].join(''),
  },

  // ---------- 벽 (왼쪽 벽은 at = 가운데 y) ----------
  {
    id: 'calendar', name: '벽 달력', place: 'wall', wall: 'back',
    words: ['일정', '마감', '기한', '스케줄', '다음주', '이번주', '로드맵', '데드라인', '날짜', '주차별', 'schedule', 'deadline', 'calendar', 'sprint', 'milestone'],
    weak: ['계획'],
    draw: () => {
      let s = wallRectY(2.72, 3.1, 68, 106, '#ffffff', OUTLINE) + wallRectY(2.72, 3.1, 97, 106, '#d6403a');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += wallRectY(2.75 + c * 0.085, 2.81 + c * 0.085, 71 + r * 6, 75 + r * 6, r === 1 && c === 2 ? '#ef8f8a' : '#d4d9e0');
      return s;
    },
  },
  {
    id: 'map', name: '지도 포스터', place: 'wall', wall: 'left',
    words: ['지도', '위치', '장소', '동네', '지역', '길찾기', '길', 'map', 'location'],
    draw: (at = 0.5) => {
      const y = at - 0.35;
      return [
        wallRectX(y - 0.03, y + 0.73, 67, 111, '#5c3b24', OUTLINE), wallRectX(y, y + 0.7, 70, 108, '#b9dcf0'),
        wallRectX(y + 0.08, y + 0.34, 84, 102, '#9bcf8f'), wallRectX(y + 0.42, y + 0.62, 74, 90, '#9bcf8f'),
        wallRectX(y + 0.34, y + 0.42, 70, 108, '#f3e7c8'), wallRectX(y, y + 0.7, 86, 89, '#f3e7c8'),
        wallRectX(y + 0.47, y + 0.53, 80, 87, '#d6403a'),
      ].join('');
    },
  },
  {
    id: 'dartboard', name: '다트판', place: 'wall', wall: 'left',
    words: ['퀘스트', '미션', '타겟', '타깃', 'kpi', 'okr'],
    weak: ['목표', '주제', '방향', '핵심'],
    draw: (at = 0.5) => {
      const [cx, cy] = iso(0, at, 90);
      return [15, 12, 8, 4.5, 1.8].map((r, i) => `<circle cx="0" cy="0" r="${r}" fill="${['#2a2118', '#20242c', '#f1ecdd', '#c8473d', '#2f8f5b'][i]}" ${i === 0 ? OUTLINE : ''}/>`).join('').replace(/^/, `<g transform="matrix(.85,-.42,0,1,${cx},${cy})">`) + '</g>'
        + `<line x1="${cx + 11}" y1="${cy - 12}" x2="${cx + 1}" y2="${cy - 1}" stroke="#2b303b" stroke-width="1.5" stroke-linecap="round"/><polygon points="${cx + 11},${cy - 12} ${cx + 15},${cy - 13} ${cx + 12},${cy - 16}" fill="#d9a93f"/>`;
    },
  },
  {
    id: 'clock', name: '벽시계', place: 'wall', wall: 'left',
    words: ['시간', '타이머', '시각', '속도', '시간표', '출근'],
    draw: (at = 0.5) => {
      const [cx, cy] = iso(0, at, 92);
      return `<g transform="matrix(.85,-.42,0,1,${cx},${cy})">
        <circle cx="0" cy="0" r="14" fill="#2b303b" ${OUTLINE}/><circle cx="0" cy="0" r="12" fill="#fbfaf5"/>
        ${[0, 3, 6, 9].map(h => { const a = h * Math.PI / 6; return `<rect x="${Math.sin(a) * 9.5 - 0.6}" y="${-Math.cos(a) * 9.5 - 1.2}" width="1.2" height="2.4" fill="#2b303b"/>`; }).join('')}
        <line x1="0" y1="0" x2="0" y2="-8.5" stroke="#20242c" stroke-width="1.5" stroke-linecap="round"/><line x1="0" y1="0" x2="5.5" y2="2.5" stroke="#20242c" stroke-width="2" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="1.3" fill="#c8473d"/></g>`;
    },
  },
];

// 이젤: 다리 셋 + 앞을 보는 판 + 받침대
function easel(x, y, art) {
  return [
    shadow(x, y, 0.8, 0.5, 0.12),
    isoLine([x, y - 0.03, 62], [x, y - 0.28, 0], '#7a5230', 2.5),
    frontPanel(x - 0.26, x + 0.26, y, 22, 58, '#fdfcf8'),
    ...art,
    cbox(x, y + 0.03, 20, 0.56, 0.07, 2.5, '#94683f'),
    isoLine([x - 0.17, y + 0.03, 62], [x - 0.3, y + 0.14, 0], '#94683f', 2.5), isoLine([x + 0.17, y + 0.03, 62], [x + 0.3, y + 0.14, 0], '#94683f', 2.5),
  ].join('');
}

const DECOR_BY_ID = Object.fromEntries(DECOR.map(d => [d.id, d]));

// 키워드 → 가장 잘 맞는 물건. 앞에서 처음 걸리는 물건이 아니라 가장 길게(구체적으로) 맞는 단어의 물건을 고른다
// (주차장 → 자전거, 재활용품 → 분리수거함, 데이터베이스 → 노트북(데이터가 아니라)).
// 한국어는 부분 일치, 한 글자는 정확히 같을 때만, 영어는 단어 단위로만 (build 안의 ui 같은 우연한 일치를 막는다).
// weak = 어느 프로젝트에나 나오는 말(정리·수정·팀·학교 등): 그 기록에 더 구체적인 키워드가 없을 때만 물건이 된다.
function decorMatch(word) {
  const w = String(word || '').toLowerCase().trim();
  if (w.length < 2) return null;
  if (/\d\s*주차/.test(w)) return { decor: DECOR_BY_ID.calendar, weak: false, len: w.length }; // '3주차'는 주차장이 아니라 일정
  const latinParts = w.split(/[^a-z0-9]+/).filter(Boolean);
  const hit = k => {
    if (/^[a-z0-9]+$/.test(k)) return latinParts.includes(k) ? k.length : 0;
    if (k.length === 1) return w === k ? 1 : 0;
    if (w === k) return k.length + 0.5; // 정확히 같으면 먼저
    if (w.includes(k)) return k.length;
    // 키워드가 사전 단어의 조각일 때는 거의 다 같을 때만 ('개인정보'의 '정보'로 금고가 되지 않게)
    return k.includes(w) && w.length >= k.length - 1 ? w.length : 0;
  };
  let best = null;
  DECOR.forEach(d => {
    const check = (list, weak) => (list || []).forEach(k => {
      const len = hit(k);
      if (len && (!best || len > best.len)) best = { decor: d, weak, len };
    });
    check(d.words, false);
    check(d.weak, true);
  });
  return best;
}

function decorFor(word) {
  return decorMatch(word)?.decor || null;
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
  const [cx, cy] = iso(x, y, 50);
  return [
    shadow(x, y, 0.5, 0.5),
    cyl(x, y, 0, 9, 2, '#2b303b', { top: '#3b424f' }),
    cbox(x, y, 2, 0.035, 0.035, 42, '#8a93a1'),
    cbox(x, y, 44, 0.05, 0.05, 3, '#2b303b'),
    `<ellipse cx="${cx}" cy="${cy}" rx="4.6" ry="6" fill="#59606c" ${OUTLINE}/><ellipse cx="${cx}" cy="${cy}" rx="4.6" ry="6" fill="url(#brRound)"/>`,
    `<line x1="${cx - 4}" y1="${cy - 1}" x2="${cx + 4}" y2="${cy - 1}" stroke="#2b303b" stroke-width=".8"/><line x1="${cx - 4}" y1="${cy + 2}" x2="${cx + 4}" y2="${cy + 2}" stroke="#2b303b" stroke-width=".8"/>`,
    n > 1 ? `<circle cx="${cx + 7}" cy="${cy - 7}" r="2" fill="#ef5350"/>` : '',
  ].join('');
}

// 자동 분류된 주제(js/themes.js) → 물품
const THEME_DECOR = {
  eco: 'plant', food: 'bento', edu: 'books', money: 'piggy', health: 'gym', travel: 'globe', music: 'speaker', game: 'gamepad',
  ai: 'chart', pet: 'pet', fashion: 'rack', mobility: 'bike', home: 'sofa', social: 'beanbag', commerce: 'bags', energy: 'solar',
  farm: 'plant', science: 'microscope', media: 'camera', art: 'art', welfare: 'donation', safety: 'safe', career: 'briefcase', sports: 'gym',
};

// AI 도구 이름은 '무엇을 썼는지'일 뿐 아이디어 주제가 아니다 → 물품을 고르는 키워드에서 뺀다
// (AI 대화를 담을 때마다 로봇만 늘어나지 않게. 'AI 챗봇 서비스'처럼 내용이 AI를 다루면 '인공지능·챗봇' 등으로 여전히 로봇이 된다)
const AI_TOOL_WORDS = new Set(['gpt', 'chatgpt', '챗gpt', '챗지피티', '지피티', 'claude', '클로드', 'gemini', '제미나이', 'openai', '오픈ai', 'llm', 'copilot', '코파일럿', 'perplexity', '퍼플렉시티']);

function isAiToolWord(word) {
  const w = (word || '').toLowerCase().replace(/[\s\-_.]/g, '');
  return AI_TOOL_WORDS.has(w) || /^(gpt|claude|gemini)\d/.test(w);
}

// AI 대화·검색은 도구를 쓴 흔적이라 'ai'라는 말 자체도 주제로 보지 않는다
function decorWords(item, words) {
  const viaTool = item.type === 'ai' || item.type === 'search';
  return words.filter(w => !isAiToolWord(w) && !(viaTool && /^(ai|에이아이)$/i.test(String(w).trim())));
}

// 기록 하나가 어떤 물품으로 이어지는지 → Map(물품 id → 그 물품이 된 키워드들)
// 기록 속 키워드가 먼저, 주제 분류는 키워드로 물품이 하나도 안 나올 때만 채운다
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
  const before = out.size;
  const matches = decorWords(item, words).map(w => [w, decorMatch(w)]).filter(([, m]) => m);
  // 구체적인 키워드가 있으면 흔한 말은 물건이 되지 않는다
  const strong = matches.filter(([, m]) => !m.weak);
  (strong.length ? strong : matches).forEach(([w, m]) => add(m.decor.id, w));
  if (out.size === before) {
    const viaTool = item.type === 'ai' || item.type === 'search';
    (item.themes || []).filter(t => !(viaTool && t === 'ai')).forEach(t => add(THEME_DECOR[t], THEME_BY_ID[t]?.name));
  }
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
