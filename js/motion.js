// 커서에 반응하는 화면: 카드 위 빛(spotlight), 방 카드·회의실 그림의 3D 기울기, 단추의 자석 효과, 화면 전환 애니메이션.
// 모두 꾸밈이라 기능에는 손대지 않는다. '동작 줄이기' 설정이나 터치 기기에서는 커서 효과를 끈다.
// 값은 CSS 변수(--mx, --my, --rx, --ry, --tx, --ty)로만 넘기고 그리기는 css/style.css의 '인터랙션 층'이 맡는다.

const MOTION_CALM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION_FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const GLOW = '.feed-card, .rail-card, .card, .room-card, .meeting-card, .lp-step, .report-card, .ai-card, .item-card, .quest, .tl-row, .cmdk-card';
const TILT = '.room-card, .meeting-card, .lp-step';
const MAGNET = '.lp-button, .btn.primary';
const PARALLAX = '.hall';
const motionRaf = { glow: 0, tilt: 0 };

function motionTilt(el, e, maxDeg) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
  el.style.setProperty('--ry', `${(px * maxDeg * 2).toFixed(2)}deg`);
  el.style.setProperty('--rx', `${(-py * maxDeg * 2).toFixed(2)}deg`);
  el.classList.add('is-tilting');
}

function motionUntilt(el) {
  el.classList.remove('is-tilting');
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
}

function motionMagnet(el, e) {
  const r = el.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const reach = Math.max(r.width, r.height) * .9;
  const d = Math.hypot(dx, dy);
  if (d > reach) { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); return; }
  const pull = (1 - d / reach) * 5; // 가까울수록 최대 5px까지 끌려온다
  el.style.setProperty('--tx', `${(dx / (d || 1) * pull).toFixed(2)}px`);
  el.style.setProperty('--ty', `${(dy / (d || 1) * pull).toFixed(2)}px`);
}

function motionOnMove(e) {
  if (e.pointerType === 'touch') return;
  const glow = e.target.closest?.(GLOW);
  if (glow) {
    const r = glow.getBoundingClientRect();
    glow.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(1)}px`);
    glow.style.setProperty('--my', `${(e.clientY - r.top).toFixed(1)}px`);
  }
  const tilt = e.target.closest?.(TILT);
  if (tilt) motionTilt(tilt, e, 4);
  const hall = e.target.closest?.(PARALLAX);
  if (hall) motionTilt(hall, e, 1.6);
  const magnet = e.target.closest?.(MAGNET);
  if (magnet) motionMagnet(magnet, e);
}

function motionOnOut(e) {
  if (e.pointerType === 'touch') return;
  const from = e.target.closest?.(`${TILT}, ${PARALLAX}, ${MAGNET}`);
  if (!from || from.contains(e.relatedTarget)) return;
  if (from.matches(MAGNET)) { from.style.setProperty('--tx', '0px'); from.style.setProperty('--ty', '0px'); }
  else motionUntilt(from);
}

// 화면이 바뀔 때(#app의 직계 자식이 새로 들어올 때) 새 화면에 등장 애니메이션 클래스를 붙인다.
// 애니메이션은 유한하므로 E2E의 접근성 검사는 끝날 때까지 기다린 뒤 잰다.
function motionWatchPages() {
  const app = document.getElementById('app');
  if (!app || typeof MutationObserver === 'undefined') return;
  const mark = () => {
    const first = app.firstElementChild;
    if (!first || first.classList.contains('lp') || first.classList.contains('page-enter')) return;
    first.classList.add('page-enter');
    first.addEventListener('animationend', () => first.classList.remove('page-enter'), { once: true });
  };
  new MutationObserver(records => {
    if (records.some(r => r.target === app && r.addedNodes.length)) mark();
  }).observe(app, { childList: true });
}

function motionInit() {
  document.documentElement.classList.toggle('motion-fine', MOTION_FINE && !MOTION_CALM);
  if (!MOTION_CALM) motionWatchPages();
  if (MOTION_CALM || !MOTION_FINE) return;
  document.addEventListener('pointermove', motionOnMove, { passive: true });
  document.addEventListener('pointerout', motionOnOut, { passive: true });
}

if (typeof document !== 'undefined' && document.getElementById('app')) motionInit();
