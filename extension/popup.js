const $ = s => document.querySelector(s);

async function refresh() {
  const { queue } = await chrome.runtime.sendMessage({ type: 'status' });
  $('#count').textContent = queue.length;
  $('#list').innerHTML = '';
  queue.slice(-8).reverse().forEach(q => {
    const li = document.createElement('li');
    li.textContent = q.kind === 'search' ? `🔍 ${q.search.query}` : `${q.conversation.tool} · ${q.conversation.title}`;
    $('#list').appendChild(li);
  });
}

chrome.storage.local.get({ appTarget: 'github', hideButton: false, exploring: false }, ({ appTarget, hideButton, exploring }) => {
  $('#target').value = appTarget;
  $('#showButton').checked = !hideButton;
  $('#exploring').checked = exploring;
});

async function refreshSearch() {
  const { log } = await chrome.runtime.sendMessage({ type: 'search-list' });
  const list = $('#searchList');
  list.innerHTML = '';
  if (!log.length) { list.innerHTML = '<li><small>아직 모은 검색이 없어요.</small></li>'; return; }
  [...log].reverse().slice(0, 30).forEach(s => {
    const li = document.createElement('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = s.id;
    const text = document.createElement('span');
    text.textContent = `${s.engine === 'Naver' ? 'N' : 'G'} · ${s.query}`;
    const sub = document.createElement('small');
    sub.textContent = s.clicks.length ? `누른 결과 ${s.clicks.length}개 · ${s.clicks[0].title}` : '누른 결과 없음';
    text.appendChild(sub);
    li.append(box, text);
    list.appendChild(li);
  });
}
$('#exploring').addEventListener('change', async e => { await chrome.runtime.sendMessage({ type: 'set-exploring', on: e.target.checked }); });
$('#searchSend').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#searchList input:checked')].map(b => b.value);
  if (!ids.length) return;
  await chrome.runtime.sendMessage({ type: 'search-send', ids });
  refresh();
  refreshSearch();
});
$('#searchClear').addEventListener('click', async () => {
  // 한 번 더 눌러야 지운다 (브라우저 기본 창을 쓰지 않는다)
  const btn = $('#searchClear');
  if (!btn.dataset.armed) {
    btn.dataset.armed = btn.textContent;
    btn.textContent = '한 번 더 누르면 모두 지워요';
    setTimeout(() => { btn.textContent = btn.dataset.armed; delete btn.dataset.armed; }, 3000);
    return;
  }
  await chrome.runtime.sendMessage({ type: 'search-clear' });
  refreshSearch();
});
refreshSearch();
$('#target').addEventListener('change', e => chrome.storage.local.set({ appTarget: e.target.value }));
$('#showButton').addEventListener('change', e => chrome.storage.local.set({ hideButton: !e.target.checked }));
$('#open').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'open-app' }); window.close(); });
$('#clear').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'clear' }); refresh(); });
refresh();
