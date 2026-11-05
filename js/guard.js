// 다른 사이트가 이 앱을 iframe으로 덮어 클릭을 가로채지 못하게 한다 (GitHub Pages는 X-Frame-Options 헤더를 줄 수 없다)
(() => {
  if (window.top === window.self) return;
  let sameOrigin = false;
  try { sameOrigin = window.top.location.origin === location.origin; } catch (e) { /* 다른 출처 */ }
  if (sameOrigin) return;
  document.documentElement.textContent = '';
  try { window.top.location.href = location.href; } catch (e) { /* sandbox: 빈 화면으로 둔다 */ }
})();
