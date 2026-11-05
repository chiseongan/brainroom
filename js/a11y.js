// 키보드 접근성: 그림 속 문·물건·카드처럼 마우스 클릭만 받던 것을 Tab으로 이동하고 Enter·Space로 누르게 한다.
// 창(모달)은 열리면 초점을 옮기고, 안에서만 돌며, 닫으면 원래 자리로 돌아온다.
const CLICKABLE = '[data-go], [data-zone], [data-scroll], .meeting-card, .room-card, [data-cloud-card]';
const NATIVE = 'a[href], button, input, select, textarea, summary';

// 그림 속 요소: 설명(title)에 화면에 보이는 글자까지 넣는다. 카드처럼 글이 있는 요소는 안의 글이 곧 이름이다
function svgLabel(el) {
  const title = [...el.children].find(c => c.tagName.toLowerCase() === 'title')?.textContent || '';
  const shown = [...el.querySelectorAll('text')].map(t => t.textContent).join(' ').replace(/\s+/g, ' ').trim();
  return (shown && !title.includes(shown) ? `${shown} ${title}` : title || shown).trim().slice(0, 160);
}

function enhanceKeyboard() {
  document.querySelectorAll('#app').forEach(root => root.querySelectorAll(CLICKABLE).forEach(el => {
    if (el.matches(NATIVE) || el.closest('.room.mini') || el.hasAttribute('tabindex')) return;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    if (el.closest('svg')) {
      const label = svgLabel(el);
      if (label) el.setAttribute('aria-label', label);
    }
  }));
}

if (typeof MutationObserver !== 'undefined' && document.getElementById('app')) {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhanceKeyboard(); });
  }).observe(document.getElementById('app'), { childList: true, subtree: true });
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target;
  if (!el?.matches?.('[role="button"][tabindex]') || el.matches(NATIVE)) return;
  e.preventDefault();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

// ---------- 창 ----------
let modalOpener = null;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function modalOpened(modal) {
  if (!modalOpener) modalOpener = document.activeElement;
  const heading = modal.querySelector('h1, h2, h3');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', heading?.textContent.trim() || '창');
  const first = modal.querySelector(FOCUSABLE);
  (first || modal).focus?.();
}

function modalClosed() {
  const back = modalOpener;
  modalOpener = null;
  if (back?.isConnected) back.focus?.();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const modal = document.getElementById('modal');
  if (!modal || modal.hidden || document.getElementById('uiDialog')) return;
  const list = [...modal.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
  if (!list.length) return;
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
});
