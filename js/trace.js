// 팀트레이스 SSRD 반영 로직: 공유 범위, 개인정보 가리기, AI 대화, 결정 기록, 퀘스트, 기여 보정, 교수자 집계.
// 서버 없이 브라우저 안에서만 동작한다. (규칙 기반 분류 = SSRD OC-5)

// ---------- 공유 범위 (RQ-6) ----------

const VISIBILITY = {
  me: { icon: '🔒', label: '나만' },
  team: { icon: '👥', label: '팀' },
  prof: { icon: '🎓', label: '교수자까지' },
};

function isProfView() {
  return state?.viewer === 'prof';
}

// 지금 보고 있는 사람이 이 기록의 내용을 볼 수 있는지
function canSee(item) {
  if (item._stub) return false; // 온라인 팀에서 내용 없이 횟수만 아는 기록
  if (isProfView()) return item.visibility === 'prof';
  return item.visibility !== 'me' || item.memberId === state.meId;
}

function visibleItems() {
  return state.items.filter(canSee);
}

// ---------- 개인정보 형태 문자열 가리기 (LS-4) ----------

function maskPII(text) {
  return String(text ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일]')
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[주민등록번호]')
    .replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호]');
}

// ---------- AI 대화 (RQ-5, RQ-12, ONRQ-6) ----------

const AI_PURPOSES = [
  { id: 'research', label: '조사', emoji: '🔍', words: ['조사', '찾아', '통계', '사례', '알려줘', '뭐야', '무엇', '차이', '비교', '설명', '자료', '현황'] },
  { id: 'draft', label: '초안', emoji: '✍️', words: ['초안', '작성', '써줘', '문장', '보고서', '발표', '요약', '다듬', '교정', '목차', '대본'] },
  { id: 'code', label: '코드', emoji: '💻', words: ['코드', '함수', '에러', '오류', '버그', '구현', '디버그', 'javascript', 'python', 'react', 'sql', 'api', 'html', 'css'] },
  { id: 'translate', label: '번역', emoji: '🌐', words: ['번역', '영어로', '한국어로', '영문', 'translate'] },
  { id: 'idea', label: '아이디어', emoji: '💡', words: ['아이디어', '브레인스토밍', '기획', '추천해', '제안', '방안'] },
  { id: 'etc', label: '기타', emoji: '💬', words: [] },
];
const PURPOSE_BY_ID = Object.fromEntries(AI_PURPOSES.map(p => [p.id, p]));
const AI_TRANSCRIPT_LIMIT = 6000; // 원문 저장 최소화 (Win-AGRE-4)

function classifyPurpose(text) {
  const lower = (text || '').toLowerCase();
  const best = AI_PURPOSES
    .map(p => ({ id: p.id, score: p.words.filter(w => wordMatches(lower, w)).length }))
    .sort((a, b) => b.score - a.score)[0];
  return best.score > 0 ? best.id : 'etc';
}

function detectAiTool(url, text = '') {
  const s = `${url} ${text}`.toLowerCase();
  if (/chatgpt|openai/.test(s)) return 'ChatGPT';
  if (/claude/.test(s)) return 'Claude';
  if (/gemini|bard/.test(s)) return 'Gemini';
  return '기타';
}

// 대화 원문 → 저장용 필드 (개인정보 가리기 + 길이 제한)
function aiFields({ tool, transcript, firstPrompt, sourceId = '' }) {
  const masked = maskPII(transcript);
  return {
    tool,
    purpose: classifyPurpose(firstPrompt || transcript),
    transcript: masked.length > AI_TRANSCRIPT_LIMIT ? masked.slice(0, AI_TRANSCRIPT_LIMIT) + '\n…(이하 생략)' : masked,
    sourceId,
  };
}

function aiSummary(firstPrompt) {
  const s = maskPII(firstPrompt).replace(/\s+/g, ' ').trim();
  return s ? `질문: ${s.length > 160 ? s.slice(0, 160) + '…' : s}` : '';
}

// ChatGPT·Claude에서 내보낸 conversations.json, 또는 .txt/.md 대화 파일을 읽는다
function parseAiExport(text, filename) {
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* 텍스트 파일 */ }
  if (data && !Array.isArray(data)) data = data.conversations || (data.mapping || data.chat_messages ? [data] : null);
  if (!Array.isArray(data)) {
    const body = text.trim();
    if (!body) return [];
    return [{
      sourceId: `file:${filename}:${hashCode(body)}`,
      title: filename.replace(/\.[^.]+$/, ''),
      createdAt: Date.now(),
      tool: detectAiTool('', body.slice(0, 500)),
      transcript: body,
      firstPrompt: body.slice(0, 400),
      messageCount: body.split(/\n{2,}/).length,
    }];
  }
  return data.map(conv => conv.mapping ? parseChatGPT(conv) : conv.chat_messages ? parseClaude(conv) : null)
    .filter(c => c && c.transcript.trim())
    .sort((a, b) => b.createdAt - a.createdAt);
}

function joinTranscript(messages) {
  return messages.map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.text.trim()}`).join('\n\n');
}

function parseChatGPT(conv) {
  const messages = Object.values(conv.mapping || {})
    .map(n => n.message)
    .filter(m => m && m.content && ['user', 'assistant'].includes(m.author?.role))
    .sort((a, b) => (a.create_time || 0) - (b.create_time || 0))
    .map(m => ({ role: m.author.role, text: (m.content.parts || []).filter(p => typeof p === 'string').join('\n') }))
    .filter(m => m.text.trim());
  return {
    sourceId: `chatgpt:${conv.id || conv.conversation_id || hashCode(conv.title || '')}`,
    title: conv.title || '제목 없는 대화',
    createdAt: conv.create_time ? conv.create_time * 1000 : Date.now(),
    tool: 'ChatGPT',
    transcript: joinTranscript(messages),
    firstPrompt: messages.find(m => m.role === 'user')?.text || '',
    messageCount: messages.length,
  };
}

function parseClaude(conv) {
  const messages = (conv.chat_messages || []).map(m => ({
    role: m.sender === 'human' ? 'user' : 'assistant',
    text: m.text || (m.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'),
  })).filter(m => m.text.trim());
  return {
    sourceId: `claude:${conv.uuid || hashCode(conv.name || '')}`,
    title: conv.name || '제목 없는 대화',
    createdAt: Date.parse(conv.created_at) || Date.now(),
    tool: 'Claude',
    transcript: joinTranscript(messages),
    firstPrompt: messages.find(m => m.role === 'user')?.text || '',
    messageCount: messages.length,
  };
}

// ---------- 중복 활동 (ONRQ-4) ----------

function normUrl(url) {
  return (url || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

function findDuplicate({ memberId, type, title, url, sourceId }) {
  return state.items.find(i => i.memberId === memberId && (
    (sourceId && i.ai?.sourceId === sourceId) ||
    (url && normUrl(i.url) === normUrl(url)) ||
    (i.type === type && i.title.trim() === title.trim())
  ));
}

// ---------- 결정 기록 (RQ-9, ONRQ-2, LS-7) ----------

const DECISION_PATTERN = /(하기로|기로\s?(했|함|합의)|결정(했|함|됨|하였|이다|\s*[:：])|확정|정했|정함|합의(했|함)|채택|로 가자(?![는고])|로 하자(?![는고]))/;

function sentencesOf(text) {
  return (text || '')
    .split(/(?<=[.!。])\s+|\n+|(?<=다)\s+(?=[가-힣A-Za-z0-9])/)
    .map(s => s.replace(/^[-*•…\s👤🤖]+/u, '').trim())
    .filter(s => s.length >= 6 && s.length <= 160 && !/\?\s*$/.test(s));
}

function candidateKey(itemId, text) {
  return `${itemId}:${hashCode(text)}`;
}

// 보이는 기록에서 "정한 것" 문장을 찾는다. 이미 확정했거나 무시한 후보는 뺀다.
function decisionCandidates() {
  const taken = new Set(state.decisionDismissed);
  state.decisions.forEach(d => d.candidateKey && taken.add(d.candidateKey));
  const out = [];
  visibleItems().forEach(item => {
    const text = `${item.content}\n${item.ai?.transcript || ''}`;
    sentencesOf(text).forEach(s => {
      if (!DECISION_PATTERN.test(s)) return;
      const key = candidateKey(item.id, s);
      if (taken.has(key)) return;
      taken.add(key);
      out.push({ key, itemId: item.id, text: s, memberId: item.memberId, createdAt: item.createdAt });
    });
  });
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function decisionSources(d) {
  return d.sourceIds.map(itemById).filter(Boolean);
}

// 근거 링크가 살아 있는 결정만 화면·리포트에 나온다
function confirmedDecisions() {
  return state.decisions.filter(d => decisionSources(d).length).sort((a, b) => b.createdAt - a.createdAt);
}

function decisionsNeedingReview() {
  return state.decisions.filter(d => !decisionSources(d).length);
}

function addDecision({ text, sourceIds = [], origin = 'manual', candidateKey = null }) {
  const d = { id: uid(), text: maskPII(text).trim(), sourceIds, origin, candidateKey, createdAt: Date.now(), createdBy: state.meId };
  state.decisions.push(d);
  saveState();
  return d;
}

// ---------- 주차별 퀘스트 (RQ-13) ----------

const QUEST_TARGETS = {
  any: '모든 기록', link: '자료·링크', memo: '메모', idea: '아이디어', ai: 'AI 대화', decision: '확정된 결정', manual: '직접 체크',
};

function weekStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function weekLabel(ws) {
  const a = new Date(ws), b = new Date(ws + 6 * 864e5);
  return `${a.getMonth() + 1}/${a.getDate()} ~ ${b.getMonth() + 1}/${b.getDate()}`;
}

function questProgress(q) {
  if (q.target === 'manual') return { done: q.done ? 1 : 0, goal: 1 };
  const from = q.week, to = q.week + 7 * 864e5;
  const inWeek = x => x.createdAt >= from && x.createdAt < to;
  const done = q.target === 'decision'
    ? confirmedDecisions().filter(inWeek).length
    : state.items.filter(i => inWeek(i) && (q.target === 'any' || i.type === q.target)).length;
  return { done: Math.min(done, q.count), goal: q.count };
}

// ---------- 기여 보정 요청 (RQ-14) ----------

function applyCorrection(c, confirmerId) {
  const requester = member(c.memberId);
  let desc = '';
  if (c.kind === 'missing') {
    addItem({ memberId: c.memberId, type: c.type, title: c.title, url: c.url, content: c.note, visibility: 'team', correctionId: c.id });
    desc = `빠진 기여 추가: ${TYPE_META[c.type].icon} ${c.title}`;
  } else {
    const item = itemById(c.itemId);
    if (!item) return false;
    const from = TYPE_META[item.type].label;
    item.type = c.type;
    if (c.type === 'ai' && !item.ai) item.ai = aiFields({ tool: detectAiTool(item.url), transcript: item.content, firstPrompt: item.title });
    analyze(item);
    desc = `분류 수정: 「${item.title}」 ${from} → ${TYPE_META[c.type].label}`;
  }
  c.status = 'applied';
  c.confirmedBy = confirmerId;
  state.changeLog.push({ at: Date.now(), text: `${desc} (요청 ${requester?.name ?? '?'} · 확인 ${member(confirmerId)?.name ?? '?'})` });
  saveState();
  return true;
}

// ---------- 집계 (RQ-10, RQ-11, RQ-12) ----------

function memberCounts(ws, memberId) {
  const items = ws.items.filter(i => i.memberId === memberId);
  const byType = { link: 0, memo: 0, idea: 0, ai: 0 };
  const purposes = {};
  items.forEach(i => {
    byType[i.type] = (byType[i.type] || 0) + 1;
    if (i.type === 'ai') purposes[i.ai?.purpose || 'etc'] = (purposes[i.ai?.purpose || 'etc'] || 0) + 1;
  });
  const decisionRefs = (ws.decisions || []).filter(d => d.sourceIds.some(id => items.some(i => i.id === id))).length;
  return { items, total: items.length, byType, purposes, decisionRefs };
}

function teamStats(ws) {
  const from = weekStart();
  const ids = new Set(ws.items.map(i => i.id));
  const decisions = (ws.decisions || []).filter(d => d.sourceIds.some(id => ids.has(id)));
  const totals = ws.members.map(m => ({ m, n: ws.items.filter(i => i.memberId === m.id).length }));
  const sum = totals.reduce((s, t) => s + t.n, 0);
  const top = [...totals].sort((a, b) => b.n - a.n)[0];
  const topShare = sum ? top.n / sum : 0;
  let bias = '기록 없음';
  if (sum) bias = ws.members.length > 1 && topShare >= 0.5 ? '편중 높음' : topShare >= 0.4 ? '다소 편중' : '고른 편';
  return {
    weekItems: ws.items.filter(i => i.createdAt >= from).length,
    weekDecisions: decisions.filter(d => d.createdAt >= from).length,
    decisions: decisions.length,
    totals, sum, top, topShare, bias,
    silent: totals.filter(t => !t.n).map(t => t.m),
  };
}

// ---------- 교수자 보기용 데이터 (ONRQ-5, RQ-6) ----------

const PROF_KEY = 'brainroom:prof-teams';

// "교수자까지"가 아닌 기록은 내용을 지우고 횟수·종류·목적만 남긴다
function sanitizeForProf(ws) {
  return {
    version: 1,
    teamName: ws.teamName,
    course: ws.course || '',
    exportedAt: Date.now(),
    forProfessor: true,
    members: ws.members.map(m => ({ id: m.id, name: m.name, color: m.color })),
    items: ws.items.map(i => {
      const open = i.visibility === 'prof';
      return {
        id: i.id, memberId: i.memberId, type: i.type, createdAt: i.createdAt, visibility: i.visibility,
        title: open ? i.title : '', content: open ? i.content : '', url: open ? i.url : '',
        themes: open ? i.themes : [], keywords: open ? i.keywords : [], votes: [], table: null,
        ai: i.ai ? { tool: i.ai.tool, purpose: i.ai.purpose, transcript: open ? i.ai.transcript : '' } : undefined,
      };
    }),
    decisions: (ws.decisions || []).map(d => ({ id: d.id, text: d.text, sourceIds: d.sourceIds, createdAt: d.createdAt })),
    changeLog: ws.changeLog || [],
  };
}

function loadProfTeams() {
  try { return JSON.parse(localStorage.getItem(PROF_KEY)) || []; } catch (e) { return []; }
}

function saveProfTeams(teams) {
  try { localStorage.setItem(PROF_KEY, JSON.stringify(teams)); } catch (e) { /* 무시 */ }
}

// 교수자 보기에서 학생 전용 화면에 들어가려 한 기록
function logAccess(view) {
  state.accessLog.push({ at: Date.now(), view });
  if (state.accessLog.length > 100) state.accessLog.shift();
  saveState();
}

// ---------- 활동 상태 문구 (RQ-8, UI-3: 색 말고 글자로도) ----------

function activityStatus(p) {
  if (!p.items.length) return '기록 없음';
  const hours = (Date.now() - p.last) / 3600000;
  if (hours < 24) return '오늘 활동';
  return `${Math.floor(hours / 24)}일 전 활동`;
}
