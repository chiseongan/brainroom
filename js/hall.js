// 회의실 씬 (2.5D). 벽에 팀원별 방 문이 있고, 가운데 테이블 위에는 회의에 올라온 자료가 놓인다.
// 로그인한 팀원(state.meId)은 자리에 앉히지 않고, player.js가 방향키로 움직이는 캐릭터로 그린다.

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

// 의자 등받이가 붙는 바깥쪽 방향 (테이블 중심 기준)
function seatFace(s) {
  const cx = TABLE.x + TABLE.w / 2, cy = TABLE.y + TABLE.d / 2;
  const dx = s.x - cx, dy = s.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'back' : 'front';
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

// 방 크기·테이블·문 위치를 player.js가 쓴다. 문 앞 바닥칸(threshold) 좌표까지 계산해 준다.
function hallGeometry() {
  const slots = doorSlots(state.members.length);
  const doors = state.members.map((m, i) => {
    const s = slots[i];
    const th = s.wall === 'y'
      ? { x: s.at + 0.55, y: 1.15 }          // 뒷벽 문: 문 안쪽 바닥칸
      : { x: 1.15, y: s.at - 0.55 };          // 왼쪽 벽 문
    return { memberId: m.id, name: m.name, color: m.color, wall: s.wall, x: th.x, y: th.y };
  });
  return { W: HALL_W, D: HALL_D, H: HALL_H, table: { ...TABLE }, doors };
}

function tableSVG() {
  const T = TABLE, leg = '#6d4a2b';
  const Z = T.h + 1.6;
  const papers = tableItems().slice(0, 14).map(it => {
    const px = T.x + 0.2 + (it.table.x / 82) * (T.w - 0.9);
    const py = T.y + 0.2 + (it.table.y / 80) * (T.d - 0.7);
    const col = member(it.memberId).color;
    return `<g><title>${esc(it.title)}</title>
      ${poly([[px, py, Z], [px + 0.5, py, Z], [px + 0.5, py + 0.4, Z], [px, py + 0.4, Z]], '#ffffff', OUTLINE)}
      ${poly([[px, py, Z + 0.5], [px + 0.5, py, Z + 0.5], [px + 0.5, py + 0.08, Z + 0.5], [px, py + 0.08, Z + 0.5]], col)}
    </g>`;
  }).join('');
  const [cx, cy] = iso(T.x + T.w / 2, T.y + T.d / 2, T.h);
  return `<g id="hallTable" class="table-g" data-scroll="board">
    <title>테이블 보드 열기</title>
    ${shadow(T.x + T.w / 2, T.y + T.d / 2, 3.4, 2.2, 0.18)}
    ${box(T.x + 0.18, T.y + 0.18, 0, 0.22, 0.22, T.h - 2, leg)}
    ${box(T.x + T.w - 0.4, T.y + T.d - 0.4, 0, 0.22, 0.22, T.h - 2, leg)}
    ${box(T.x + 0.18, T.y + T.d - 0.4, 0, 0.22, 0.22, T.h - 2, leg)}
    ${box(T.x + T.w - 0.4, T.y + 0.18, 0, 0.22, 0.22, T.h - 2, leg)}
    ${box(T.x, T.y, T.h - 8, T.w, T.d, 7, '#9c6f41', { top: '#b6894f' })}
    ${box(T.x - 0.06, T.y - 0.06, T.h - 1, T.w + 0.12, T.d + 0.12, 2.4, '#b58150', { top: '#caa06a' })}
    ${poly([[T.x + 0.5, T.y + 0.5, T.h + 1.42], [T.x + T.w - 0.5, T.y + 0.5, T.h + 1.42], [T.x + T.w - 0.5, T.y + T.d - 0.5, T.h + 1.42], [T.x + 0.5, T.y + T.d - 0.5, T.h + 1.42]], 'none', 'stroke="#7a5329" stroke-opacity=".35" fill="none" stroke-width="1"')}
    ${poly([[T.x + 0.25, T.y + 0.25, T.h + 1.44], [T.x + T.w * 0.52, T.y + 0.25, T.h + 1.44], [T.x + T.w * 0.34, T.y + T.d - 0.25, T.h + 1.44], [T.x + 0.25, T.y + T.d - 0.25, T.h + 1.44]], '#ffffff', 'opacity=".1"')}
    ${papers}
    ${tableItems().length ? '' : `<text x="${cx}" y="${cy - 4}" font-size="11" fill="#fff" text-anchor="middle" font-family="${PIXEL_FONT}">자료를 올려주세요</text>`}
  </g>`;
}

function hallHTML() {
  const wall = '#f0ebe0';
  const slots = doorSlots(state.members.length);

  const objects = [
    { key: TABLE.x + TABLE.w / 2 + TABLE.y + TABLE.d / 2, svg: tableSVG() },
    { key: 1.4, svg: palm(0.7, 0.7, 1.1) },
    { key: 11.8, svg: palm(HALL_W - 0.7, 0.7, 1.1) },
    { key: 9.8, svg: palm(0.7, HALL_D - 0.7, 1.1) },
    { key: 8.0, svg: floorLamp(HALL_W - 0.6, 4, true) },
    { key: 6.5, svg: floorLamp(0.6, 6, true) },
  ];
  // 좌석마다 바퀴 의자. 로그인한 '나'의 자리는 비워 둔다(걸어다니는 캐릭터로 나오니까).
  state.members.slice(0, SEATS.length).forEach((m, i) => {
    const s = SEATS[i];
    const face = seatFace(s);
    objects.push({ key: s.x + s.y - 0.03, svg: officeChair(s.x, s.y, face, mix(m.color, '#3b4150', 0.72)) });
    if (m.id === state.meId) return;
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
    woodFloor(HALL_W, HALL_D, '#c29a6c', 41),
    walls(HALL_W, HALL_D, HALL_H, wall),
    // 벽 장식: 문(z≤126) 위쪽 빈 띠와 모서리에만 둬서 문과 겹치지 않게 한다
    wallTextY(0.3, HALL_H - 20, `${state.teamName} 회의실`, 13, '#5c4a38', 700),
    wallArtY(9.9, 11.2, HALL_H - 42, HALL_H - 22, '#9ec5e8'),
    wallMonitorX(2.2, HALL_H - 30, 4, 20),
    wallClockX(8.7, HALL_H - 26, 7.5),
    rug(TABLE.x - 1, TABLE.y - 0.8, TABLE.w + 2, TABLE.d + 1.9, '#4f5ea3', '#3a4680'),
    ceilingGlow(TABLE.x + TABLE.w / 2, TABLE.y + TABLE.d / 2, 3.4, 0.5),
    ceilingGlow(2.6, 2.6, 1.7, 0.3),
    ceilingGlow(HALL_W - 2.6, HALL_D - 2.6, 1.7, 0.3),
    state.members.map((m, i) => doorSVG(m, slots[i])).join(''),
    depthSorted(objects),
  ].join('');

  return `<div class="hall">
    ${isoSVG(HALL_W, HALL_D, HALL_H, scene, '', `${state.teamName} 회의실 그림: 팀원 ${state.members.length}명의 방으로 가는 문과 회의 테이블`)}
    <div class="hall-hint" aria-hidden="true">⌨️ <b>방향키·WASD</b>로 이동 · 문 앞에서 <b>Enter</b>로 입장</div>
  </div>`;
}
