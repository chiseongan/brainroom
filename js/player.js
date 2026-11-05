// 회의실에서 로그인한 팀원 캐릭터를 방향키·WASD로 움직인다.
// 문 앞 바닥칸에 서면 그 팀원의 방으로 들어가는 버튼이 뜨고, Enter/Space로 입장한다.
// 성능을 위해 씬 전체를 다시 그리지 않고, 플레이어만 별도 레이어(테이블 앞/뒤)에 다시 그린다.

(function () {
  const SPEED = 3.6;          // 초당 타일 이동 속도
  const DOOR_R = 0.95;        // 문 앞 입장 인식 반경(타일)
  const KEY_DIR = {
    arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  };
  const DELTA = { up: [-1, -1], down: [1, 1], left: [-1, 1], right: [1, -1] };

  let ctl = null;

  function typingInField() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function destroy() {
    if (!ctl) return;
    cancelAnimationFrame(ctl.raf);
    removeEventListener('keydown', ctl.onKeyDown, true);
    removeEventListener('keyup', ctl.onKeyUp, true);
    removeEventListener('blur', ctl.onBlur);
    ctl = null;
  }

  function initHallPlayer() {
    destroy();
    const svg = document.querySelector('.hall .iso');
    const table = document.getElementById('hallTable');
    if (!svg || !table || typeof hallGeometry !== 'function') return;
    const me = member(state.meId) || state.members[0];
    if (!me) return;

    const geo = hallGeometry();
    const T = geo.table;
    const tableKey = T.x + T.w / 2 + T.y + T.d / 2;
    const blockPad = 0.34;

    // 플레이어 레이어: 테이블보다 앞/뒤에 그릴 두 겹
    const svgNS = 'http://www.w3.org/2000/svg';
    const backLayer = document.createElementNS(svgNS, 'g');   // 테이블보다 뒤
    const frontLayer = document.createElementNS(svgNS, 'g');  // 테이블보다 앞
    const hintLayer = document.createElementNS(svgNS, 'g');
    backLayer.setAttribute('class', 'brplayer');
    frontLayer.setAttribute('class', 'brplayer');
    hintLayer.setAttribute('class', 'brplayer-hint');
    table.parentNode.insertBefore(backLayer, table);
    svg.appendChild(frontLayer);
    svg.appendChild(hintLayer);

    // 아바타는 원점(0,0) 기준으로 '한 번만' 그리고, 매 프레임 transform으로 옮긴다.
    // (매 프레임 다시 그리면 CSS 걷기 애니메이션이 리셋돼 보이지 않는다)
    const playerG = document.createElementNS(svgNS, 'g');
    playerG.setAttribute('class', 'brwalker');
    playerG.innerHTML = avatar(0, 0, me, { tag: true });
    let curSide = null;

    const pos = { x: geo.W / 2, y: geo.D - 1.6 };
    const keys = new Set();
    let activeDoor = null, last = performance.now();

    function blocked(x, y) {
      if (x < 0.85 || x > geo.W - 0.85 || y < 0.95 || y > geo.D - 0.85) return true;
      if (x > T.x - blockPad && x < T.x + T.w + blockPad && y > T.y - blockPad && y < T.y + T.d + blockPad) return true;
      return false;
    }

    function nearestDoor() {
      let best = null, bestD = DOOR_R;
      for (const dr of geo.doors) {
        const dist = Math.hypot(dr.x - pos.x, dr.y - pos.y);
        if (dist < bestD) { bestD = dist; best = dr; }
      }
      return best;
    }

    function drawHint(dr) {
      if (!dr) { hintLayer.innerHTML = ''; return; }
      const [cx, cy] = iso(dr.x, dr.y, 70);
      const w = 62;
      hintLayer.innerHTML = `
        <rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - 16).toFixed(1)}" width="${w}" height="17" rx="8" fill="#1d4ed8"/>
        <polygon points="${(cx - 4).toFixed(1)},${(cy + 1).toFixed(1)} ${(cx + 4).toFixed(1)},${(cy + 1).toFixed(1)} ${cx.toFixed(1)},${(cy + 6).toFixed(1)}" fill="#1d4ed8"/>
        <text x="${cx.toFixed(1)}" y="${(cy - 4).toFixed(1)}" font-size="10.5" fill="#fff" text-anchor="middle" font-family="${PIXEL_FONT}">들어가기 ↵</text>`;
    }

    function setActiveDoor(dr) {
      const id = dr && dr.memberId;
      if ((activeDoor && activeDoor.memberId) === id) return;
      svg.querySelectorAll('.door-g.near').forEach(g => g.classList.remove('near'));
      if (dr) svg.querySelector(`.door-g[data-member="${dr.memberId}"]`)?.classList.add('near');
      activeDoor = dr;
      drawHint(dr);
    }

    function drawPlayer(moving) {
      const [sx, sy] = iso(pos.x, pos.y, 0);
      playerG.setAttribute('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
      playerG.classList.toggle('walking', moving);
      const side = (pos.x + pos.y) < tableKey ? 'back' : 'front';
      if (side !== curSide) { (side === 'back' ? backLayer : frontLayer).appendChild(playerG); curSide = side; }
    }

    function step(now) {
      if (!document.getElementById('hallTable') || !document.contains(svg)) { destroy(); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let vx = 0, vy = 0;
      keys.forEach(dir => { vx += DELTA[dir][0]; vy += DELTA[dir][1]; });
      const moving = vx !== 0 || vy !== 0;
      if (moving) {
        const len = Math.hypot(vx, vy) || 1;
        const mvx = (vx / len) * SPEED * dt, mvy = (vy / len) * SPEED * dt;
        if (!blocked(pos.x + mvx, pos.y)) pos.x += mvx;
        if (!blocked(pos.x, pos.y + mvy)) pos.y += mvy;
        setActiveDoor(nearestDoor());
      }
      drawPlayer(moving);
      ctl.raf = requestAnimationFrame(step);
    }

    function onKeyDown(e) {
      if (typingInField()) return;
      const k = e.key.toLowerCase();
      if (KEY_DIR[k]) { keys.add(KEY_DIR[k]); e.preventDefault(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && activeDoor) {
        e.preventDefault();
        const id = activeDoor.memberId;
        destroy();
        go('room', id);
      }
    }
    function onKeyUp(e) { const k = e.key.toLowerCase(); if (KEY_DIR[k]) keys.delete(KEY_DIR[k]); }
    function onBlur() { keys.clear(); }

    ctl = { raf: 0, onKeyDown, onKeyUp, onBlur };
    addEventListener('keydown', onKeyDown, true);
    addEventListener('keyup', onKeyUp, true);
    addEventListener('blur', onBlur);

    drawPlayer(false);
    setActiveDoor(nearestDoor());
    ctl.raf = requestAnimationFrame(step);
  }

  window.initHallPlayer = initHallPlayer;
})();
