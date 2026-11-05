// 개인 방 씬 (2.5D 아이소메트릭). 미니 카드와 큰 화면에서 같은 SVG를 쓴다.

const ROOM_W = 8, ROOM_D = 7, ROOM_H = 130;
// 키워드 물건 자리. 책상 위는 모니터 양옆, 바닥은 물건의 키에 맞춰 다른 가구를 가리지 않는 곳만 (fit = 놓을 수 있는 키)
const DESK_SLOTS = [{ x: 3.5, y: 3.14 }, { x: 3.36, y: 3.66 }, { x: 5.02, y: 3.16 }, { x: 5.06, y: 3.66 }];
const FLOOR_SLOTS = [
  { x: 2.45, y: 0.55, fit: 'low mid tall' }, { x: 0.55, y: 0.55, fit: 'low mid tall' }, // 창문 아래와 구석 (창 아래 58px까지 비어 있음)
  { x: 7.35, y: 2.1, fit: 'low mid tall' }, { x: 7.35, y: 3.5, fit: 'low mid tall' }, { x: 7.35, y: 4.9, fit: 'low mid tall' }, // 오른쪽 가장자리
  { x: 1.5, y: 0.6, fit: 'low mid' }, // 창문 아래
  { x: 3.85, y: 0.55, fit: 'low mid' }, { x: 5.45, y: 0.55, fit: 'low mid' }, // 화이트보드 아래
  { x: 0.5, y: 2.2, fit: 'low mid' }, // 코르크판 아래
  { x: 7.2, y: 6.3, fit: 'low mid' }, { x: 1.65, y: 6.3, fit: 'low mid' }, // 앞쪽 구석
  { x: 5.7, y: 6.55, fit: 'low' }, { x: 4.2, y: 6.6, fit: 'low' }, { x: 2.85, y: 6.6, fit: 'low' }, // 앞쪽 가장자리 (키 작은 것만)
];
const LEFT_WALL_SPOTS = [0.5, 6.35]; // 왼쪽 벽의 빈자리 (코르크판 앞, 책장 뒤)
const MIC_SPOT = { x: 1.55, y: 2.15 };
const BOOK_COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#8d6cab', '#4d908e', '#d62828'];
const NOTE_COLORS = ['#fff3a3', '#ffd1dc', '#c8f7c5', '#cde7ff'];

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 최근 활동이 없을수록 방이 어두워진다
function roomDarkness(p) {
  if (!p.items.length) return 0.3;
  const hours = (Date.now() - p.last) / 3600000;
  if (hours < 24) return 0;
  if (hours < 72) return 0.12;
  return 0.28;
}

// 벽은 팀원 색이 살짝 도는 따뜻한 흰색, 바닥은 나무. 포인트는 러그·의자·커튼에만 쓴다
function roomColors(m) {
  return {
    wall: mix('#f4eee3', m.color, 0.06),
    wood: '#b98c5e',
    rug: mix(m.color, '#efe6d6', 0.45),
    accent: mix(m.color, '#3a3a44', 0.12),
    curtain: mix(m.color, '#f4eee2', 0.55),
    seed: hashCode(m.id || 'room') % 100000 + 1,
  };
}

// 책장: 왼쪽 벽에 붙어 있고, 앞면(x = x0 + w)에 책이 꽂힌다
function shelfSVG(links) {
  const x0 = 0, y0 = 3.9, w = 0.62, d = 1.9, h = 112;
  const fx = x0 + w;
  const wood = '#7d5433';
  let out = shadow(x0 + w, y0 + d / 2, 0.5, 1.6, 0.16) + box(x0, y0, 0, w, d, h, wood, { top: '#936641' });
  const levels = [86, 60, 34, 8]; // 위 칸부터 채운다
  const SHELF_H = 23;
  levels.forEach((z, row) => {
    const a = y0 + 0.07, b = y0 + d - 0.07;
    // 칸 안쪽(그늘), 선반 앞판
    out += poly([[fx, a, z], [fx, b, z], [fx, b, z + SHELF_H], [fx, a, z + SHELF_H]], '#3b2614');
    out += poly([[fx, a, z + SHELF_H - 3], [fx, b, z + SHELF_H - 3], [fx, b, z + SHELF_H], [fx, a, z + SHELF_H]], '#2b1b0e');
    let by = b - 0.03;
    links.slice(row * 8, row * 8 + 8).forEach(item => {
      const hsh = hashCode(item.id);
      const bh = 15 + (hsh % 6);
      const bw = 0.13 + (hsh % 3) * 0.025;
      const col = BOOK_COLORS[hsh % BOOK_COLORS.length];
      out += `<g><title>${esc(item.title)}</title>${poly([[fx, by - bw, z], [fx, by, z], [fx, by, z + bh], [fx, by - bw, z + bh]], col, OUTLINE)}
        ${poly([[fx, by - bw + 0.03, z + bh - 5], [fx, by - 0.03, z + bh - 5], [fx, by - 0.03, z + bh - 3.5], [fx, by - bw + 0.03, z + bh - 3.5]], '#fff', 'opacity=".55"')}</g>`;
      by -= bw + 0.01;
    });
    // 선반
    out += poly([[fx, a, z - 2.2], [fx, b, z - 2.2], [fx, b, z], [fx, a, z]], '#936641');
  });
  if (links.length > 32) {
    const [tx, ty] = iso(fx, y0 + d / 2, h + 6);
    out += `<text x="${tx}" y="${ty}" font-size="11" fill="#fff" text-anchor="middle" font-family="${PIXEL_FONT}">+${links.length - 32}</text>`;
  }
  return `<g class="zone" data-zone="shelf"><title>책장 · 자료 ${links.length}개</title>${out}</g>`;
}

function whiteboardSVG(p) {
  const x0 = 3.2, x1 = 6.3, z0 = 42, z1 = 112;
  // 아이디어 개수만큼 포스트잇 (글씨 없이). 아이디어를 누르면 내용이 나온다
  const notes = p.ideas.slice(0, 8).map((it, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const nx = x0 + 0.25 + col * 0.72, nz = z1 - 12 - row * 30;
    const tilt = (hashCode(it.id) % 5) - 2;
    return `<g><title>아이디어</title>${wallRectY(nx + 0.03, nx + 0.58, nz - 24 + tilt, nz - 2 + tilt, '#000', 'opacity=".1"')}${wallRectY(nx, nx + 0.55, nz - 22 + tilt, nz + tilt, NOTE_COLORS[(i + 1) % 4], OUTLINE)}
      ${wallRectY(nx + 0.08, nx + 0.45, nz - 8 + tilt, nz - 7 + tilt, '#7c8592')}${wallRectY(nx + 0.08, nx + 0.34, nz - 14 + tilt, nz - 13 + tilt, '#7c8592')}</g>`;
  }).join('');
  // 비어 있어도 쓰던 보드처럼 지운 자국과 낙서가 남아 있다
  const [sx, sy] = iso(x0 + 0.5, 0, z1 - 20);
  const scribble = `<path transform="matrix(1,.5,0,1,${sx},${sy})" d="M0,0 q12,-8 24,0 t24,0 M2,12 h34 M60,-2 l18,0 m-6,-5 l6,5 l-6,5 M2,24 q18,-6 30,0" fill="none" stroke="#7c9ccc" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round"/>`;
  return `<g class="zone" data-zone="whiteboard"><title>화이트보드 · 아이디어 ${p.ideas.length}개</title>
    ${wallRectY(x0 + 0.03, x1 + 0.11, z0 - 7, z1 + 3, '#000', 'opacity=".1"')}
    ${wallRectY(x0 - 0.06, x1 + 0.06, z0 - 4, z1 + 4, '#b5bbc4', OUTLINE)}
    ${wallRectY(x0, x1, z0, z1, '#fbfcfd')}
    ${poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z0 + 18], [x0, 0, z0 + 18]], '#dfe6ee', 'opacity=".5"')}
    ${notes || scribble}
    ${box(x0 + 0.3, 0, z0 - 7, x1 - x0 - 0.6, 0.1, 3, '#8a919c')}
    ${box(x0 + 0.7, 0.02, z0 - 4, 0.28, 0.04, 2, '#c8473d')}${box(x0 + 1.1, 0.02, z0 - 4, 0.28, 0.04, 2, '#2f6bc4')}
  </g>`;
}

function corkSVG(memos) {
  const y0 = 3.3, y1 = 1.0, z0 = 50, z1 = 110; // 왼쪽 벽: 화면 왼쪽 끝이 y0
  let notes = '';
  memos.slice(0, 6).forEach((item, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const ny = y0 - 0.2 - col * 0.72;
    const nz = z1 - 10 - row * 27;
    const tilt = ((hashCode(item.id) % 5) - 2);
    const [px, py] = iso(0, ny - 0.27, nz + tilt - 2);
    notes += `<g><title>${esc(item.title)}</title>${wallRectX(ny - 0.52, ny + 0.03, nz - 22 + tilt, nz - 2 + tilt, '#000', 'opacity=".12"')}${wallRectX(ny - 0.55, ny, nz - 20 + tilt, nz + tilt, NOTE_COLORS[i % 4], OUTLINE)}
      ${wallRectX(ny - 0.46, ny - 0.1, nz - 10 + tilt, nz - 9 + tilt, '#7c8592')}${wallRectX(ny - 0.46, ny - 0.2, nz - 15 + tilt, nz - 14 + tilt, '#7c8592')}
      <circle cx="${px}" cy="${py}" r="1.8" fill="#d6403a"/></g>`;
  });
  return `<g class="zone" data-zone="board"><title>포스트잇 보드 · 메모 ${memos.length}개</title>
    ${wallRectX(y1 - 0.02, y0 + 0.08, z0 - 4, z1 + 2, '#000', 'opacity=".1"')}
    ${wallRectX(y1, y0, z0, z1, '#7d5433', OUTLINE)}
    ${wallRectX(y1 + 0.06, y0 - 0.06, z0 + 3, z1 - 3, '#c9a176')}
    ${notes}
  </g>`;
}

function windowSVG(curtain, lit) {
  const x0 = 0.72, x1 = 2.32, z0 = 58, z1 = 112; // 오른쪽 커튼 옆으로 달력 자리(2.72~)를 남긴다
  const mid = (x0 + x1) / 2;
  const fold = (a, b, c) => wallRectY(a, b, z0 - 16, z1 + 8, c, 'stroke="#1b1b2a" stroke-opacity=".1"');
  const curtains = [
    fold(x0 - 0.3, x0 - 0.2, shade(curtain, -0.1)), fold(x0 - 0.2, x0 - 0.1, curtain), fold(x0 - 0.1, x0 + 0.02, shade(curtain, -0.14)),
    fold(x1 - 0.02, x1 + 0.1, shade(curtain, -0.14)), fold(x1 + 0.1, x1 + 0.2, curtain), fold(x1 + 0.2, x1 + 0.3, shade(curtain, -0.1)),
  ].join('');
  return [
    wallRectY(x0 - 0.08, x1 + 0.08, z0 - 5, z1 + 5, '#fbfaf6', OUTLINE),
    wallRectY(x0, x1, z0, z1, lit ? 'url(#brSky)' : '#54708e'),
    // 창밖 풍경: 먼 언덕과 건물
    poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z0 + 11], [x1 - 0.5, 0, z0 + 16], [mid - 0.1, 0, z0 + 9], [x0 + 0.35, 0, z0 + 17], [x0, 0, z0 + 10]], lit ? '#9cc79a' : '#3f5a58'),
    wallRectY(x1 - 0.42, x1 - 0.2, z0, z0 + 22, lit ? '#c8d2dc' : '#46566a'),
    lit ? wallRectY(x0 + 0.2, x0 + 0.62, z1 - 14, z1 - 9, '#ffffff', 'opacity=".85"') + wallRectY(x0 + 0.34, x0 + 0.8, z1 - 18, z1 - 13, '#ffffff', 'opacity=".7"') : '',
    wallRectY(mid - 0.025, mid + 0.025, z0, z1, '#fbfaf6'),
    wallRectY(x0, x1, (z0 + z1) / 2 - 1.5, (z0 + z1) / 2 + 1.5, '#fbfaf6'),
    // 창틀 아래 선반
    box(x0 - 0.14, 0, z0 - 7, x1 - x0 + 0.28, 0.1, 2.5, '#fbfaf6'),
    // 커튼봉과 커튼
    box(x0 - 0.38, 0.02, z1 + 8, x1 - x0 + 0.76, 0.03, 2, '#5c4a38'),
    curtains,
  ].join('');
}

// 창에서 들어온 햇빛이 바닥에 비친다 (최근 활동이 있을 때)
function sunbeamSVG() {
  const pts = [[0.77, 0.05], [2.27, 0.05], [3.47, 2.75], [1.97, 2.75]];
  return `<g opacity=".8">${poly(pts.map(p => [p[0], p[1], 0.4]), 'url(#brSun)')}
    ${poly([[1.49, 0.05, 0.5], [1.55, 0.05, 0.5], [2.75, 2.75, 0.5], [2.69, 2.75, 0.5]], '#3b2412', 'opacity=".06"')}
  </g>`;
}

// 러그: 테두리와 줄무늬가 있는 천
function rugSVG(color) {
  const x = 2.25, y = 4.2, w = 3.8, d = 2.25;
  const stripes = [0.34, 0.68, 1.02, 1.36, 1.7].map(t => flat(x + 0.22, y + 0.12 + t, w - 0.44, 0.09, shade(color, 0.28), 'opacity=".55"')).join('');
  return [
    flat(x, y, w, d, shade(color, -0.2), 'stroke="#1b1b2a" stroke-opacity=".2"'),
    flat(x + 0.09, y + 0.09, w - 0.18, d - 0.18, color),
    stripes,
  ].join('');
}

function deskSVG(c, lit, aiCount) {
  const dx = 3.0, dy = 2.9, dw = 2.4, dd = 1.0, top = DESK_Z;
  const wood = '#a97849';
  const screen = aiCount ? '#2f7fbe' : lit ? '#1f3a66' : '#252b36';
  const glow = aiCount || lit;
  const [lx, ly] = iso(3.12, 3.06, top + 34);
  const leg = (x, y) => box(x, y, 0, 0.09, 0.09, top - 3, '#7d5433');
  const monitor = `
    ${shadow(4.2, 3.15, 0.4, 0.3, 0.14, top)}
    ${cbox(4.2, 3.15, top, 0.34, 0.2, 1.5, '#3a3f4a', { top: '#4b5260' })}
    ${cbox(4.2, 3.12, top + 1.5, 0.06, 0.05, 9, '#3a3f4a')}
    ${box(3.72, 3.04, top + 10, 0.96, 0.05, 27, '#171a21', { left: '#171a21' })}
    ${poly([[3.75, 3.09, top + 12], [4.65, 3.09, top + 12], [4.65, 3.09, top + 35], [3.75, 3.09, top + 35]], screen)}
    ${glow ? `${poly([[3.75, 3.09, top + 35], [4.2, 3.09, top + 35], [3.95, 3.09, top + 12], [3.75, 3.09, top + 12]], '#fff', 'opacity=".07"')}` : ''}
    ${aiCount ? [0, 1, 2, 3].map(i => poly([[3.84 + (i % 2) * 0.28, 3.091, top + 30 - i * 5], [4.2 + (i % 2) * 0.28, 3.091, top + 30 - i * 5], [4.2 + (i % 2) * 0.28, 3.091, top + 27 - i * 5], [3.84 + (i % 2) * 0.28, 3.091, top + 27 - i * 5]], i % 2 ? '#bfe6ff' : '#e8f6ff', 'opacity=".9"')).join('') : ''}`;
  return `
    ${shadow(dx + dw / 2, dy + dd / 2, 2.1, 0.9, 0.2)}
    ${leg(dx + 0.06, dy + 0.06)}${leg(dx + dw - 0.15, dy + 0.06)}${leg(dx + 0.06, dy + dd - 0.15)}
    ${box(dx + 1.6, dy + 0.05, 0, 0.72, dd - 0.1, top - 3, '#94683f')}
    ${frontPanel(dx + 1.65, dx + 2.27, dy + dd - 0.05, 3, 11, '#a97849')}${frontPanel(dx + 1.65, dx + 2.27, dy + dd - 0.05, 13, 24, '#a97849')}
    ${frontPanel(dx + 1.86, dx + 2.06, dy + dd - 0.049, 7, 8, '#d9d3c5', '')}${frontPanel(dx + 1.86, dx + 2.06, dy + dd - 0.049, 18, 19, '#d9d3c5', '')}
    ${box(dx, dy, top - 3, dw, dd, 3, wood, { top: '#bb8a58' })}
    <g class="zone" data-zone="monitor"><title>모니터 · AI 대화 ${aiCount}개</title>${monitor}</g>
    ${cbox(4.2, 3.62, top, 0.72, 0.2, 1.5, '#e4e7ec', { top: '#f2f4f7' })}
    ${[0, 1, 2].map(r => poly([[3.88, 3.54 + r * 0.055, top + 1.8], [4.52, 3.54 + r * 0.055, top + 1.8], [4.52, 3.58 + r * 0.055, top + 1.8], [3.88, 3.58 + r * 0.055, top + 1.8]], '#c3c9d2')).join('')}
    ${cbox(4.7, 3.62, top, 0.09, 0.14, 2, '#d6dae1', { top: '#eceef2' })}
    ${shadow(3.12, 3.06, 0.2, 0.2, 0.18, top)}
    ${cyl(3.12, 3.06, top, 6, 2, '#3a3f4a', { top: '#4b5260' })}
    <path d="${isoPath([[3.12, 3.06, top + 2], [3.1, 3.06, top + 28], [3.2, 3.1, top + 33]])}" fill="none" stroke="#59606c" stroke-width="2"/>
    ${lit ? `<ellipse cx="${lx + 6}" cy="${ly + 18}" rx="30" ry="22" fill="url(#brGlow)"/>` : ''}
    ${cyl(3.2, 3.1, top + 26, 8, 6, lit ? '#f1cd6b' : '#8a93a1', { r2: 4, top: lit ? '#f7dd92' : '#a2aab6' })}`;
}

// 사무용 의자: 바퀴 받침 + 앉는 부분 + 등받이
function chairSVG(color) {
  const x = 4.2, y = 4.35;
  return `
    ${shadow(x, y, 0.55, 0.55)}
    ${[[-0.2, 0.05], [0.2, -0.05], [0.05, 0.2], [-0.05, -0.2]].map(([a, b]) => isoLine([x, y, 5], [x + a, y + b, 2], '#2b303b', 2.5)).join('')}
    ${cbox(x, y, 3, 0.04, 0.04, 12, '#6a707c')}
    ${cbox(x, y, 15, 0.48, 0.46, 5, color, { top: shade(color, 0.14) })}
    ${cbox(x, y + 0.23, 18, 0.05, 0.05, 12, '#3a3f4a')}
    ${cbox(x, y + 0.25, 28, 0.46, 0.07, 24, color, { top: shade(color, 0.14) })}`;
}

// 모든 기록의 키워드 → 어울리는 물품을 책상·바닥·벽의 빈자리에 놓는다 (글 대신 물품)
// 많이 나온 물건부터 고르되, 자리는 물건 종류 순서로 정해 기록이 하나 늘었다고 방 전체가 뒤섞이지 않게 한다.
function decorPlacement(p) {
  const objects = [];
  const walls = [];
  const wrap = (g, svg) => `<g class="zone prop decor" data-zone="decor:${g.decor.id}"><title>${esc(g.decor.name)} · ${esc(g.words.slice(0, 5).join(', '))} (기록 ${g.count}개)</title>${svg}</g>`;
  const pick = (place, max) => p.decor.filter(g => g.decor.place === place).slice(0, max)
    .sort((a, b) => DECOR.indexOf(a.decor) - DECOR.indexOf(b.decor));

  pick('desk', DESK_SLOTS.length).forEach((g, i) => {
    const s = DESK_SLOTS[i];
    objects.push({ key: 7.61 + i * 0.01, svg: wrap(g, g.decor.draw(s.x, s.y, DESK_Z)) }); // 책상 다음에 그려야 위에 놓인다
  });

  // 키 큰 것부터, 그 키가 들어가는 자리 중 가장 좁은 곳에 (작은 물건이 큰 물건 자리를 먼저 차지하지 않게)
  const free = FLOOR_SLOTS.map(s => ({ ...s, fits: s.fit.split(' ') }));
  const heightOf = g => g.decor.height || 'mid';
  const order = { tall: 0, mid: 1, low: 2 };
  pick('floor', FLOOR_SLOTS.length).sort((a, b) => order[heightOf(a)] - order[heightOf(b)]).forEach(g => {
    let best = -1;
    free.forEach((s, i) => {
      if (s.fits.includes(heightOf(g)) && (best < 0 || s.fits.length < free[best].fits.length)) best = i;
    });
    if (best < 0) return;
    const [s] = free.splice(best, 1);
    objects.push({ key: s.x + s.y, svg: wrap(g, g.decor.draw(s.x, s.y)) });
  });

  // 벽: 뒷벽 달력 자리 하나, 왼쪽 벽 두 자리
  const left = [...LEFT_WALL_SPOTS];
  let backUsed = false;
  p.decor.filter(g => g.decor.place === 'wall').forEach(g => {
    if (g.decor.wall === 'back') {
      if (!backUsed) walls.push(wrap(g, g.decor.draw()));
      backUsed = true;
    } else if (left.length) {
      walls.push(wrap(g, g.decor.draw(left.shift())));
    }
  });

  if (p.talks.length) {
    objects.push({ key: MIC_SPOT.x + MIC_SPOT.y, svg: `<g class="zone prop decor" data-zone="talk"><title>마이크 · 회의 발언 ${p.talks.length}개</title>${micStand(MIC_SPOT.x, MIC_SPOT.y, p.talks.length)}</g>` });
  }
  return { objects, walls };
}

function roomHTML(memberId, { mini = false } = {}) {
  const m = member(memberId);
  const p = profile(memberId);
  const dark = roomDarkness(p);
  const lit = dark === 0;
  const c = roomColors(m);

  const decor = decorPlacement(p);
  const objects = [
    { key: 5.3, svg: shelfSVG(p.links) },
    { key: 7.6, svg: deskSVG(c, lit, p.ais.length) },
    { key: 8.55, svg: chairSVG(c.accent) },
    { key: 7.0, svg: palm(0.65, 6.35, 0.95) },
    ...decor.objects, // 회의에서 한 말 → 마이크 스탠드와 어울리는 사물
    { key: 10.8, svg: avatar(5.9, 4.9, m, { tag: !mini }) },
  ];

  const scene = [
    woodFloor(ROOM_W, ROOM_D, c.wood, c.seed),
    walls(ROOM_W, ROOM_D, ROOM_H, c.wall),
    windowSVG(c.curtain, lit),
    lit ? sunbeamSVG() : '',
    wallDoor({
      wall: 'y', at: 6.55, color: '#7d5a3c', label: '회의실', peek: '🗂️', lit: true,
      title: '회의실로 돌아가기', attrs: 'data-go="meeting"',
    }),
    whiteboardSVG(p),
    corkSVG(p.memos),
    decor.walls.join(''),
    rugSVG(c.rug),
    depthSorted(objects),
  ].join('');

  return `
  <div class="room ${mini ? 'mini' : ''}" style="--mc:${m.color}">
    ${isoSVG(ROOM_W, ROOM_D, ROOM_H, scene, '', mini ? '' : `${m.name}의 방 그림: 자료 ${p.links.length}개, 메모 ${p.memos.length}개, 아이디어 ${p.ideas.length}개, AI 대화 ${p.ais.length}개. 물건: ${p.decor.slice(0, 10).map(g => g.decor.name).join(', ') || '없음'}`)}
    <div class="nameplate">${esc(m.name)}의 방 <b>${activityStatus(p)}</b></div>
    ${p.items.length ? '' : '<div class="room-empty">아직 빈 방이에요<br><small>자료를 담으면 방이 꾸며져요</small></div>'}
    <div class="shade" style="--dark:${dark}"></div>
  </div>`;
}

// 방의 각 구역을 클릭했을 때 보여줄 자료
function zoneItems(memberId, zone) {
  const p = profile(memberId);
  if (zone === 'shelf') return { title: '📚 책장 · 참고 자료', items: p.links };
  if (zone === 'board') return { title: '🗒️ 포스트잇 보드 · 메모', items: p.memos };
  if (zone === 'whiteboard') return { title: '💡 화이트보드 · 아이디어', items: p.ideas };
  if (zone === 'talk') return { title: '🎙️ 마이크 · 회의에서 한 말', items: p.talks };
  if (zone === 'monitor') return { title: '🖥️ 모니터 · AI 대화', items: p.ais, empty: 'AI 대화가 없어요. "내 방에 담기"에서 AI 대화를 붙여넣거나, 내보낸 대화 파일을 불러올 수 있어요.' };
  if (zone.startsWith('decor:')) {
    const g = p.decor.find(x => x.decor.id === zone.slice(6));
    if (!g) return { title: '', items: [] };
    return { title: `${g.decor.name} · ${g.words.slice(0, 6).join(', ')}`, items: [...g.items].sort((a, b) => b.createdAt - a.createdAt) };
  }
  if (zone.startsWith('theme:')) {
    const theme = THEME_BY_ID[zone.slice(6)];
    return { title: `${theme.emoji} ${theme.name} 관련 자료`, items: p.items.filter(i => i.themes.includes(theme.id)) };
  }
  return { title: '', items: [] };
}
