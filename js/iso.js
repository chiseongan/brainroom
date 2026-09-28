// 아이소메트릭(2.5D) SVG 그리기 도구.
// 좌표: x → 화면 오른쪽 아래, y → 화면 왼쪽 아래 (타일 단위), z → 위쪽 (px). 타일 1칸 = 64×32px.
// 뒷벽은 y=0 평면, 왼쪽 벽은 x=0 평면에 붙어 있다.

const TW = 64, TH = 32;
const OUTLINE = 'stroke="#1b1b2a" stroke-opacity=".35" stroke-width="1" stroke-linejoin="round"';
const PIXEL_FONT = "Galmuri11, 'Malgun Gothic', sans-serif";

function iso(x, y, z = 0) {
  return [(x - y) * TW / 2, (x + y) * TH / 2 - z];
}

function ptsStr(points) {
  return points.map(p => iso(...p).map(n => n.toFixed(1)).join(',')).join(' ');
}

function poly(points, fill, extra = '') {
  return `<polygon points="${ptsStr(points)}" fill="${fill}" ${extra}/>`;
}

// ---------- 색 ----------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

function shade(hex, amt) {
  return amt < 0 ? mix(hex, '#000000', -amt) : mix(hex, '#ffffff', amt);
}

function trunc(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------- 기본 도형 ----------

// 직육면체. 보이는 면은 윗면, 왼쪽 앞면(y+d), 오른쪽 앞면(x+w) 세 개.
function box(x, y, z, w, d, h, color, { top, left, right, attrs = '' } = {}) {
  return `<g ${attrs}>
    ${poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], left ?? shade(color, -0.12), OUTLINE)}
    ${poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], right ?? shade(color, -0.28), OUTLINE)}
    ${poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], top ?? color, OUTLINE)}
  </g>`;
}

// 바닥에 깔린 평면 (러그, 매트 등)
function flat(x, y, w, d, fill, extra = '') {
  return poly([[x, y, 0.5], [x + w, y, 0.5], [x + w, y + d, 0.5], [x, y + d, 0.5]], fill, extra);
}

// 뒷벽(y=0) / 왼쪽 벽(x=0)에 붙은 사각형
function wallRectY(x0, x1, z0, z1, fill, extra = '') {
  return poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], fill, extra);
}
function wallRectX(y0, y1, z0, z1, fill, extra = '') {
  return poly([[0, y0, z0], [0, y1, z0], [0, y1, z1], [0, y0, z1]], fill, extra);
}

// 벽면에 기울어진 글자. 뒷벽은 x 방향, 왼쪽 벽은 -y 방향으로 읽힌다.
function wallTextY(x, z, text, size, fill, weight = 400) {
  const [sx, sy] = iso(x, 0, z);
  return `<text transform="matrix(1,0.5,0,1,${sx.toFixed(1)},${sy.toFixed(1)})" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="${PIXEL_FONT}">${esc(text)}</text>`;
}
function wallTextX(y, z, text, size, fill, weight = 400) {
  const [sx, sy] = iso(0, y, z);
  return `<text transform="matrix(1,-0.5,0,1,${sx.toFixed(1)},${sy.toFixed(1)})" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="${PIXEL_FONT}">${esc(text)}</text>`;
}

// ---------- 방 뼈대 ----------

function floorTiles(W, D, c1, c2) {
  let out = box(0, 0, -10, W, D, 10, c1, { top: c1, left: shade(c1, -0.35), right: shade(c1, -0.5) });
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < D; j++) {
      out += poly([[i, j, 0], [i + 1, j, 0], [i + 1, j + 1, 0], [i, j + 1, 0]], (i + j) % 2 ? c1 : c2,
        'stroke="#000" stroke-opacity=".06"');
    }
  }
  return out;
}

function walls(W, D, H, color) {
  const T = 0.22;
  const cap = shade(color, -0.35);
  return [
    poly([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], color, OUTLINE),
    poly([[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]], shade(color, -0.12), OUTLINE),
    wallRectY(0, W, 0, 7, shade(color, -0.25)),
    wallRectX(0, D, 0, 7, shade(color, -0.3)),
    poly([[-T, -T, H], [W, -T, H], [W, 0, H], [0, 0, H]], cap, OUTLINE),
    poly([[-T, -T, H], [0, 0, H], [0, D, H], [-T, D, H]], cap, OUTLINE),
    poly([[W, -T, 0], [W, 0, 0], [W, 0, H], [W, -T, H]], shade(color, -0.45), OUTLINE),
    poly([[-T, D, 0], [0, D, 0], [0, D, H], [-T, D, H]], shade(color, -0.45), OUTLINE),
  ].join('');
}

// 전체 씬을 감싸는 svg. viewBox를 방 크기에 맞춰 계산한다.
function isoSVG(W, D, H, content, cls = '') {
  const pad = 24;
  const minX = -D * TW / 2 - pad;
  const maxX = W * TW / 2 + pad;
  const minY = -H - pad - 12;
  const maxY = (W + D) * TH / 2 + 12 + pad;
  return `<svg class="iso ${cls}" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

// 깊이 정렬: 화면 앞쪽(x+y가 큰) 물체를 나중에 그린다
function depthSorted(objects) {
  return objects.sort((a, b) => a.key - b.key).map(o => o.svg).join('');
}

// ---------- 가구 ----------

function palm(x, y, s = 1) {
  const potH = 16 * s;
  const [cx, cy] = iso(x, y, potH);
  const top = cy - 46 * s;
  const leaf = (rot, len, col) =>
    `<ellipse cx="${cx}" cy="${top}" rx="${len * s}" ry="${6 * s}" fill="${col}" ${OUTLINE}
      transform="rotate(${rot} ${cx} ${top}) translate(${len * s * 0.8} 0)"/>`;
  return `<g class="palm">
    ${box(x - 0.28, y - 0.28, 0, 0.56, 0.56, potH, '#9aa3ad')}
    <rect x="${cx - 3 * s}" y="${top}" width="${6 * s}" height="${46 * s}" fill="#8a5a2b" ${OUTLINE}/>
    ${leaf(-160, 26, '#2f9e44')}${leaf(-20, 26, '#2f9e44')}${leaf(-120, 24, '#40c057')}
    ${leaf(-60, 24, '#40c057')}${leaf(-90, 20, '#69db7c')}${leaf(150, 20, '#37b24d')}${leaf(30, 20, '#37b24d')}
  </g>`;
}

function floorLamp(x, y, lit) {
  const [cx, cy] = iso(x, y, 0);
  return `<g>
    <ellipse cx="${cx}" cy="${cy}" rx="10" ry="5" fill="#9ca3af" ${OUTLINE}/>
    <rect x="${cx - 1.5}" y="${cy - 70}" width="3" height="70" fill="#9ca3af"/>
    <circle cx="${cx - 9}" cy="${cy - 72}" r="7" fill="${lit ? '#fde68a' : '#e5e7eb'}" ${OUTLINE} ${lit ? 'class="glow"' : ''}/>
    <circle cx="${cx + 9}" cy="${cy - 72}" r="7" fill="${lit ? '#fde68a' : '#e5e7eb'}" ${OUTLINE} ${lit ? 'class="glow"' : ''}/>
  </g>`;
}

// 주제 소품: 받침대 위에 이모지
function emojiProp(x, y, emoji, size, { attrs = '', title = '' } = {}) {
  const [cx, cy] = iso(x, y, 10);
  return `<g ${attrs}>${title ? `<title>${esc(title)}</title>` : ''}
    ${box(x - 0.3, y - 0.3, 0, 0.6, 0.6, 10, '#eef1f4')}
    <text x="${cx}" y="${cy + 2}" font-size="${size}" text-anchor="middle" class="emoji">${emoji}</text>
  </g>`;
}

// 벽에 달린 문. wall='y'면 뒷벽(at = 왼쪽 끝 x), wall='x'면 왼쪽 벽(at = 화면 왼쪽 끝 y).
// 마우스를 올리면 문짝(.door-panel)이 사라지며 안쪽의 peek 이모지가 보인다.
function wallDoor({ wall, at, color, label, peek, lit, title, attrs, W = 1.1, H = 96 }) {
  const rect = wall === 'y' ? wallRectY : wallRectX;
  const text = wall === 'y' ? wallTextY : wallTextX;
  const [a0, a1] = wall === 'y' ? [at, at + W] : [at, at - W]; // 화면 왼쪽 → 오른쪽
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const pt = (t, z) => wall === 'y' ? iso(a0 + (a1 - a0) * t, 0, z) : iso(0, a0 + (a1 - a0) * t, z);
  const [px, py] = pt(0.5, H * 0.45);
  const [kx, ky] = pt(0.82, 44);
  const mat = wall === 'y' ? flat(lo, 0.08, W, 0.9, color, 'opacity=".75"') : flat(0.08, lo, 0.9, W, color, 'opacity=".75"');
  return `
  <g class="door-g" ${attrs}>
    <title>${esc(title)}</title>
    ${mat}
    ${rect(lo - 0.1, hi + 0.1, 0, H + 8, '#7a4f2e', OUTLINE)}
    ${rect(lo, hi, 0, H, mix(color, '#fbf7ef', 0.7))}
    <text x="${px}" y="${py}" font-size="16" text-anchor="middle" class="emoji">${peek}</text>
    <g class="door-panel">
      ${rect(lo, hi, 0, H, color, OUTLINE)}
      ${rect(lo + 0.12, hi - 0.12, 8, H * 0.45, shade(color, -0.12))}
      ${rect(lo + 0.25, hi - 0.25, H * 0.62, H * 0.86, lit ? '#fde68a' : '#e5e7eb', `${OUTLINE} ${lit ? 'class="glow"' : ''}`)}
      <circle cx="${kx}" cy="${ky}" r="3.5" fill="#fcd34d" ${OUTLINE}/>
    </g>
    ${rect(lo + 0.05, hi - 0.05, H + 14, H + 30, '#fff', OUTLINE)}
    ${text(wall === 'y' ? lo + 0.12 : hi - 0.12, H + 18, label, 11, '#1f2330', 700)}
  </g>`;
}

// ---------- 캐릭터 ----------

function nameTag(cx, cy, text, color) {
  const w = Math.max(28, [...text].length * 11 + 12);
  return `<g class="tag">
    <rect x="${cx - w / 2}" y="${cy - 13}" width="${w}" height="16" rx="3" fill="rgba(20,22,35,.78)"/>
    <rect x="${cx - w / 2}" y="${cy - 13}" width="3" height="16" fill="${color}"/>
    <text x="${cx + 1}" y="${cy - 1}" font-size="11" fill="#fff" text-anchor="middle" font-family="${PIXEL_FONT}">${esc(text)}</text>
  </g>`;
}

function speechBubble(cx, cy, text) {
  const w = Math.max(30, [...text].length * 12 + 14);
  return `<g class="bubble">
    <rect x="${cx - w / 2}" y="${cy - 26}" width="${w}" height="22" rx="6" fill="#fff" ${OUTLINE}/>
    <polygon points="${cx - 4},${cy - 5} ${cx + 4},${cy - 5} ${cx},${cy + 2}" fill="#fff"/>
    <text x="${cx}" y="${cy - 10}" font-size="13" text-anchor="middle" font-family="${PIXEL_FONT}">${esc(text)}</text>
  </g>`;
}

function avatar(x, y, m, { bubble = '', tag = true, attrs = '' } = {}) {
  const skin = '#f2c8a0';
  const hair = shade(m.color, -0.55);
  const [ex1, ey1] = iso(x - 0.06, y + 0.14, 41);
  const [ex2, ey2] = iso(x + 0.06, y + 0.14, 41);
  const [hx, hy] = iso(x, y, 58);
  return `<g class="avatar" ${attrs}>
    <ellipse cx="${iso(x, y)[0]}" cy="${iso(x, y)[1]}" rx="13" ry="6" fill="rgba(0,0,0,.18)"/>
    ${box(x - 0.13, y - 0.13, 0, 0.26, 0.26, 14, '#3f4556')}
    ${box(x - 0.17, y - 0.17, 14, 0.34, 0.34, 18, m.color)}
    ${box(x - 0.15, y - 0.15, 32, 0.3, 0.3, 16, skin)}
    ${box(x - 0.16, y - 0.16, 46, 0.32, 0.32, 6, hair)}
    <rect x="${ex1 - 1.5}" y="${ey1 - 2}" width="3" height="3" fill="#1f2330"/>
    <rect x="${ex2 - 1.5}" y="${ey2 - 2}" width="3" height="3" fill="#1f2330"/>
    ${tag ? nameTag(hx, hy, m.name, m.color) : ''}
    ${bubble ? speechBubble(hx, hy - 18, bubble) : ''}
  </g>`;
}
