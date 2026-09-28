// 개인 방 씬 (2.5D 아이소메트릭). 미니 카드와 큰 화면에서 같은 SVG를 쓴다.

const ROOM_W = 8, ROOM_D = 7, ROOM_H = 130;
const PROP_SLOTS = [
  { x: 2.9, y: 6.7 }, { x: 7.1, y: 3.4 }, { x: 6.3, y: 5.9 },
  { x: 2.0, y: 1.1 }, { x: 4.3, y: 6.4 }, { x: 5.8, y: 1.2 },
];
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

function roomColors(m) {
  return {
    wall: mix('#a8ecd4', m.color, 0.22),
    floorA: mix('#4d9fc4', m.color, 0.28),
    floorB: mix('#5aabcf', m.color, 0.28),
  };
}

// 책장: 왼쪽 벽에 붙어 있고, 앞면(x = x0 + w)에 책이 꽂힌다
function shelfSVG(links) {
  const x0 = 0, y0 = 3.9, w = 0.7, d = 1.9, h = 108;
  const fx = x0 + w;
  const wood = '#8b5e3c';
  let out = box(x0, y0, 0, w, d, h, wood);
  const levels = [84, 58, 32, 6]; // 위 칸부터 채운다
  levels.forEach((z, row) => {
    out += poly([[fx, y0 + 0.06, z], [fx, y0 + d - 0.06, z], [fx, y0 + d - 0.06, z + 22], [fx, y0 + 0.06, z + 22]], '#4a2f1b');
    links.slice(row * 8, row * 8 + 8).forEach((item, k) => {
      const hsh = hashCode(item.id);
      const bh = 14 + (hsh % 7);
      const by = y0 + d - 0.12 - k * 0.22; // 화면 왼쪽부터 채운다
      out += `<g><title>${esc(item.title)}</title>${poly([[fx, by - 0.17, z], [fx, by, z], [fx, by, z + bh], [fx, by - 0.17, z + bh]],
        BOOK_COLORS[hsh % BOOK_COLORS.length], OUTLINE)}</g>`;
    });
  });
  if (links.length > 32) {
    const [tx, ty] = iso(fx, y0 + d / 2, h + 6);
    out += `<text x="${tx}" y="${ty}" font-size="11" fill="#fff" text-anchor="middle" font-family="${PIXEL_FONT}">+${links.length - 32}</text>`;
  }
  return `<g class="zone" data-zone="shelf"><title>책장 · 자료 ${links.length}개</title>${out}</g>`;
}

function whiteboardSVG(p) {
  const x0 = 3.2, x1 = 6.3, z0 = 42, z1 = 112;
  const title = p.pinned ? p.pinned.title : '아직 없음';
  // 화이트보드 폭에 맞춰 8글자씩 최대 3줄
  const lines = [title.slice(0, 8), title.slice(8, 16), title.length > 24 ? title.slice(16, 23) + '…' : title.slice(16, 24)].filter(Boolean);
  return `<g class="zone" data-zone="whiteboard"><title>화이트보드 · 아이디어 ${p.ideas.length}개</title>
    ${wallRectY(x0 - 0.08, x1 + 0.08, z0 - 5, z1 + 5, '#9aa1ab', OUTLINE)}
    ${wallRectY(x0, x1, z0, z1, '#ffffff')}
    ${wallRectY(x0 + 0.3, x1 - 0.3, z0 - 9, z0 - 5, '#6b7280')}
    ${wallTextY(x0 + 0.15, z1 - 14, '💡 핵심 아이디어', 9, '#6b7280')}
    ${lines.map((l, i) => wallTextY(x0 + 0.15, z1 - 30 - i * 15, l, 11.5, '#1e3a8a', 700)).join('')}
    ${p.ideas.length > 1 ? wallTextY(x1 - 0.55, z0 + 4, `+${p.ideas.length - 1}`, 9, '#6b7280') : ''}
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
    notes += `<g><title>${esc(item.title)}</title>${wallRectX(ny - 0.55, ny, nz - 20 + tilt, nz + tilt, NOTE_COLORS[i % 4], OUTLINE)}</g>`;
  });
  return `<g class="zone" data-zone="board"><title>포스트잇 보드 · 메모 ${memos.length}개</title>
    ${wallRectX(y1, y0, z0, z1, '#c89b6d', OUTLINE)}
    ${wallRectX(y1 + 0.05, y0 - 0.05, z0 + 3, z1 - 3, '#d5aa7c')}
    ${notes}
  </g>`;
}

function windowSVG() {
  const x0 = 0.9, x1 = 2.6, z0 = 58, z1 = 112;
  const mid = (x0 + x1) / 2;
  return [
    wallRectY(x0 - 0.06, x1 + 0.06, z0 - 4, z1 + 4, '#ffffff', OUTLINE),
    wallRectY(x0, x1, z0, z1, '#bfe3ff'),
    wallRectY(x0 + 0.2, x0 + 0.8, z1 - 16, z1 - 8, '#ffffff'),
    wallRectY(mid - 0.03, mid + 0.03, z0, z1, '#ffffff'),
    wallRectY(x0, x1, (z0 + z1) / 2 - 2, (z0 + z1) / 2 + 2, '#ffffff'),
  ].join('');
}

function deskSVG(m, lit) {
  const monitor = box(3.9, 3.12, 30, 0.75, 0.12, 26, '#1f2937', { left: lit ? '#1e40af' : '#334155' });
  return `
    ${box(3.2, 3.0, 0, 2.0, 0.9, 30, '#a0703f')}
    <g class="zone" data-zone="monitor"><title>AI 대화 (연동 예정)</title>${monitor}</g>
    ${box(4.85, 3.15, 30, 0.12, 0.12, 22, '#6b7280')}
    ${box(4.72, 3.05, 50, 0.35, 0.3, 8, lit ? '#fbbf24' : '#9ca3af', { attrs: lit ? 'class="glow"' : '' })}
    ${box(3.95, 4.15, 0, 0.6, 0.55, 16, shade(m.color, -0.1))}`;
}

function roomHTML(memberId, { mini = false } = {}) {
  const m = member(memberId);
  const p = profile(memberId);
  const dark = roomDarkness(p);
  const lit = dark === 0;
  const c = roomColors(m);

  const objects = [
    { key: 5.3, svg: shelfSVG(p.links) },
    { key: 7.6, svg: deskSVG(m, lit) },
    { key: 7.0, svg: palm(0.6, 6.4, 0.9) },
    { key: 10.8, svg: avatar(5.9, 4.9, m, { tag: !mini, bubble: !mini && p.themes[0] ? p.themes[0].theme.emoji : '' }) },
  ];
  p.themes.slice(0, PROP_SLOTS.length).forEach(({ theme, score }, i) => {
    const s = PROP_SLOTS[i];
    const size = 24 + Math.min(score, 4) * 5;
    objects.push({
      key: s.x + s.y,
      svg: emojiProp(s.x, s.y, theme.emoji + (score >= 3 ? theme.extra : ''), size,
        { attrs: `class="zone prop" data-zone="theme:${theme.id}"`, title: `${theme.name} (${score})` }),
    });
  });

  const scene = [
    floorTiles(ROOM_W, ROOM_D, c.floorA, c.floorB),
    walls(ROOM_W, ROOM_D, ROOM_H, c.wall),
    windowSVG(),
    wallDoor({
      wall: 'y', at: 6.55, color: '#3fae8c', label: '회의실', peek: '🗂️', lit: true,
      title: '회의실로 돌아가기', attrs: 'data-go="meeting"',
    }),
    whiteboardSVG(p),
    corkSVG(p.memos),
    flat(2.2, 4.2, 3.8, 2.3, mix(m.color, '#ffffff', 0.45), 'opacity=".85" stroke="#fff" stroke-opacity=".6" stroke-width="2"'),
    depthSorted(objects),
  ].join('');

  return `
  <div class="room ${mini ? 'mini' : ''}" style="--mc:${m.color}">
    ${isoSVG(ROOM_W, ROOM_D, ROOM_H, scene)}
    <div class="nameplate">${esc(m.name)}의 방 <b>Lv.${p.level}</b></div>
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
  if (zone === 'monitor') return { title: '🖥️ 모니터 · AI 대화', items: [], empty: 'ChatGPT·Claude 대화 연동은 다음 버전에서 추가될 예정이에요.' };
  if (zone.startsWith('theme:')) {
    const theme = THEME_BY_ID[zone.slice(6)];
    return { title: `${theme.emoji} ${theme.name} 관련 자료`, items: p.items.filter(i => i.themes.includes(theme.id)) };
  }
  return { title: '', items: [] };
}
