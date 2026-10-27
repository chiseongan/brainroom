// AI 사이트(ChatGPT·Claude·Gemini)에서 지금 보고 있는 대화를 읽어 BrainRoom으로 보낸다.
// - 사용자가 '🧠 BrainRoom에 담기' 버튼을 누를 때만 읽는다. 자동으로 읽거나 보내지 않는다.
// - 글을 드래그해 선택한 상태면 그 부분만 보낸다.
// - 각 사이트의 화면 구조를 읽는 방식이라, 사이트가 화면을 바꾸면 못 읽을 수 있다(그때는 선택해서 보내거나 내보내기 파일을 쓴다).

(() => {
  const SITE = /chatgpt\.com|chat\.openai\.com/.test(location.hostname) ? 'ChatGPT'
    : /claude\.ai/.test(location.hostname) ? 'Claude'
    : /gemini\.google\.com/.test(location.hostname) ? 'Gemini'
    : (document.documentElement.dataset.brainroomTestSite || null); // 시험 페이지용
  if (!SITE || window.__brainroomCapture) return;
  window.__brainroomCapture = true;

  // 겹쳐서 잡힌 요소(바깥 요소 안의 요소)는 빼고 바깥 것만 남긴다
  const outermost = els => els.filter(el => !els.some(o => o !== el && o.contains(el)));
  const textOf = el => (el.innerText || el.textContent || '').replace(/\n{3,}/g, '\n\n').trim();

  // 사이트별로 '누가 말했는지'를 알 수 있는 표시를 찾는다
  const EXTRACTORS = {
    ChatGPT: () => [...document.querySelectorAll('[data-message-author-role]')]
      .map(el => ({ role: el.dataset.messageAuthorRole === 'user' ? 'user' : 'assistant', text: textOf(el) })),
    Claude: () => outermost([...document.querySelectorAll('[data-testid="user-message"], .font-claude-message, .font-claude-response')])
      .map(el => ({ role: el.matches('[data-testid="user-message"]') ? 'user' : 'assistant', text: textOf(el) })),
    Gemini: () => [...document.querySelectorAll('user-query, model-response')]
      .map(el => ({ role: el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant', text: textOf(el) })),
  };

  function conversationTitle() {
    const t = document.title.replace(/\s*[-|–·]\s*(ChatGPT|Claude|Gemini|Google Gemini).*$/i, '').replace(/^(ChatGPT|Claude|Gemini|Google Gemini)$/i, '').trim();
    return t || `${SITE} 대화`;
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  function capture() {
    const selected = (window.getSelection()?.toString() || '').trim();
    if (selected.length >= 10) {
      return {
        sourceId: `ext:${SITE}:${location.pathname}:sel:${hash(selected)}`,
        title: `${conversationTitle()} (선택한 부분)`, createdAt: Date.now(), tool: SITE, url: location.href,
        transcript: selected, firstPrompt: selected.slice(0, 400), messageCount: 1,
      };
    }
    const messages = (EXTRACTORS[SITE]?.() || []).filter(m => m.text);
    if (!messages.length) return null;
    return {
      sourceId: `ext:${SITE}:${location.pathname}`,
      title: conversationTitle(), createdAt: Date.now(), tool: SITE, url: location.href,
      transcript: messages.map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.text}`).join('\n\n'),
      firstPrompt: messages.find(m => m.role === 'user')?.text || messages[0].text,
      messageCount: messages.length,
    };
  }

  // ---------- 화면 (페이지 스타일과 섞이지 않게 Shadow DOM) ----------

  const host = document.createElement('div');
  host.id = 'brainroom-ext-host';
  host.style.cssText = 'position:fixed;right:18px;bottom:96px;z-index:2147483646;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button { font: 600 13px/1 system-ui, 'Malgun Gothic', sans-serif; border: 0; border-radius: 999px; padding: 10px 14px;
        background: #4f46e5; color: #fff; box-shadow: 0 6px 18px rgba(0,0,0,.25); cursor: pointer; }
      button:hover { background: #4338ca; }
      .toast { position: absolute; right: 0; bottom: 46px; white-space: nowrap; background: #111827; color: #fff;
        font: 13px/1.4 system-ui, 'Malgun Gothic', sans-serif; padding: 8px 12px; border-radius: 10px; opacity: 0; transition: opacity .2s; pointer-events: none; }
      .toast.on { opacity: 1; }
    </style>
    <div class="toast" role="status"></div>
    <button type="button" title="지금 보고 있는 대화를 BrainRoom으로 보내요. 글을 선택한 상태면 그 부분만 보내요.">🧠 BrainRoom에 담기</button>`;
  const toast = msg => {
    const t = root.querySelector('.toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('on'), 2600);
  };

  root.querySelector('button').addEventListener('mousedown', e => e.preventDefault()); // 누르는 순간 선택이 풀리지 않게
  root.querySelector('button').addEventListener('click', () => {
    const conversation = capture();
    if (!conversation) return toast('대화를 찾지 못했어요. 보낼 부분을 드래그해서 선택한 뒤 눌러 주세요');
    chrome.runtime.sendMessage({ type: 'capture', conversation }, res => {
      if (chrome.runtime.lastError || !res?.ok) return toast('보내지 못했어요. 확장을 다시 불러온 뒤 시도해 주세요');
      toast(conversation.messageCount > 1 ? `대화 ${conversation.messageCount}개 메시지를 BrainRoom으로 보냈어요` : '선택한 부분을 BrainRoom으로 보냈어요');
    });
  });

  chrome.storage.local.get({ hideButton: false }, ({ hideButton }) => {
    if (!hideButton) document.documentElement.appendChild(host);
  });
  chrome.storage.onChanged.addListener(ch => {
    if (!ch.hideButton) return;
    if (ch.hideButton.newValue) host.remove(); else document.documentElement.appendChild(host);
  });

  // 오른쪽 클릭 메뉴에서 부르면 같은 방식으로 담는다
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type !== 'capture-now') return;
    reply({ conversation: capture() });
  });
})();
