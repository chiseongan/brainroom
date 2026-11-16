// 시작화면: 아주 작은 모래알이 커서에 반응하고, 스크롤로 확대할수록 알갱이가 단어였음이 드러나며,
// 마지막엔 모든 알갱이가 하나의 공으로 모여 화면 전체로 퍼진다.
// 사용자가 만든 시작화면 초안(chatgpt.site)의 구조에 모래 연출을 얹은 것. 색은 앱 토큰(샌드·테라코타)을 쓴다.
// 로그인·샘플 체험 버튼 같은 동작은 app.js(renderLogin)가 ctaHTML로 넘겨 준다.

// 확대하면 보이는 단어들: 팀플에서 흩어져 있는 조각들
const LP_WORDS = ['자료', '메모', '아이디어', '질문', '커밋', '이슈', '풀리퀘', '노션', '피그마', '슬랙', '기획', '인터뷰',
  '설문', '회의', '결정', '마감', '발표', '요구사항', '설계', '테스트', '피드백', '링크', '초안', '가설', '사용자', '문제',
  '해결', '연결', '발견', '정리', '방향', '일정', '역할', '기록', '키워드', '주제', '비교', '사례', '통계', '스케치'];
// 모래알 색과 비중: 대부분은 흙빛 중간톤, 소수의 진한 알갱이와 밝게 반짝이는 알갱이가 섞여 질감을 만든다
const LP_GRAIN_TOKENS = ['--dot-1', '--dot-2', '--dot-3', '--dot-4', '--dot-5', '--dot-6', '--dot-7', '--dot-dim', '--surface'];
const LP_GRAIN_WEIGHTS = [.06, .10, .09, .07, .17, .20, .19, .09, .03];
const LP_GRAIN_ALPHAS = [1, .8, .55]; // 같은 색도 알갱이마다 농도가 다르다
const LP_WORD_TOKENS = ['--dot-1', '--dot-3', '--dot-4', '--primary', '--muted'];

function landingHTML(ctaHTML) {
  return `
  <div class="lp" id="lpTop">
    <header class="lp-nav">
      <button class="lp-brand" data-lp-scroll="lpTop" aria-label="BrainRoom 처음으로"><span class="lp-mark" aria-hidden="true"><i></i><i></i><i></i></span>BrainRoom<span class="lp-brand-dot">.</span></button>
      <div class="lp-nav-right"><span class="lp-nav-note">A SPACE FOR IDEAS</span><button class="lp-button" data-lp-scroll="lpStart">시작하기 <span aria-hidden="true">↗</span></button></div>
    </header>
    <section class="lp-experience" aria-label="흩어진 모래알이 단어가 되고, 하나의 공으로 모이는 과정">
      <div class="lp-stage" id="lpStage">
        <div class="lp-opening"><div class="lp-micro">A LITTLE SPACE FOR BIG IDEAS</div><h1>흩어진 생각이<br>하나의 방향이 되도록.</h1><p>각자가 찾은 작은 발견에서, 우리 팀의 다음 아이디어까지.</p></div>
        <div class="lp-dots-field" aria-hidden="true"><div class="lp-whole"></div><canvas class="lp-canvas" id="lpCanvas"></canvas></div>
        <div class="lp-ending"><div class="lp-micro">THINK TOGETHER</div><h2>생각은 모일수록<br>더 멀리 나아가니까.</h2><p>흩어진 기록이 만나는 곳, BrainRoom.</p></div>
        <div class="lp-track" aria-hidden="true"><span>01</span><span class="lp-trackline"></span><span>03</span></div><div class="lp-scroll-cue" aria-hidden="true">MOVE YOUR CURSOR · SCROLL TO ZOOM ↓</div>
      </div>
    </section>
    <section class="lp-intro" aria-labelledby="lpIntroTitle"><div class="lp-eyebrow">01 / THE IDEA</div><div><h2 id="lpIntroTitle">좋은 아이디어는<br><span>혼자 완성되지 않으니까.</span></h2><p>한 사람의 메모, 또 다른 사람의 질문, 우연히 발견한 자료까지. 각자의 생각이 만나는 순간 우리 팀만의 방향이 시작됩니다.</p></div></section>
    <section class="lp-steps" aria-labelledby="lpStepsTitle"><div class="lp-section-header"><span class="lp-eyebrow" id="lpStepsTitle">02 / HOW IT WORKS</span><span class="lp-eyebrow">THINK BETTER, TOGETHER</span></div>
      <div class="lp-grid">
        <article class="lp-step"><span class="lp-step-index">01 / COLLECT</span><h3>흩어진 생각을 모으고</h3><p>GitHub 커밋·이슈, 노션 문서, 피그마 작업과 메모를 한 피드에 담아요.</p></article>
        <article class="lp-step"><span class="lp-step-index">02 / CONNECT</span><h3>서로의 관점을 연결하고</h3><p>팀원들의 기록에서 새로운 연결점을 발견해요.</p></article>
        <article class="lp-step"><span class="lp-step-index">03 / CREATE</span><h3>함께 다음을 만들어요</h3><p>모인 생각을 마일스톤·산출물·결정으로 정리해요.</p></article>
      </div></section>
    <section class="lp-end" id="lpStart"><div class="lp-eyebrow">A LITTLE SPACE FOR BIG IDEAS</div><h2>우리의 생각이<br>시작되는 공간.</h2><p>생각을 모으는 새로운 방법, BrainRoom.</p>${ctaHTML}
      <div class="lp-footer"><strong>BrainRoom.</strong><span>흩어진 팀플 조각을 한곳에</span></div></section>
  </div>`;
}

// 시험과 화면 확인용: 지금 모래 연출의 상태
function landingStats() {
  return lpCtl ? lpCtl.stats() : null;
}

let lpCtl = null;

function initLanding() {
  if (lpCtl) lpCtl.stop();
  lpCtl = null;
  const stage = document.getElementById('lpStage');
  const experience = document.querySelector('.lp-experience');
  const canvas = document.getElementById('lpCanvas');
  if (!stage || !experience || !canvas) return;
  const ctx = canvas.getContext('2d');
  const whole = stage.querySelector('.lp-whole');
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const tok = name => css.getPropertyValue(name).trim() || '#999';
  const grainColors = LP_GRAIN_TOKENS.map(tok);
  const wordColors = LP_WORD_TOKENS.map(tok);
  const ballColor = tok('--primary');
  const font = getComputedStyle(document.body).fontFamily;

  let W = 0, H = 0, cx = 0, cy = 0, parts = [], groups = [], wordParts = [];
  const view = { z: 1, c: 0, wordAlpha: 0, fade: 1 };
  const stats = { wordsVisible: 0, displaced: 0 };
  const pointer = { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0 };
  let raf = 0, last = 0, time = 0;

  // 화면 크기에 맞춰 모래알을 새로 깐다. 흩어진 격자(jittered grid)라 고르게 퍼지면서도 자연스럽다
  function build() {
    W = stage.clientWidth; H = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H * .5;
    const n = clamp(Math.round(W * H / 75), 1800, 15000); // 아주 촘촘하게: 낱알은 안 보이고 질감만 보이도록
    const fx = -W * .06, fy = -H * .08, fw = W * 1.12, fh = H * 1.16;
    const ballR = Math.max(60, whole.offsetWidth / 2) * .92;
    const wsum = LP_GRAIN_WEIGHTS.reduce((a, b) => a + b, 0);
    const pick = () => { let r = Math.random() * wsum; for (let i = 0; i < LP_GRAIN_WEIGHTS.length; i++) { r -= LP_GRAIN_WEIGHTS[i]; if (r <= 0) return i; } return 0; };
    // 바람이 만든 물결(ripple)처럼 알갱이가 결을 따라 더 뭉치고 덜 뭉친다
    const ripple = (x, y) => .5 + .5 * Math.sin(y * .021 + Math.sin(x * .004) * 3.2 + Math.sin(x * .013 + y * .004) * 1.1);
    parts = [];
    while (parts.length < n) {
      const x = fx + Math.random() * fw, y = fy + Math.random() * fh;
      if (Math.random() > .38 + .62 * ripple(x, y)) continue;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * ballR; // 공 안의 한 점
      const r = Math.random();
      parts.push({
        hx: x, hy: y, x, y, vx: 0, vy: 0,
        bx: cx + Math.cos(a) * d, by: cy + Math.sin(a) * d,
        s: r < .03 ? 2 + Math.random() * .9 : .95 + r * r * 1.1, // 거의 다 고운 알갱이, 드물게 굵은 알갱이
        g: pick(), al: Math.floor(Math.random() * LP_GRAIN_ALPHAS.length),
        w: Math.random() < .35 ? LP_WORDS[Math.floor(Math.random() * LP_WORDS.length)] : null, // 일부 알갱이만 단어가 된다
        wc: Math.floor(Math.random() * wordColors.length),
        m: .75 + Math.random() * .6,
        th: Math.random(), // 단어로 드러나는 순서
        ms: .6 + Math.random() * .9, // 알갱이마다 가볍고 무거움
        ph: Math.random() * Math.PI * 2,
      });
    }
    groups = [];
    grainColors.forEach((_, g) => LP_GRAIN_ALPHAS.forEach((__, a) => groups.push(parts.filter(p => p.g === g && p.al === a))));
    wordParts = parts.filter(p => p.w);
  }

  // 스크롤 위치(0~1) → 장면. 앞부분은 모래, 가운데는 확대해서 단어, 뒤는 하나의 공으로 모여 퍼짐
  function scene() {
    const rect = experience.getBoundingClientRect();
    const distance = experience.offsetHeight - stage.offsetHeight;
    const p = clamp(-rect.top / Math.max(1, distance));
    const zoomCurve = smooth((p - .05) / .30) * (1 - smooth((p - .42) / .12)); // 먼저 줌이 풀리고
    view.z = 1 + 9 * zoomCurve;
    view.c = smooth((p - .48) / .24); // 그다음 알갱이들이 모인다
    view.wordAlpha = smooth((view.z - 3.2) / 3.4) * (1 - smooth((p - .39) / .09)); // 줌이 풀리기 시작하면 글자가 다시 알갱이로 흩어진다
    view.fade = 1 - smooth((p - .78) / .06); // 알갱이가 공을 이룬 뒤에야 바닥의 공으로 넘어간다
    const expand = smooth((p - .82) / .15);
    const opening = 1 - smooth((p - .03) / .10);
    const ending = smooth((p - .66) / .06) * (1 - smooth((p - .78) / .06));
        // 공의 중심은 무대 높이의 50%. 모서리까지 덮도록 조금 더 키워, 같은 색인 다음 장면과 이어진다
    const coverScale = (2 * Math.hypot(stage.clientWidth / 2, H * .5) / whole.offsetWidth) + .1;
    const set = (k, v) => stage.style.setProperty(k, v);
    set('--progress', p.toFixed(3));
    set('--opening', opening.toFixed(3));
    set('--ending', ending.toFixed(3));
    set('--end-shift', ((1 - ending) * 18).toFixed(2));
    set('--expand', expand.toFixed(4));
    set('--whole-scale', (.9 + expand * (coverScale - .9)).toFixed(4)); // 공의 바닥: 알갱이가 만든 가장자리보다 살짝 안쪽
    set('--whole-opacity', smooth((p - .68) / .06).toFixed(3)); // 알갱이가 다 모인 뒤 틈을 메우듯 서서히
    return { rect, p, expand };
  }

  function step(dt) {
    const { z, c } = view;
    // 흩어진 모래는 마찰이 커서 밀려난 자리에 거의 그대로 쌓이고, 아주 천천히 제자리로 흘러내린다.
    // 모일 때(c→1)만 강하게 당긴다
    const k = lerp(1.5, 55, c * c), damp = lerp(5.5, 14, c);
    const live = pointer.on && time - pointer.t < 1.2 && c < .35;
    const pwx = cx + (pointer.x - cx) / z, pwy = cy + (pointer.y - cy) / z; // 확대 중심은 (cx, cy)
    const R = 190 / z, R2 = R * R;
    let displaced = 0;
    for (const q of parts) {
      // 곧장 날아가지 않고 살짝 소용돌이치며 모인다
      const sw = Math.sin(Math.PI * c) * .16;
      const tx = lerp(q.hx, q.bx, c) - (q.by - q.hy) * sw + Math.sin(time * .6 + q.ph) * .5 * (1 - c);
      const ty = lerp(q.hy, q.by, c) + (q.bx - q.hx) * sw + Math.cos(time * .5 + q.ph * 1.3) * .5 * (1 - c);
      let ax = (tx - q.x) * k - q.vx * damp, ay = (ty - q.y) * k - q.vy * damp;
      if (live) {
        const dx = q.x - pwx, dy = q.y - pwy, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1, f = 1 - d / R, f2 = f * f;
          // 쓸어내는 힘(커서 진행 방향) + 바깥으로 밀어내는 힘 + 튀어 오르는 흩날림
          const push = f2 * 9000 * q.ms / z, drag = f * 3.4 * q.ms / z, spray = f * 1400 * q.ms;
          ax += (dx / d) * push + pointer.vx * drag + (Math.random() - .5) * spray;
          ay += (dy / d) * push + pointer.vy * drag + (Math.random() - .5) * spray;
        }
      }
      q.vx += ax * dt; q.vy += ay * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (Math.abs(q.x - q.hx) > 3 || Math.abs(q.y - q.hy) > 3) displaced++;
    }
    stats.displaced = displaced;
  }

  function draw(expand) {
    ctx.clearRect(0, 0, W, H);
    if (expand > .985) return; // 공이 화면을 다 덮었으면 그릴 필요 없음
    const { z, wordAlpha, fade } = view;
    const grainAlpha = (1 - .88 * wordAlpha) * fade;
    // 모일수록 알갱이는 굵어지고 공의 색(테라코타)으로 물든다. 그래서 공이 갑자기 나타나지 않고 모래가 뭉쳐 공이 된다
    const tint = smooth((view.c - .25) / .6);
    const grow = 1 + view.c * 1.9;
    if (grainAlpha > .01) {
      groups.forEach((list, gi) => {
        ctx.fillStyle = grainColors[Math.floor(gi / LP_GRAIN_ALPHAS.length)];
        ctx.globalAlpha = grainAlpha * LP_GRAIN_ALPHAS[gi % LP_GRAIN_ALPHAS.length] * (1 - tint);
        if (ctx.globalAlpha < .01) return;
        for (const q of list) {
          const sx = cx + (q.x - cx) * z, sy = cy + (q.y - cy) * z;
          if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
          const gs = q.s * (1 + (z - 1) * .3) * grow;
          ctx.fillRect(sx - gs / 2, sy - gs / 2, gs, gs);
        }
      });
      if (tint > .01) {
        ctx.fillStyle = ballColor; ctx.globalAlpha = grainAlpha * tint;
        for (const q of parts) {
          const sx = cx + (q.x - cx) * z, sy = cy + (q.y - cy) * z;
          if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) continue;
          const gs = q.s * (1 + (z - 1) * .3) * grow;
          ctx.fillRect(sx - gs / 2, sy - gs / 2, gs, gs);
        }
      }
    }
    // 단어: 충분히 확대되면 알갱이 자리에 글자가 드러난다
    let words = 0;
    if (wordAlpha > .03 && fade > .01) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const q of wordParts) {
        const sx = cx + (q.x - cx) * z, sy = cy + (q.y - cy) * z;
        if (sx < -60 || sx > W + 60 || sy < -30 || sy > H + 30) continue;
        const fs = clamp(3 * z * q.m, 8, 64);
        ctx.font = `500 ${fs.toFixed(1)}px ${font}`;
        ctx.globalAlpha = clamp((wordAlpha - q.th * .55) / .45) * fade; // 알갱이마다 차례로 글자가 된다
        if (ctx.globalAlpha < .02) continue;
        ctx.fillStyle = wordColors[q.wc];
        ctx.fillText(q.w, sx, sy);
        words++;
      }
    }
    ctx.globalAlpha = 1;
    stats.wordsVisible = words;
  }

  function frame(now) {
    raf = 0;
    if (!document.contains(stage)) { stop(); return; }
    const dt = Math.min(.033, Math.max(.001, (now - (last || now)) / 1000) || .016);
    last = now; time += dt;
    const s = scene();
    if (s.rect.bottom > 0 && s.rect.top < innerHeight) { // 화면에 보일 때만 움직이고 그린다
      step(dt);
      pointer.vx *= .9; pointer.vy *= .9;
      draw(s.expand);
    }
    raf = requestAnimationFrame(frame);
  }

  function onMove(e) {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const dt = Math.max(.008, (e.timeStamp - (pointer.ts || e.timeStamp)) / 1000 || .016);
    if (pointer.on) { pointer.vx = pointer.vx * .6 + ((x - pointer.x) / dt) * .4; pointer.vy = pointer.vy * .6 + ((y - pointer.y) / dt) * .4; }
    pointer.x = x; pointer.y = y; pointer.on = true; pointer.t = time; pointer.ts = e.timeStamp;
  }
  function onLeave() { pointer.on = false; }
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (document.contains(stage) && (stage.clientWidth !== W || stage.clientHeight !== H)) build(); }, 120);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0; clearTimeout(resizeTimer);
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    removeEventListener('resize', onResize);
    if (lpCtl && lpCtl.stop === stop) lpCtl = null;
  }

  build();
  lpCtl = { stop, stats: () => ({ count: parts.length, zoom: view.z, converge: view.c, wordsVisible: stats.wordsVisible, displaced: stats.displaced }) };
  document.querySelectorAll('[data-lp-scroll]').forEach(b => {
    b.onclick = () => document.getElementById(b.dataset.lpScroll)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  });
  const s0 = scene();
  draw(s0.expand);
  if (calm) return; // 동작 줄이기: 정지한 한 장면만 (CSS도 같은 장면으로 고정)
  addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  addEventListener('resize', onResize, { passive: true });
  raf = requestAnimationFrame(frame);
}
