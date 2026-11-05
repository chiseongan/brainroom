// 브라우저 기본 창(confirm·prompt·alert) 대신 쓰는 앱 안의 확인 창.
// 글은 전부 textContent로 넣으므로 기록 제목 같은 값이 들어가도 HTML로 해석되지 않는다.

let dialogChain = Promise.resolve();

// buttons: [{ label, value, kind: 'primary' | 'danger' | undefined }]. 마지막 단추가 주된 동작이다. Esc·바깥 누르기는 cancelValue
// input: { value, placeholder, multiline, label, maxLength, mustEqual } → 입력이 있으면 주된 동작의 값은 입력한 글자
function uiDialog(opts) {
  if (typeof window.__testDialog === 'function') return Promise.resolve(window.__testDialog(opts)); // E2E 전용
  const run = dialogChain.then(() => showDialog(opts));
  dialogChain = run.catch(() => {});
  return run;
}

function showDialog({ title, message = '', input = null, buttons, cancelValue = null }) {
  return new Promise(resolve => {
    const opener = document.activeElement;
    const root = document.createElement('div');
    root.className = 'ui-dialog';
    root.id = 'uiDialog';
    const card = document.createElement('div');
    card.className = 'ui-dialog-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'uiDialogTitle');
    const h = document.createElement('h2');
    h.id = 'uiDialogTitle';
    h.textContent = title;
    card.appendChild(h);
    if (message) {
      const p = document.createElement('p');
      p.id = 'uiDialogMessage';
      p.className = 'ui-dialog-message';
      p.textContent = message;
      card.setAttribute('aria-describedby', p.id);
      card.appendChild(p);
    }
    let field = null;
    if (input) {
      const label = document.createElement('label');
      label.className = 'ui-dialog-field';
      label.textContent = input.label || '내용';
      field = document.createElement(input.multiline ? 'textarea' : 'input');
      if (input.multiline) field.rows = 4;
      field.value = input.value || '';
      field.placeholder = input.placeholder || '';
      if (input.maxLength) field.maxLength = input.maxLength;
      field.autocomplete = 'off';
      label.appendChild(field);
      card.appendChild(label);
    }
    const row = document.createElement('div');
    row.className = 'ui-dialog-actions';
    const main = buttons[buttons.length - 1];
    let mainBtn = null;
    const finish = value => {
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      if (opener?.isConnected) opener.focus?.();
      resolve(value);
    };
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn${b.kind ? ` ${b.kind}` : ''}`;
      el.textContent = b.label;
      el.addEventListener('click', () => finish(b === main && field ? field.value : b.value));
      if (b === main) mainBtn = el;
      row.appendChild(el);
    });
    card.appendChild(row);
    root.appendChild(card);
    const sync = () => { if (field && mainBtn) mainBtn.disabled = input.mustEqual ? field.value.trim() !== input.mustEqual : !field.value.trim(); };
    field?.addEventListener('input', sync);
    sync();
    root.addEventListener('mousedown', e => { if (e.target === root) finish(cancelValue); });
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation(); // 뒤에 있는 창까지 닫지 않는다
        finish(cancelValue);
      } else if (e.key === 'Enter' && field && e.target === field && (!input.multiline || e.ctrlKey) && !mainBtn.disabled) {
        e.preventDefault();
        finish(field.value);
      } else if (e.key === 'Tab') {
        const list = [...card.querySelectorAll('button:not([disabled]), input, textarea')];
        const first = list[0], last = list[list.length - 1];
        e.stopImmediatePropagation(); // 뒤에 있는 창의 초점 가두기와 겹치지 않게
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    // 지우는 동작은 실수로 Enter를 눌러도 실행되지 않게 취소 쪽에 초점을 둔다
    if (field) { field.focus(); field.select?.(); }
    else (main.kind === 'danger' ? row.firstChild : mainBtn).focus();
  });
}

async function uiConfirm(title, message, { ok = '확인', cancel = '취소', danger = false } = {}) {
  return (await uiDialog({ title, message, cancelValue: false, buttons: [{ label: cancel, value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }] })) === true;
}

async function uiPrompt(title, message, { value = '', ok = '확인', placeholder = '', multiline = false, label, mustEqual, danger = false } = {}) {
  const res = await uiDialog({ title, message, input: { value, placeholder, multiline, label, mustEqual }, cancelValue: null, buttons: [{ label: '취소', value: null }, { label: ok, value: 'ok', kind: danger ? 'danger' : 'primary' }] });
  return typeof res === 'string' ? res : null;
}
