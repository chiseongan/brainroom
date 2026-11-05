// 안내 문서(legal/*.html)의 운영자 칸을 채운다. 비어 있으면 숨기지 않고 '입력 필요'로 보여 준다.
(() => {
  document.querySelectorAll('[data-legal]').forEach(el => {
    const v = LEGAL[el.dataset.legal];
    el.textContent = v || '입력 필요';
    if (!v) el.classList.add('legal-missing');
    if (v && el.dataset.legal === 'contactEmail') {
      const a = document.createElement('a');
      a.href = `mailto:${v}`;
      a.textContent = v;
      el.replaceChildren(a);
    }
  });
  if (!LEGAL.reviewed) {
    const p = document.createElement('p');
    p.className = 'notice';
    p.textContent = '초안입니다. 운영자 정보를 채우고 법률 검토를 마치기 전에는 효력 있는 문서로 쓰지 마세요.';
    document.querySelector('main')?.prepend(p);
  }
})();
