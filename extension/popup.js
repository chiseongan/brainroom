const $ = s => document.querySelector(s);

async function refresh() {
  const { queue } = await chrome.runtime.sendMessage({ type: 'status' });
  $('#count').textContent = queue.length;
  $('#list').innerHTML = '';
  queue.slice(-8).reverse().forEach(q => {
    const li = document.createElement('li');
    li.textContent = `${q.conversation.tool} · ${q.conversation.title}`;
    $('#list').appendChild(li);
  });
}

chrome.storage.local.get({ appTarget: 'github', hideButton: false }, ({ appTarget, hideButton }) => {
  $('#target').value = appTarget;
  $('#showButton').checked = !hideButton;
});
$('#target').addEventListener('change', e => chrome.storage.local.set({ appTarget: e.target.value }));
$('#showButton').addEventListener('change', e => chrome.storage.local.set({ hideButton: !e.target.checked }));
$('#open').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'open-app' }); window.close(); });
$('#clear').addEventListener('click', async () => { await chrome.runtime.sendMessage({ type: 'clear' }); refresh(); });
refresh();
