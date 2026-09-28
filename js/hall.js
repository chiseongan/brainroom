// 회의실 씬 (2.5D). 벽에 팀원별 방 문이 있고, 가운데 테이블 위에는 회의에 올라온 자료가 놓인다.

const HALL_W = 12, HALL_D = 10, HALL_H = 150;
const TABLE = { x: 4, y: 3.8, w: 4, d: 2.4, h: 30 };
const SEATS = [
  { x: 3.35, y: 4.5 }, { x: 8.65, y: 4.4 }, { x: 5.2, y: 6.85 }, { x: 6.9, y: 6.85 },
  { x: 3.35, y: 5.6 }, { x: 8.65, y: 5.5 }, { x: 5.2, y: 3.15 }, { x: 6.9, y: 3.15 },
];

// 문 위치: 절반은 뒷벽, 나머지는 왼쪽 벽에 고르게 배치
function doorSlots(n) {
  const back = Math.ceil(n / 2), left = n - back;
  const slots = [];
  for (let i = 0; i < back; i++) slots.push({ wall: 'y', at: 1.4 + (i + 0.5) * (HALL_W - 2.4) / back - 0.55 });
  for (let i = 0; i < left; i++) slots.push({ wall: 'x', at: 1.4 + (i + 0.5) * (HALL_D - 2.4) / left + 0.55 });
  return slots;
}

function doorSVG(m, slot) {
  const p = profile(m.id);
  return wallDoor({
    ...slot,
    color: m.color,
    label: trunc(m.name, 5),
    peek: p.themes[0]?.theme.emoji || '📦',
    lit: roomDarkness(p) === 0,
    title: `${m.name}의 방으로 이동`,
    attrs: `data-go="room" data-member="${m.id}"`,
  });
}

function tableSVG() {
  const T = TABLE;
  const papers = tableItems().slice(0, 14).map(it => {
    const px = T.x + 0.2 + (it.table.x / 82) * (T.w - 0.9);
    const py = T.y + 0.2 + (it.table.y / 80) * (T.d - 0.7);
    const col = member(it.memberId).color;
    return `<g><title>${esc(it.title)}</title>
      ${poly([[px, py, T.h + 0.5], [px + 0.5, py, T.h + 0.5], [px + 0.5, py + 0.4, T.h + 0.5], [px, py + 0.4, T.h + 0.5]], '#ffffff', OUTLINE)}
      ${poly([[px, py, T.h + 1], [px + 0.5, py, T.h + 1], [px + 0.5, py + 0.08, T.h + 1], [px, py + 0.08, T.h + 1]], col)}
    </g>`;
  }).join('');
  const [cx, cy] = iso(T.x + T.w / 2, T.y + T.d / 2, T.h);
  return `<g class="table-g" data-scroll="board">
    <title>테이블 보드 열기</title>
    ${box(T.x + 0.15, T.y + 0.15, 0, 0.2, 0.2, T.h, '#6d4a2b')}
    ${box(T.x + T.w - 0.35, T.y + T.d - 0.35, 0, 0.2, 0.2, T.h, '#6d4a2b')}
    ${box(T.x + 0.15, T.y + T.d - 0.35, 0, 0.2, 0.2, T.h, '#6d4a2b')}
    ${box(T.x + T.w - 0.35, T.y + 0.15, 0, 0.2, 0.2, T.h, '#6d4a2b')}
    ${box(T.x, T.y, T.h - 8, T.w, T.d, 8, '#b98352')}
    ${papers}
    ${tableItems().length ? '' : `<text x="${cx}" y="${cy - 4}" font-size="11" fill="#fff" text-anchor="middle" font-family="${PIXEL_FONT}">자료를 올려주세요</text>`}
  </g>`;
}

function hallHTML() {
  const floorA = '#eef4f7', floorB = '#dde9ef';
  const wall = '#a8ecd4';
  const slots = doorSlots(state.members.length);

  const objects = [
    { key: TABLE.x + TABLE.w / 2 + TABLE.y + TABLE.d / 2, svg: tableSVG() },
    { key: 1.4, svg: palm(0.7, 0.7, 1.1) },
    { key: 11.8, svg: palm(HALL_W - 0.7, 0.7, 1.1) },
    { key: 9.8, svg: palm(0.7, HALL_D - 0.7, 1.1) },
    { key: 8.0, svg: floorLamp(HALL_W - 0.6, 4, true) },
    { key: 6.5, svg: floorLamp(0.6, 6, true) },
  ];
  state.members.slice(0, SEATS.length).forEach((m, i) => {
    const s = SEATS[i];
    const p = profile(m.id);
    objects.push({
      key: s.x + s.y,
      svg: avatar(s.x, s.y, m, {
        bubble: p.themes[0]?.theme.emoji || '💭',
        attrs: `data-go="room" data-member="${m.id}" style="animation-delay:${i * -0.4}s"`,
      }),
    });
  });

  const scene = [
    floorTiles(HALL_W, HALL_D, floorA, floorB),
    walls(HALL_W, HALL_D, HALL_H, wall),
    wallTextY(0.3, HALL_H - 22, `${state.teamName} 회의실`, 13, '#2f6f5a', 700),
    state.members.map((m, i) => doorSVG(m, slots[i])).join(''),
    flat(3.2, 3.0, 5.6, 4.4, '#9ad0c2', 'opacity=".45"'),
    depthSorted(objects),
  ].join('');

  return `<div class="hall">${isoSVG(HALL_W, HALL_D, HALL_H, scene)}</div>`;
}
