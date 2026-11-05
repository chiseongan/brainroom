// 밖에서 온 데이터 정화: Firestore 문서, 불러온 워크스페이스·제출 파일.
// 화면 코드는 id·색·좌표 같은 값을 HTML에 그대로 넣으므로, 여기서 형식이 맞는 값만 남긴다.
// 규칙(firestore.rules)이 새 쓰기를 막아도 예전 데이터와 파일은 그대로 들어올 수 있어 앱에서 한 번 더 거른다.
// 올바른 문서는 바꾸지 않는다 (cloudPush가 변경으로 보지 않게). 잘못된 칸만 고치고, id가 잘못된 문서는 버린다.

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

// 앱 곳곳에서 쓴다
const isId = v => typeof v === 'string' && SAFE_ID.test(v);
const finite = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const asStr = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
const idList = v => (Array.isArray(v) ? v.filter(isId) : []);

// http(s)와 스킴 없는 주소만 (javascript:, data: 등은 버린다)
function cleanUrl(v) {
  const u = asStr(v).trim();
  if (/[\s"'<>`]/.test(u)) return '';
  return !u || /^https?:\/\//i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : '';
}

// 값이 올바르면 그대로 두고, 아닐 때만 고친다
function fix(o, key, valid, fallback) {
  if (key in o && !valid(o[key])) o[key] = typeof fallback === 'function' ? fallback(o[key]) : fallback;
}
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isIdOrNull = v => v == null || isId(v);
const isStrList = v => Array.isArray(v) && v.every(isStr);
const isIdList = v => Array.isArray(v) && v.every(isId);

function cleanMember(raw, index = 0) {
  if (!raw || !isId(raw.id)) return null;
  const m = { ...raw };
  m.name = asStr(m.name).slice(0, 100) || '팀원';
  if (!SAFE_COLOR.test(asStr(m.color))) m.color = typeof MEMBER_COLORS !== 'undefined' ? MEMBER_COLORS[index % MEMBER_COLORS.length] : '#6366f1';
  delete m.email; // 명단에 두지 않는다 (예전에 저장된 값도 쓰지 않는다)
  delete m.photo;
  fix(m, 'uid', isId, undefined);
  if (m.uid === undefined) delete m.uid;
  fix(m, 'pinnedIdeaId', isIdOrNull, null);
  if (m.connections) {
    const c = {};
    ['github', 'figma', 'notion'].forEach(k => { if (['ok', 'error'].includes(m.connections[k])) c[k] = m.connections[k]; });
    m.connections = c;
  }
  return m;
}

function cleanMembers(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(cleanMember).filter(m => m && !seen.has(m.id) && seen.add(m.id));
}

function cleanSub(o, spec) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = { ...o };
  Object.entries(spec).forEach(([k, [valid, fallback]]) => fix(out, k, valid, fallback));
  return out;
}

// 기록 하나. id는 문서 id를 쓴다 (문서 내용의 id를 믿지 않는다)
function cleanItem(raw, id = raw?.id) {
  if (!raw || !isId(id) || !isId(raw.memberId)) return null;
  const i = { ...raw, id };
  if (!TYPE_META[i.type]) i.type = 'memo';
  if (!VISIBILITY[i.visibility]) i.visibility = 'me';
  i.createdAt = finite(i.createdAt);
  fix(i, 'title', isStr, asStr);
  fix(i, 'content', isStr, asStr);
  if ('url' in i && cleanUrl(i.url) !== i.url) i.url = cleanUrl(i.url);
  fix(i, 'ownerUid', isId, undefined);
  if (i.ownerUid === undefined) delete i.ownerUid;
  if ('keywords' in i && !isStrList(i.keywords)) i.keywords = strList(i.keywords);
  if ('themes' in i && !(Array.isArray(i.themes) && i.themes.every(t => THEME_BY_ID[t]))) i.themes = strList(i.themes).filter(t => THEME_BY_ID[t]);
  if ('votes' in i && !isIdList(i.votes)) i.votes = idList(i.votes);
  if ('table' in i && i.table !== null && !(isNum(i.table?.x) && isNum(i.table?.y))) i.table = null;
  fix(i, 'correctionId', isIdOrNull, null);
  fix(i, 'appliedCorrection', isIdOrNull, null);
  for (const key of ['ai', 'talk', 'work']) {
    if (!(key in i) || i[key] === undefined) continue;
    const spec = {
      ai: { tool: [isStr, asStr], purpose: [p => PURPOSE_BY_ID[p], 'etc'], transcript: [isStr, asStr], sourceId: [isStr, asStr], summaryBy: [isStr, ''], decisions: [isStrList, strList] },
      talk: { callId: [isId, ''], lineCount: [isNum, 0], keywords: [isStrList, strList], transcript: [isStr, asStr], decisions: [isStrList, strList] },
      work: { source: [s => s in { github: 1, figma: 1, notion: 1 }, ''], kind: [isId, ''], repo: [isStr, asStr], file: [isStr, asStr], page: [isStr, asStr], keywords: [isStrList, strList], count: [isNum, 0], ai: [v => typeof v === 'boolean', false] },
    }[key];
    i[key] = cleanSub(i[key], spec);
    if (i[key] === null) delete i[key];
  }
  // 종류에 필요한 칸이 없으면 메모로 본다 (화면이 없는 칸을 읽다 멈추지 않게)
  if (i.type === 'ai' && !i.ai && !i._stub) i.type = 'memo';
  if (i.type === 'talk' && !i.talk) i.type = 'memo';
  if (i.type === 'work' && !i.work) i.type = 'memo';
  return i;
}

// 횟수 기록(itemMeta): 내용은 없고 종류·공유 범위·시각·목적만
function cleanItemMeta(raw, id) {
  if (!raw || !isId(id) || !isId(raw.memberId)) return null;
  const m = { ...raw };
  if (!TYPE_META[m.type]) m.type = 'memo';
  if (!VISIBILITY[m.visibility]) m.visibility = 'me';
  m.createdAt = finite(m.createdAt);
  m.purpose = PURPOSE_BY_ID[m.purpose] ? m.purpose : null;
  fix(m, 'ownerUid', isId, '');
  return m;
}

function cleanDecision(raw, id = raw?.id) {
  if (!raw || !isId(id)) return null;
  const d = { ...raw, id, text: asStr(raw.text), sourceIds: idList(raw.sourceIds), createdAt: finite(raw.createdAt) };
  fix(d, 'candidateKey', isIdOrNull, null);
  fix(d, 'createdBy', isIdOrNull, null);
  fix(d, 'origin', isId, 'manual');
  return d;
}

function cleanQuest(raw, id = raw?.id) {
  if (!raw || !isId(id)) return null;
  const q = { ...raw, id, title: asStr(raw.title), week: finite(raw.week), done: Boolean(raw.done) };
  if (!QUEST_TARGETS[q.target]) q.target = 'any';
  q.count = Math.max(1, Math.min(999, finite(q.count, 1)));
  return q;
}

function cleanCorrection(raw, id = raw?.id) {
  if (!raw || !isId(id) || !isId(raw.memberId)) return null;
  const c = { ...raw, id, note: asStr(raw.note), createdAt: finite(raw.createdAt) };
  if (!['missing', 'reclass'].includes(c.kind)) c.kind = 'missing';
  if (!['pending', 'applied', 'rejected'].includes(c.status)) c.status = 'pending';
  if (!TYPE_META[c.type]) c.type = 'memo';
  fix(c, 'title', isStr, asStr);
  if ('url' in c) c.url = cleanUrl(c.url);
  fix(c, 'itemId', isIdOrNull, null);
  fix(c, 'confirmedBy', isIdOrNull, null);
  return c;
}

const cleanLog = (raw, id = raw?.id) => (raw ? { ...raw, ...(id ? { id: asStr(id) } : {}), at: finite(raw.at), text: asStr(raw.text) } : null);

function cleanCall(raw, id = raw?.id) {
  if (!raw || !isId(id)) return null;
  const c = { ...raw, id, title: asStr(raw.title), startedAt: finite(raw.startedAt) };
  if (!['live', 'ended'].includes(c.status)) c.status = 'ended';
  fix(c, 'endedAt', v => v === null || isNum(v), null);
  fix(c, 'startedBy', isStr, asStr);
  fix(c, 'startedByName', isStr, asStr);
  if ('summary' in c && c.summary !== null) c.summary = asStr(c.summary);
  if ('summaryBy' in c && !['rule', 'ai'].includes(c.summaryBy)) c.summaryBy = 'rule';
  if ('attendees' in c) c.attendees = strList(c.attendees);
  if ('decisions' in c) c.decisions = strList(c.decisions);
  fix(c, 'lineCount', isNum, 0);
  if ('source' in c && c.source !== 'meet') delete c.source;
  return c;
}

const cleanLine = raw => ({ ...raw, name: asStr(raw?.name), text: asStr(raw?.text), at: finite(raw?.at) });
const cleanPeer = raw => ({ ...raw, name: asStr(raw?.name), uid: asStr(raw?.uid), joinedAt: finite(raw?.joinedAt), beat: finite(raw?.beat) });

function cleanLinks(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  return { ...l, ...('github' in l ? { github: asStr(l.github) } : {}), ...('figma' in l ? { figma: strList(l.figma) } : {}), ...('notion' in l ? { notion: strList(l.notion) } : {}) };
}

function cleanTeam(raw) {
  return { ...raw, teamName: asStr(raw.teamName).slice(0, 200), course: asStr(raw.course).slice(0, 200), members: cleanMembers(raw.members), decisionDismissed: strList(raw.decisionDismissed), links: cleanLinks(raw.links) };
}

function cleanList(list, fn) {
  return (Array.isArray(list) ? list : []).map(x => fn(x)).filter(Boolean);
}

// 워크스페이스 전체 (불러온 파일, 교수자 제출 파일, 이 브라우저에 저장된 것)
function sanitizeWorkspace(ws) {
  ws.teamName = asStr(ws.teamName).slice(0, 200);
  ws.course = asStr(ws.course).slice(0, 200);
  ws.members = cleanMembers(ws.members);
  const known = new Set(ws.members.map(m => m.id));
  ws.items = cleanList(ws.items, cleanItem).filter(i => known.has(i.memberId));
  ws.decisions = cleanList(ws.decisions, cleanDecision);
  ws.quests = cleanList(ws.quests, cleanQuest);
  ws.corrections = cleanList(ws.corrections, cleanCorrection);
  ws.changeLog = cleanList(ws.changeLog, cleanLog);
  ws.calls = Array.isArray(ws.calls) ? cleanList(ws.calls, cleanCall) : ws.calls;
  ws.decisionDismissed = strList(ws.decisionDismissed);
  ws.links = cleanLinks(ws.links);
  if (!isIdOrNull(ws.meId)) ws.meId = null;
  if (!isIdOrNull(ws.roomId)) ws.roomId = null;
  return ws;
}
