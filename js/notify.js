// 앱 안의 알림: 상단 🔔 알림함과 화면 구석의 알림 카드.
// 보고 있는 데이터(공유 범위로 이미 걸러진 state)에서 만들므로 볼 권한이 없는 내용은 알림에도 나오지 않는다.
// 읽은 시각은 이 브라우저에만 저장한다. 브라우저를 닫은 동안의 소식은 다음에 열 때 알림함에 모인다.

const NOTIFY_DAYS = 14;
const NOTIFY_MAX = 30;
const notifyLive = { scope: null, shown: new Set() };
let notifyList = [];

function notifyScope() {
  if (guestMode) return 'guest';
  return cloudOn() && !isProfView() ? cloud.teamId : null;
}

function notifyKey(scope) {
  return `brainroom:notify:${scope}:${authUser?.uid || 'guest'}`;
}

function loadNotify(scope) {
  try {
    const saved = JSON.parse(localStorage.getItem(notifyKey(scope)));
    if (saved) return saved;
  } catch (e) { /* 아래 기본값 */ }
  // 처음에는 지난 소식을 쏟아내지 않는다. 샘플은 어떻게 보이는지 알 수 있게 최근 이틀을 보여 준다
  return { seenAt: scope === 'guest' ? Date.now() - 2 * 864e5 : Date.now(), popups: true };
}

function saveNotify(scope, data) {
  if (scope === 'guest') { notifyLive.guest = data; return; }
  try { localStorage.setItem(notifyKey(scope), JSON.stringify(data)); } catch (e) { /* 무시 */ }
}

function notifyPrefs(scope) {
  if (scope === 'guest' && notifyLive.guest) return notifyLive.guest;
  const data = loadNotify(scope);
  if (scope === 'guest') notifyLive.guest = data; else saveNotify(scope, data);
  return data;
}

// 다른 팀원이 한 일만 소식이 된다. 자동으로 들어오는 작업·발언 기록은 많아서 뺀다
function notifyEvents() {
  const me = state.meId;
  const myUid = authUser?.uid;
  const nameOf = id => member(id)?.name || '팀원';
  const out = [];
  const since = Date.now() - NOTIFY_DAYS * 864e5;
  state.items.forEach(i => {
    if (i.memberId === me || i._stub || ['work', 'talk', 'search'].includes(i.type)) return;
    out.push({ key: `item:${i.id}`, at: i.createdAt, icon: TYPE_META[i.type].icon, text: `${nameOf(i.memberId)}님이 ${TYPE_META[i.type].label}를 담았어요`, sub: i.title, go: ['room', i.memberId] });
  });
  (state.decisions || []).forEach(d => {
    if (d.createdBy && d.createdBy !== me) out.push({ key: `dec:${d.id}`, at: d.createdAt, icon: '✅', text: `${nameOf(d.createdBy)}님이 결정을 기록했어요`, sub: d.text, go: ['decisions'] });
  });
  (state.corrections || []).forEach(c => {
    if (c.status === 'pending' && c.memberId !== me) out.push({ key: `corr:${c.id}`, at: c.createdAt, icon: '✏️', text: `${nameOf(c.memberId)}님이 기여 보정 확인을 요청했어요`, sub: c.note || c.title || '', go: ['report'] });
  });
  (state.changeLog || []).forEach((l, n) => {
    if (l.by && l.by !== myUid) out.push({ key: `log:${l.id || n}`, at: l.at, icon: '📝', text: '기여 보정이 반영됐어요', sub: l.text, go: ['report'] });
  });
  (state.calls || []).forEach(c => {
    if (c.status === 'live' && c.startedBy !== myUid) out.push({ key: `live:${c.id}`, at: c.startedAt, icon: '🔴', text: `${c.startedByName || '팀원'}님이 회의를 시작했어요`, sub: c.title, go: ['calls'] });
    if (c.status === 'ended' && c.summary && c.closedBy !== myUid) out.push({ key: `end:${c.id}`, at: c.endedAt || c.startedAt, icon: '🎙️', text: '회의 요약이 올라왔어요', sub: c.title, go: ['calls'] });
  });
  return out.filter(e => e.at >= since && e.at <= Date.now() + 864e5).sort((a, b) => b.at - a.at).slice(0, NOTIFY_MAX);
}

function notifyOpen(ev) {
  if (ev.go[0] === 'room') go('room', ev.go[1]); else go(ev.go[0]);
}

// 상태가 바뀔 때마다 부른다: 숫자를 고치고, 방금 생긴 소식은 알림 카드로 띄운다
function notifyRefresh() {
  const menu = document.getElementById('notifyMenu');
  if (!menu) return;
  const scope = state && !state.cloudProf ? notifyScope() : null;
  menu.hidden = !scope || Boolean(cloudOn() && !cloud.loaded);
  if (menu.hidden) { document.title = 'BrainRoom'; return; }
  if (notifyLive.scope !== scope) {
    notifyLive.scope = scope;
    notifyLive.shown = null; // 처음 받은 목록은 이미 있던 소식이라 띄우지 않는다
    menu.open = false;
  }
  const prefs = notifyPrefs(scope);
  notifyList = notifyEvents();
  const unread = notifyList.filter(e => e.at > prefs.seenAt);
  const badge = document.getElementById('notifyBadge');
  badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
  badge.hidden = !unread.length;
  document.getElementById('notifyLabel').textContent = unread.length ? `알림 ${unread.length}개 읽지 않음` : '알림';
  document.title = unread.length ? `(${unread.length}) BrainRoom` : 'BrainRoom';
  if (notifyLive.shown) {
    const fresh = unread.filter(e => !notifyLive.shown.has(e.key));
    if (prefs.popups && !menu.open) {
      fresh.slice(0, 2).forEach(e => toast(e.text, { kind: 'notify', icon: e.icon, sub: e.sub, action: { label: '보기', fn: () => notifyOpen(e) }, ms: 6000 }));
      if (fresh.length > 2) toast(`새 소식이 ${fresh.length - 2}개 더 있어요`, { kind: 'notify', icon: '🔔', action: { label: '알림함', fn: () => { menu.open = true; } } });
    }
  }
  notifyLive.shown = new Set(notifyList.map(e => e.key));
  if (menu.open) renderNotifyPanel();
}

function renderNotifyPanel() {
  const scope = notifyLive.scope;
  const prefs = notifyPrefs(scope);
  document.getElementById('notifyPanel').innerHTML = `
    <div class="notify-head"><b>알림</b><button type="button" class="link-btn" data-notify="read">모두 읽음</button></div>
    <div class="notify-list">${notifyList.map((e, i) => `
      <button type="button" class="notify-item ${e.at > prefs.seenAt ? 'unread' : ''}" data-notify="open:${i}">
        <span class="notify-icon" aria-hidden="true">${e.icon}</span>
        <span class="notify-body"><span class="notify-text">${esc(e.text)}</span>
          ${e.sub ? `<span class="notify-sub">${esc(trunc(e.sub, 60))}</span>` : ''}
          <span class="notify-time">${e.at > prefs.seenAt ? '<b>새 소식</b> · ' : ''}${fmtDate(e.at)}</span></span>
      </button>`).join('') || '<p class="notify-empty">아직 새 소식이 없어요. 팀원이 기록을 담거나 회의를 시작하면 여기에 모여요.</p>'}</div>
    <label class="notify-pref"><input type="checkbox" data-notify="popups" ${prefs.popups ? 'checked' : ''}> 새 소식을 알림 카드로 띄우기</label>`;
}

function notifyMarkRead() {
  const scope = notifyLive.scope;
  if (!scope) return;
  saveNotify(scope, { ...notifyPrefs(scope), seenAt: Date.now() });
  notifyRefresh();
}

document.addEventListener('toggle', e => {
  if (e.target.id !== 'notifyMenu') return;
  if (e.target.open) renderNotifyPanel();
  else notifyMarkRead(); // 닫으면 본 것으로 친다
}, true);

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-notify]');
  if (!btn || btn.dataset.notify === 'popups') return;
  const [act, arg] = btn.dataset.notify.split(':');
  if (act === 'read') {
    notifyMarkRead();
    renderNotifyPanel();
  } else if (act === 'open') {
    const ev = notifyList[+arg];
    document.getElementById('notifyMenu').open = false;
    if (ev) notifyOpen(ev);
  }
});

document.addEventListener('change', e => {
  if (e.target.dataset?.notify !== 'popups') return;
  const scope = notifyLive.scope;
  saveNotify(scope, { ...notifyPrefs(scope), popups: e.target.checked });
});
