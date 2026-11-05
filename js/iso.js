// 아이소메트릭(2.5D) SVG 그리기 도구.
// 좌표: x → 화면 오른쪽 아래, y → 화면 왼쪽 아래 (타일 단위), z → 위쪽 (px). 타일 1칸 = 64×32px.
// 뒷벽은 y=0 평면, 왼쪽 벽은 x=0 평면에 붙어 있다.

const TW = 64, TH = 32;
const OUTLINE = 'stroke="#1b1b2a" stroke-opacity=".24" stroke-width="1" stroke-linejoin="round"';

// 그림자·둥근 면·빛에 쓰는 그라데이션. 화면에 하나만 둔다 (id를 여러 SVG가 함께 쓴다)
(function injectIsoDefs() {
  if (typeof document === 'undefined' || !document.body?.insertAdjacentHTML) return;
  document.body.insertAdjacentHTML('beforeend', `<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>
    <radialGradient id="brShadow"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".65" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="brRound" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
    <linearGradient id="brCyl"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".3" stop-color="#fff" stop-opacity=".24"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
    <linearGradient id="brWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#3b2a1a" stop-opacity=".14"/></linearGradient>
    <linearGradient id="brSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc8ef"/><stop offset=".72" stop-color="#d4ecf8"/><stop offset="1" stop-color="#eef6ea"/></linearGradient>
    <linearGradient id="brSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c9" stop-opacity=".5"/><stop offset="1" stop-color="#fff3c9" stop-opacity="0"/></linearGradient>
    <radialGradient id="brGlow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
  </defs></svg>`);
})();
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

// ---------- 부드러운 도형 ----------

// 바닥(또는 책상)에 닿는 그림자: 물건이 떠 보이지 않게 한다
function shadow(x, y, w, d, opacity = 0.26, z = 0) {
  const [cx, cy] = iso(x, y, z);
  const rx = (w + d) * 17;
  return `<ellipse cx="${cx}" cy="${cy + 1}" rx="${rx}" ry="${rx / 2}" fill="url(#brShadow)" opacity="${opacity * 2}"/>`;
}

// 원기둥 (r2로 위가 좁거나 넓은 통). r, h는 px
function cyl(x, y, z, r, h, color, { r2 = r, top } = {}) {
  const [cx, cy] = iso(x, y, z);
  const t = cy - h;
  const side = `M${cx - r},${cy} A${r},${r / 2} 0 0 0 ${cx + r},${cy} L${cx + r2},${t} A${r2},${r2 / 2} 0 0 1 ${cx - r2},${t} Z`;
  return `<path d="${side}" fill="${color}" ${OUTLINE}/><path d="${side}" fill="url(#brCyl)"/>
    <ellipse cx="${cx}" cy="${t}" rx="${r2}" ry="${r2 / 2}" fill="${top ?? shade(color, 0.14)}" ${OUTLINE}/>`;
}

// 앞면(y = 일정, 'y') 또는 옆면(x = 일정, 'x')에 붙은 원 (스피커, 바퀴, 금고 손잡이 등)
function faceCircle(x, y, z, r, face, fill, extra = '') {
  const [cx, cy] = iso(x, y, z);
  const m = face === 'y' ? `matrix(.86,.43,0,1,${cx},${cy})` : `matrix(.86,-.43,0,1,${cx},${cy})`;
  return `<circle cx="0" cy="0" r="${r}" transform="${m}" fill="${fill}" ${extra}/>`;
}

// ---------- 방 뼈대 ----------

// 나무 마루: 길이가 다른 판자를 엇갈려 깐다. seed가 같으면 언제나 같은 무늬
function woodFloor(W, D, base, seed = 7) {
  let out = box(0, 0, -10, W, D, 10, base, { top: base, left: shade(base, -0.42), right: shade(base, -0.55) });
  const PLANK = 0.5;
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let j = 0; j < D - 1e-6; j += PLANK) {
    let i = -rand() * 1.6;
    while (i < W) {
      const len = 1.6 + rand() * 1.5;
      const x0 = Math.max(0, i), x1 = Math.min(W, i + len);
      const tone = (rand() - 0.5) * 0.14;
      out += poly([[x0, j, 0], [x1, j, 0], [x1, j + PLANK, 0], [x0, j + PLANK, 0]], tone < 0 ? shade(base, tone) : shade(base, tone * 0.8), 'stroke="#3b2412" stroke-opacity=".2" stroke-width=".7"');
      // 나뭇결
      if (rand() > 0.55) {
        const gy = j + 0.14 + rand() * 0.22;
        const gx = x0 + (x1 - x0) * (0.15 + rand() * 0.3);
        out += `<line x1="${iso(gx, gy)[0]}" y1="${iso(gx, gy)[1]}" x2="${iso(Math.min(x1, gx + 0.6), gy)[0]}" y2="${iso(Math.min(x1, gx + 0.6), gy)[1]}" stroke="#3b2412" stroke-opacity=".1" stroke-width=".8"/>`;
      }
      i += len;
    }
  }
  // 벽 쪽으로 어두워지는 그늘
  out += poly([[0, 0, 0], [W, 0, 0], [W, 0.7, 0], [0, 0.7, 0]], '#1c1208', 'opacity=".12"');
  out += poly([[0, 0, 0], [0.7, 0, 0], [0.7, D, 0], [0, D, 0]], '#1c1208', 'opacity=".12"');
  return out;
}


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
  const cap = shade(color, -0.3);
  const BASE = 9; // 걸레받이 높이
  return [
    poly([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], color, OUTLINE),
    poly([[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]], shade(color, -0.1), OUTLINE),
    // 위는 밝고 아래로 갈수록 살짝 어두운 벽면
    poly([[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], 'url(#brWall)'),
    poly([[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]], 'url(#brWall)'),
    // 걸레받이
    wallRectY(0, W, 0, BASE, '#f4f1ea', 'stroke="#1b1b2a" stroke-opacity=".14"'),
    wallRectX(0, D, 0, BASE, '#e5e1d8', 'stroke="#1b1b2a" stroke-opacity=".14"'),
    // 벽 윗면과 잘린 단면
    poly([[-T, -T, H], [W, -T, H], [W, 0, H], [0, 0, H]], cap, OUTLINE),
    poly([[-T, -T, H], [0, 0, H], [0, D, H], [-T, D, H]], cap, OUTLINE),
    poly([[W, -T, 0], [W, 0, 0], [W, 0, H], [W, -T, H]], shade(color, -0.42), OUTLINE),
    poly([[-T, D, 0], [0, D, 0], [0, D, H], [-T, D, H]], shade(color, -0.42), OUTLINE),
  ].join('');
}

// 전체 씬을 감싸는 svg. viewBox를 방 크기에 맞춰 계산한다.
function isoSVG(W, D, H, content, cls = '', label = '') {
  const pad = 24;
  const minX = -D * TW / 2 - pad;
  const maxX = W * TW / 2 + pad;
  const minY = -H - pad - 12;
  const maxY = (W + D) * TH / 2 + 12 + pad;
  const a11y = label ? `role="group" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg ${a11y} class="iso ${cls}" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

// 깊이 정렬: 화면 앞쪽(x+y가 큰) 물체를 나중에 그린다
function depthSorted(objects) {
  return objects.sort((a, b) => a.key - b.key).map(o => o.svg).join('');
}

// ---------- 가구 ----------

// 큰 화분: 테라코타 화분 + 줄기 + 넓은 잎 여러 장
function palm(x, y, s = 1) {
  const potH = 18 * s;
  const [cx, cy] = iso(x, y, potH);
  const top = cy - 38 * s;
  const leaf = (rot, len, col) => {
    const L = len * s, W = 7.5 * s;
    return `<path d="M0,0 C${L * 0.3},${-W} ${L * 0.75},${-W * 0.85} ${L},0 C${L * 0.72},${W * 0.5} ${L * 0.3},${W * 0.55} 0,0 Z" fill="${col}" stroke="#14401f" stroke-opacity=".35" stroke-width=".7" transform="translate(${cx},${top}) rotate(${rot})"/>
      <line x1="0" y1="0" x2="${L * 0.88}" y2="0" stroke="#ffffff" stroke-opacity=".22" stroke-width=".7" transform="translate(${cx},${top}) rotate(${rot})"/>`;
  };
  return `<g class="palm">
    ${shadow(x, y, 0.75 * s, 0.75 * s)}
    ${cyl(x, y, 0, 12 * s, potH, '#b5683f', { r2: 15 * s, top: '#6a3f26' })}
    <ellipse cx="${cx}" cy="${cy}" rx="${15 * s}" ry="${7.5 * s}" fill="none" stroke="#cc7f55" stroke-width="${2 * s}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${11.5 * s}" ry="${5.7 * s}" fill="#3a2a1e"/>
    <path d="M${cx - 1.5 * s},${cy} L${cx - 1 * s},${top} L${cx + 1 * s},${top} L${cx + 1.5 * s},${cy} Z" fill="#6c5533"/>
    ${leaf(155, 30, '#2f7d43')}${leaf(25, 30, '#2f7d43')}${leaf(-168, 27, '#347f47')}${leaf(-12, 27, '#347f47')}
    ${leaf(-140, 31, '#3e9654')}${leaf(-40, 31, '#3e9654')}${leaf(-112, 30, '#4aa962')}${leaf(-68, 30, '#4aa962')}${leaf(-90, 26, '#5dbb72')}
  </g>`;
}

// 스탠드 조명: 받침 + 기둥 + 천 갓. 켜져 있으면 주변이 은은히 밝다
function floorLamp(x, y, lit) {
  const [cx, cy] = iso(x, y, 0);
  const shadeZ = 68;
  return `<g>
    ${shadow(x, y, 0.4, 0.4)}
    ${lit ? `<ellipse cx="${cx}" cy="${cy - shadeZ + 8}" rx="42" ry="36" fill="url(#brGlow)"/>
      <ellipse cx="${cx}" cy="${cy + 2}" rx="34" ry="17" fill="url(#brGlow)" opacity=".7"/>` : ''}
    ${cyl(x, y, 0, 9, 2, '#3a3f4a', { top: '#555b68' })}
    <rect x="${cx - 1.2}" y="${cy - shadeZ}" width="2.4" height="${shadeZ - 1}" fill="#6a707c"/>
    ${cyl(x, y, shadeZ - 2, 13, 18, lit ? '#f7e4ae' : '#e8e2d2', { r2: 8, top: lit ? '#fff2c6' : '#f2ecdd' })}
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

// 사람 캐릭터. 옷은 팀원 색으로 알아보게 하고, 머리 모양·피부·머리색·바지는 팀원 id로 정해 늘 같은 모습이다
const AVATAR_SKIN = ['#f6d3b3', '#efc29c', '#e3ad82', '#c98f65', '#a36f4a'];
const AVATAR_HAIR = ['#2a211c', '#3b2a20', '#5a3b26', '#1f1d24', '#7a5233', '#4a3a55'];
const AVATAR_PANTS = ['#2f3a52', '#3a3f4a', '#4a5f7f', '#5c5346', '#2b2f38'];

function avatarLook(m) {
  let h = 7;
  for (const ch of String(m.id ?? m.name ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    skin: AVATAR_SKIN[h % AVATAR_SKIN.length],
    hair: AVATAR_HAIR[(h >>> 3) % AVATAR_HAIR.length],
    pants: AVATAR_PANTS[(h >>> 6) % AVATAR_PANTS.length],
    style: (h >>> 9) % 4,
  };
}

function avatar(x, y, m, { bubble = '', tag = true, attrs = '' } = {}) {
  const { skin, hair, pants, style } = avatarLook(m);
  const [cx, cy] = iso(x, y);
  const shirt = m.color;
  const sleeve = shade(shirt, -0.1);
  const line = 'stroke="#1b1b2a" stroke-opacity=".28" stroke-width=".8"';
  const hx = cx, hy = cy - 69;
  const headY = cy - 54;

  const leg = (lx, h) => `<rect x="${lx}" y="${cy - 26}" width="5.6" height="${h}" rx="2.4" fill="${pants}" ${line}/>`;
  const shoe = (sx, sy) => `<ellipse cx="${sx}" cy="${sy}" rx="4.1" ry="2.3" fill="#23262e" ${line}/>`;
  const arm = (ax, bx) => `<path d="M${ax},${cy - 40} Q${(ax + bx) / 2 + (bx - ax) * 0.6},${cy - 32} ${bx},${cy - 24}" fill="none" stroke="#1b1b2a" stroke-opacity=".25" stroke-width="5.4" stroke-linecap="round"/>
    <path d="M${ax},${cy - 40} Q${(ax + bx) / 2 + (bx - ax) * 0.6},${cy - 32} ${bx},${cy - 24}" fill="none" stroke="${sleeve}" stroke-width="4.4" stroke-linecap="round"/>
    <circle cx="${bx}" cy="${cy - 21.5}" r="2.4" fill="${skin}" ${line}/>`;
  const torso = `M${cx - 9.5},${cy - 41} Q${cx},${cy - 45.5} ${cx + 9.5},${cy - 41} L${cx + 8.2},${cy - 22} Q${cx},${cy - 19.5} ${cx - 8.2},${cy - 22} Z`;

  // 뒷머리 (머리보다 먼저 그린다)
  const backHair = [
    '',
    `<path d="M${cx - 9.6},${headY - 3} Q${cx - 11.5},${headY + 8} ${cx - 8},${headY + 11} L${cx + 8},${headY + 11} Q${cx + 11.5},${headY + 8} ${cx + 9.6},${headY - 3} Z" fill="${hair}"/>`,
    `<path d="M${cx - 9.8},${headY - 3} Q${cx - 12},${headY + 14} ${cx - 8},${headY + 19} L${cx + 8},${headY + 19} Q${cx + 12},${headY + 14} ${cx + 9.8},${headY - 3} Z" fill="${hair}"/>`,
    '',
  ][style];
  // 앞머리
  const frontHair = [
    `<path d="M${cx - 9},${headY - 1} C${cx - 10},${headY - 13} ${cx + 10},${headY - 13} ${cx + 9},${headY - 1} Q${cx + 5},${headY - 6} ${cx - 2},${headY - 6} Q${cx - 6},${headY - 5} ${cx - 9},${headY - 1} Z" fill="${hair}" ${line}/>`,
    `<path d="M${cx - 9.6},${headY + 1} C${cx - 11},${headY - 14} ${cx + 11},${headY - 14} ${cx + 9.6},${headY + 1} Q${cx + 7},${headY - 5} ${cx + 1},${headY - 6} Q${cx - 6},${headY - 6} ${cx - 9.6},${headY + 1} Z" fill="${hair}" ${line}/>`,
    `<path d="M${cx - 9.8},${headY + 2} C${cx - 11},${headY - 14} ${cx + 11},${headY - 14} ${cx + 9.8},${headY + 2} Q${cx + 8},${headY - 4} ${cx + 3},${headY - 6.5} Q${cx - 5},${headY - 3} ${cx - 9.8},${headY + 2} Z" fill="${hair}" ${line}/>`,
    [[-7, -5, 4], [-3, -8.5, 4.4], [2, -9, 4.4], [6.5, -6, 4], [-8.8, -1, 2.8], [8.8, -2, 2.8]].map(([dx, dy, r]) => `<circle cx="${cx + dx}" cy="${headY + dy}" r="${r}" fill="${hair}"/>`).join(''),
  ][style];

  return `<g class="avatar" ${attrs}>
    <ellipse cx="${cx}" cy="${cy}" rx="15" ry="7.5" fill="url(#brShadow)" opacity=".6"/>
    ${leg(cx - 7.2, 23.5)}${leg(cx + 1.6, 24.5)}
    ${shoe(cx - 4.6, cy - 1.5)}${shoe(cx + 4.6, cy - 0.5)}
    ${arm(cx + 9, cx + 11.5)}
    <path d="${torso}" fill="${shirt}" ${OUTLINE}/><path d="${torso}" fill="url(#brCyl)"/>
    <path d="M${cx - 3.2},${cy - 43.2} Q${cx - 0.6},${cy - 39.5} ${cx + 2.2},${cy - 43.4}" fill="${skin}" stroke="#1b1b2a" stroke-opacity=".2" stroke-width=".6"/>
    ${arm(cx - 9, cx - 11.5)}
    ${backHair}
    <rect x="${cx - 3}" y="${cy - 47}" width="5.4" height="5" fill="${shade(skin, -0.1)}"/>
    <ellipse cx="${cx - 8.8}" cy="${headY + 1}" rx="1.7" ry="2.2" fill="${skin}"/><ellipse cx="${cx + 8.8}" cy="${headY + 1}" rx="1.7" ry="2.2" fill="${skin}"/>
    <ellipse cx="${cx}" cy="${headY}" rx="8.8" ry="9.6" fill="${skin}" ${line}/>
    <ellipse cx="${cx}" cy="${headY}" rx="8.8" ry="9.6" fill="url(#brRound)" opacity=".45"/>
    ${frontHair}
    <ellipse cx="${cx - 4.1}" cy="${headY + 1.2}" rx="1.25" ry="1.7" fill="#1f1d24"/><ellipse cx="${cx + 2.5}" cy="${headY + 1.2}" rx="1.25" ry="1.7" fill="#1f1d24"/>
    <circle cx="${cx - 4.5}" cy="${headY + 0.6}" r=".45" fill="#fff"/><circle cx="${cx + 2.1}" cy="${headY + 0.6}" r=".45" fill="#fff"/>
    <ellipse cx="${cx - 5.9}" cy="${headY + 4}" rx="1.6" ry=".9" fill="#e27d7d" opacity=".35"/><ellipse cx="${cx + 4.3}" cy="${headY + 4}" rx="1.6" ry=".9" fill="#e27d7d" opacity=".35"/>
    <path d="M${cx - 2.6},${headY + 5} Q${cx - 0.8},${headY + 6.6} ${cx + 1},${headY + 5}" fill="none" stroke="#8a4b3c" stroke-width=".9" stroke-linecap="round"/>
    ${tag ? nameTag(hx, hy, m.name, m.color) : ''}
    ${bubble ? speechBubble(hx, hy - 18, bubble) : ''}
  </g>`;
}
