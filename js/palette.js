// ⌘K 명령 팔레트: 화면 이동, 팀원 방, 자주 쓰는 동작, 기록 검색을 키보드로. Linear·Notion·Raycast의 커맨드 팔레트 방식.
// 한글은 초성으로도 찾는다(ㅌㅇㄹ → 타임라인). 열려 있는 동안 초점은 팔레트 안에서만 돌고, 닫으면 원래 자리로 돌아온다.
// 시작화면·설정 화면(상단바가 숨겨진 상태)에서는 열리지 않는다.

const PALETTE_VIEWS = [
  { view: 'workspace', label: '워크스페이스', hint: '활동 피드 · 마일스톤 · 산출물', icon: '◎', key: '1' },
  { view: 'timeline', label: '타임라인', hint: '기록과 결정을 시간순으로', icon: '◷', key: '2' },
  { view: 'decisions', label: '결정 기록', hint: '정한 것 · 후보 · 확인 필요', icon: '✓', key: '3' },
  { view: 'report', label: '기여 리포트', hint: '팀원별 기록 종류와 근거', icon: '▤', key: '4' },
  { view: 'calls', label: '회의', hint: '음성·화상 회의와 녹취', icon: '◉', key: '5' },
  { view: 'integrations', label: '연동', hint: 'GitHub · Figma · Notion · Google 문서 · 카카오톡', icon: '⇄', key: '6' },
  { view: 'meeting', label: '공간 (베타)', hint: '2.5D 회의실과 팀원 방', icon: '⌂', key: '7' },
];
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const paletteState = { open: false, index: 0, opener: null, items: [], root: null };

// 글자의 초성만 뽑는다: '타임라인' → 'ㅌㅇㄹㅇ'. 한글이 아니면 그대로 둔다
function choseongOf(s) {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xAC00;
    out += code >= 0 && code < 11172 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }
  return out;
}

// 점수: 앞부분 일치 > 포함 > 초성 일치 > 띄엄띄엄(subsequence) 일치. 0이면 안 맞음
function paletteScore(q, text) {
  const t = text.toLowerCase(), s = q.toLowerCase();
  if (!s) return 1;
  if (t.startsWith(s)) return 100 - t.length * .01;
  const at = t.indexOf(s);
  if (at >= 0) return 80 - at * .5;
  if (/^[ㄱ-ㅎ]+$/.test(s) && choseongOf(t).includes(s)) return 60;
  let i = 0;
  for (const ch of t) if (ch === s[i]) i++;
  return i === s.length ? 30 - t.length * .05 : 0;
}

function paletteCommands() {
  const prof = typeof isProfView === 'function' && isProfView();
  const cmds = [];
  if (!prof) {
    PALETTE_VIEWS.forEach(v => cmds.push({ group: '이동', icon: v.icon, label: v.label, hint: v.hint, kbd: v.key, run: () => go(v.view), text: `${v.label} ${v.hint}` }));
    (state?.members || []).forEach(m => cmds.push({ group: '팀원 방', color: m.color, label: `${m.name}의 방`, hint: m.id === state.meId ? '내 방' : '방에 들어가기', run: () => go('room', m.id), text: `${m.name} 방` }));
    cmds.push({ group: '동작', icon: '＋', label: '내 방에서 기록 담기', hint: '자료·메모·아이디어·AI 대화', run: () => { go('room', state.meId); setTimeout(() => document.querySelector('#addForm input, #addForm textarea')?.focus(), 60); }, text: '기록 담기 추가 메모 자료 아이디어' });
    cmds.push({ group: '동작', icon: '✎', label: '기여 보정 요청', hint: '빠진 기여를 팀원에게 확인받기', run: () => { go('report'); setTimeout(() => typeof openCorrectionModal === 'function' && openCorrectionModal(), 60); }, text: '기여 보정 요청 리포트' });
    cmds.push({ group: '동작', icon: '▣', label: '초안 문서 만들기', hint: '회의 결과와 결정을 Markdown으로', run: () => typeof openExportModal === 'function' && openExportModal(), text: '초안 문서 내보내기 markdown' });
  }
  const invite = document.getElementById('inviteBtn');
  if (invite && !invite.hidden) cmds.push({ group: '동작', icon: '⇪', label: '초대하기', hint: '이 방의 초대 링크', run: () => invite.click(), text: '초대 링크 공유' });
  const rooms = document.getElementById('roomsBtn');
  if (rooms && !rooms.hidden) cmds.push({ group: '동작', icon: '☰', label: '방 목록', hint: '다른 방으로 이동 · 새 방', run: () => rooms.click(), text: '방 목록 이동 만들기 참여' });
  cmds.push({ group: '동작', icon: '⚙', label: '설정', hint: '워크스페이스 설정 · 내보내기', run: () => document.getElementById('menuBtn')?.click(), text: '설정 워크스페이스 내보내기' });
  if (!prof && typeof visibleItems === 'function') {
    const meta = typeof TYPE_META !== 'undefined' ? TYPE_META : {};
    visibleItems().slice(0, 400).forEach(it => {
      const m = typeof member === 'function' ? member(it.memberId) : null;
      cmds.push({ group: '기록', icon: meta[it.type]?.icon || '•', label: it.title, hint: `${m?.name || ''} · ${meta[it.type]?.label || it.type}`, color: m?.color,
        run: () => { if (state.view !== 'workspace') go('workspace'); setTimeout(() => typeof openItemPanel === 'function' && openItemPanel(it.id), 80); },
        text: `${it.title} ${(it.keywords || []).join(' ')} ${m?.name || ''}`, record: true });
    });
  }
  return cmds;
}

function paletteFilter(q) {
  const all = paletteCommands();
  if (!q.trim()) return all.filter(c => !c.record).concat(all.filter(c => c.record).slice(0, 6));
  return all.map(c => ({ c, s: paletteScore(q.trim(), c.text || c.label) })).filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.c.record ? 1 : 0) - (b.c.record ? 1 : 0)).slice(0, 14).map(x => x.c);
}

function paletteIsMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent); }

function paletteRenderList(q) {
  const list = paletteState.root.querySelector('.cmdk-list');
  const empty = paletteState.root.querySelector('.cmdk-empty');
  paletteState.items = paletteFilter(q);
  paletteState.index = Math.min(paletteState.index, Math.max(0, paletteState.items.length - 1));
  list.textContent = '';
  let lastGroup = '';
  paletteState.items.forEach((c, i) => {
    if (c.group !== lastGroup) {
      const h = document.createElement('li');
      h.className = 'cmdk-group'; h.setAttribute('role', 'presentation'); h.textContent = c.group;
      list.appendChild(h); lastGroup = c.group;
    }
    const li = document.createElement('li');
    li.className = 'cmdk-item'; li.id = `cmdkOpt${i}`; li.setAttribute('role', 'option'); li.dataset.index = String(i);
    li.setAttribute('aria-selected', i === paletteState.index ? 'true' : 'false');
    const icon = document.createElement('span'); icon.className = 'cmdk-icon'; icon.setAttribute('aria-hidden', 'true');
    if (c.color) { icon.classList.add('cmdk-dot'); icon.style.setProperty('--mc', c.color); } else icon.textContent = c.icon || '•';
    const body = document.createElement('span'); body.className = 'cmdk-body';
    const label = document.createElement('span'); label.className = 'cmdk-label'; label.textContent = c.label;
    const hint = document.createElement('span'); hint.className = 'cmdk-hint'; hint.textContent = c.hint || '';
    body.append(label, hint);
    li.append(icon, body);
    if (c.kbd) { const k = document.createElement('kbd'); k.className = 'cmdk-kbd'; k.textContent = `${paletteIsMac() ? '⌘' : 'Ctrl'} ${c.kbd}`; li.appendChild(k); }
    list.appendChild(li);
  });
  empty.hidden = paletteState.items.length > 0;
  const input = paletteState.root.querySelector('input');
  input.setAttribute('aria-activedescendant', paletteState.items.length ? `cmdkOpt${paletteState.index}` : '');
  input.setAttribute('aria-expanded', paletteState.items.length ? 'true' : 'false');
}

function paletteMove(delta) {
  if (!paletteState.items.length) return;
  paletteState.index = (paletteState.index + delta + paletteState.items.length) % paletteState.items.length;
  paletteState.root.querySelectorAll('.cmdk-item').forEach(li => li.setAttribute('aria-selected', li.dataset.index === String(paletteState.index) ? 'true' : 'false'));
  paletteState.root.querySelector(`#cmdkOpt${paletteState.index}`)?.scrollIntoView({ block: 'nearest' });
  paletteState.root.querySelector('input').setAttribute('aria-activedescendant', `cmdkOpt${paletteState.index}`);
}

function paletteRun(i = paletteState.index) {
  const c = paletteState.items[i];
  closePalette();
  if (c) c.run();
}

function paletteAvailable() {
  const bar = document.getElementById('topbar');
  return !!(bar && !bar.hidden && typeof state !== 'undefined' && state);
}

function openPalette() {
  if (paletteState.open || !paletteAvailable()) return;
  paletteState.open = true;
  paletteState.opener = document.activeElement;
  paletteState.index = 0;
  const root = document.createElement('div');
  root.className = 'cmdk'; root.id = 'cmdk';
  root.innerHTML = `
    <div class="cmdk-card" role="dialog" aria-modal="true" aria-label="명령 팔레트">
      <div class="cmdk-search">
        <span class="cmdk-search-icon" aria-hidden="true">⌕</span>
        <input type="text" role="combobox" aria-expanded="false" aria-controls="cmdkList" aria-autocomplete="list" aria-label="화면·팀원·기록 검색" placeholder="어디로 갈까요? 화면·팀원·기록을 검색 (초성도 돼요)" autocomplete="off" spellcheck="false">
        <kbd class="cmdk-esc">esc</kbd>
      </div>
      <ul class="cmdk-list" id="cmdkList" role="listbox" aria-label="검색 결과"></ul>
      <p class="cmdk-empty" hidden>맞는 결과가 없어요. 다른 말로 찾아보세요.</p>
      <div class="cmdk-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>↵</kbd> 열기</span><span><kbd>esc</kbd> 닫기</span></div>
    </div>`;
  document.body.appendChild(root);
  paletteState.root = root;
  const input = root.querySelector('input');
  input.addEventListener('input', () => { paletteState.index = 0; paletteRenderList(input.value); });
  root.addEventListener('pointerdown', e => { if (e.target === root) closePalette(); });
  root.addEventListener('pointermove', e => { const li = e.target.closest('.cmdk-item'); if (li && +li.dataset.index !== paletteState.index) { paletteState.index = +li.dataset.index; paletteMove(0); } });
  root.addEventListener('click', e => { const li = e.target.closest('.cmdk-item'); if (li) paletteRun(+li.dataset.index); });
  paletteRenderList('');
  input.focus();
}

function closePalette() {
  if (!paletteState.open) return;
  paletteState.open = false;
  const root = paletteState.root;
  paletteState.root = null;
  root?.classList.add('out');
  setTimeout(() => root?.remove(), 120);
  const back = paletteState.opener;
  paletteState.opener = null;
  if (back?.isConnected) back.focus?.();
}

document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (paletteState.open) closePalette(); else openPalette();
    return;
  }
  if (paletteState.open) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); paletteMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); paletteRun(); }
    else if (e.key === 'Tab') { e.preventDefault(); paletteMove(e.shiftKey ? -1 : 1); }
    return;
  }
  // ⌘1~7: 화면 바로 가기 (입력 중이 아닐 때만)
  if (mod && !e.shiftKey && !e.altKey && /^[1-7]$/.test(e.key) && paletteAvailable() && !(typeof isProfView === 'function' && isProfView())) {
    const t = e.target;
    if (t && (t.matches?.('input, textarea, select, [contenteditable="true"]'))) return;
    e.preventDefault();
    go(PALETTE_VIEWS[+e.key - 1].view);
  }
}, true);

document.addEventListener('click', e => {
  if (e.target.closest?.('#cmdkBtn')) openPalette();
});

// 상단바의 ⌘K 단추: 운영체제에 맞는 글쇠 표시
if (typeof document !== 'undefined') {
  const btn = document.getElementById('cmdkBtn');
  if (btn) btn.querySelector('kbd').textContent = paletteIsMac() ? '⌘K' : 'Ctrl K';
}
