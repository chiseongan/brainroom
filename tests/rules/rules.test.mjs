// Firestore 규칙 시험: 에뮬레이터에서 진짜 firestore.rules를 돌려 공격과 정상 흐름을 모두 확인한다.
//   cd tests && npm install && npm run rules   (Java 21 이상 필요)
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, arrayUnion, setLogLevel } from 'firebase/firestore';

setLogLevel('silent'); // 거절될 때마다 찍히는 SDK 로그를 끈다

const env = await initializeTestEnvironment({
  projectId: 'demo-brainroom',
  firestore: { rules: fs.readFileSync(process.env.RULES_FILE || new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
});

let pass = 0, fail = 0;
const quiet = fn => fn().catch(() => {});
async function allow(name, p) { try { await assertSucceeds(p); pass++; console.log(`PASS  ${name}`); } catch (e) { fail++; console.log(`FAIL  ${name} (거절됨: ${e.message.replace(/s+/g, ' ').slice(0, 300)})`); } }
async function deny(name, p) { try { await assertFails(p); pass++; console.log(`PASS  ${name}`); } catch (e) { fail++; console.log(`FAIL  ${name} (허용되면 안 됨)`); } }

const T = 'T';
const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
const owner = () => as('uOwner');
const amy = () => as('uAmy');
const ben = () => as('uBen');
const cara = () => as('uCara');
const prof = () => as('uProf');
const stranger = () => as('uStranger');
const anon = () => env.unauthenticatedContext().firestore();

const ROSTER = [{ id: 'mO', name: '팀장', color: '#111111', uid: 'uOwner' }, { id: 'mA', name: '에이미', color: '#222222', uid: 'uAmy' }, { id: 'mB', name: '벤', color: '#333333', uid: 'uBen' }, { id: 'mFree', name: '빈자리', color: '#444444' }];
const record = (id, memberId, ownerUid, visibility, extra = {}) => ({
  id, memberId, ownerUid, visibility, type: 'memo', title: `기록 ${id}`, content: '내용', url: '', createdAt: 1, votes: [], table: null, ...extra,
});

const CONSENT = { version: 'test', at: 1, over14: true, terms: true, privacy: true };
const consenting = ['uOwner', 'uAmy', 'uBen', 'uCara', 'uProf', 'uStranger', 'uOld', 'uLate', 'uNew', 'uNew2', 'uShort'];
async function giveConsent(db) { for (const u of consenting) await setDoc(doc(db, `users/${u}`), { consent: CONSENT }); }

// 규칙을 거치지 않고 기본 방을 채운다
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await giveConsent(db);
    const t = p => doc(db, `teams/${T}${p}`);
    await setDoc(doc(db, `teams/${T}`), { teamName: '호랑이양말', course: '소공', ownerUid: 'uOwner', members: ROSTER, decisionDismissed: [], links: {} });
    await setDoc(t('/secrets/student'), { code: 'student-code-123456' });
    await setDoc(t('/secrets/prof'), { code: 'prof-code-1234567890' });
    await setDoc(t('/members/uOwner'), { uid: 'uOwner', role: 'student', memberId: 'mO', code: '', joinedAt: 1 });
    await setDoc(t('/members/uAmy'), { uid: 'uAmy', role: 'student', memberId: 'mA', code: 'x', joinedAt: 1 });
    await setDoc(t('/members/uBen'), { uid: 'uBen', role: 'student', memberId: 'mB', code: 'x', joinedAt: 1 });
    await setDoc(t('/members/uCara'), { uid: 'uCara', role: 'student', memberId: 'mC', code: 'x', joinedAt: 1 });
    await setDoc(t('/claims/mC'), { uid: 'uCara', at: 1 });
    await setDoc(t('/members/uProf'), { uid: 'uProf', role: 'prof', memberId: null, code: 'x', joinedAt: 1 });
    await setDoc(t('/claims/mO'), { uid: 'uOwner', at: 1 });
    await setDoc(t('/claims/mA'), { uid: 'uAmy', at: 1 });
    await setDoc(t('/claims/mB'), { uid: 'uBen', at: 1 });
    for (const [id, m, o, v] of [['iMe', 'mA', 'uAmy', 'me'], ['iTeam', 'mA', 'uAmy', 'team'], ['iProf', 'mA', 'uAmy', 'prof']]) {
      await setDoc(t(`/items/${id}`), record(id, m, o, v));
      await setDoc(t(`/itemMeta/${id}`), { memberId: m, ownerUid: o, type: 'memo', createdAt: 1, visibility: v, purpose: null, correctionId: null, imported: null });
    }
    await setDoc(t('/items/iAi'), record('iAi', 'mA', 'uAmy', 'team', { type: 'ai', ai: { tool: 'ChatGPT', purpose: 'research', transcript: '원문' } }));
    await setDoc(t('/calls/c1'), { id: 'c1', title: '주간 회의', status: 'ended', startedBy: 'uAmy', startedAt: 1, endedAt: 2, summary: '요약', shareProf: true });
    await setDoc(t('/calls/c2'), { id: 'c2', title: '비공유 회의', status: 'ended', startedBy: 'uAmy', startedAt: 1, endedAt: 2, summary: '요약' });
    await setDoc(t('/calls/live'), { id: 'live', title: '진행 중', status: 'live', startedBy: 'uAmy', startedAt: 1, endedAt: null, summary: null });
    await setDoc(t('/calls/c1/lines/l1'), { uid: 'uAmy', memberId: 'mA', name: '에이미', text: '안녕하세요', at: 1 });
    await setDoc(t('/calls/c1/lines/l2'), { uid: 'uBen', memberId: 'mB', name: '벤', text: '네', at: 2 });
    await setDoc(t('/calls/c1/peers/uBen'), { uid: 'uBen', joinedAt: 1, beat: 1 });
    await setDoc(t('/calls/c1/signals/s1'), { from: 'uAmy', to: 'uBen', type: 'offer', data: {}, at: 1 });
    await setDoc(t('/logs/log1'), { at: 1, text: '변경 이력' });
    await setDoc(t('/corrections/corrAi'), { id: 'corrAi', kind: 'reclass', memberId: 'mA', requesterUid: 'uAmy', status: 'pending', itemId: 'iAi', type: 'ai' });
    await setDoc(t('/corrections/corrTeam'), { id: 'corrTeam', kind: 'reclass', memberId: 'mA', requesterUid: 'uAmy', status: 'pending', itemId: 'iTeam', type: 'ai' });
    await setDoc(t('/corrections/corr1'), { id: 'corr1', kind: 'missing', memberId: 'mA', requesterUid: 'uAmy', status: 'pending', confirmedBy: null, type: 'memo', title: 'x' });
    await setDoc(t('/decisions/d1'), { id: 'd1', text: '결정', sourceIds: [] });
    await setDoc(t('/quests/q1'), { id: 'q1', title: '퀘스트' });
    await setDoc(t('/accessLogs/a1'), { uid: 'uStranger', email: '', what: 'join', at: 1 });
    await setDoc(t('/presence/uAmy'), { uid: 'uAmy', memberId: 'mA', at: 1 });
  });
}
const p = (db, path) => doc(db, `teams/${T}${path}`);

// ---------- 초대·역할 ----------
await seed();
await deny('낯선 사람은 팀을 읽을 수 없다', getDoc(doc(stranger(), `teams/${T}`)));
await deny('로그인 안 하면 팀을 읽을 수 없다', getDoc(doc(anon(), `teams/${T}`)));
await deny('코드 없이 참여 불가', setDoc(p(stranger(), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: '', joinedAt: 1 }));
await deny('틀린 코드로 참여 불가', setDoc(p(stranger(), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'wrong', joinedAt: 1 }));
await deny('팀원 코드로 교수자가 될 수 없다', setDoc(p(stranger(), '/members/uStranger'), { uid: 'uStranger', role: 'prof', memberId: null, code: 'student-code-123456', joinedAt: 1 }));
await deny('참여하면서 팀원 이름을 바로 고를 수 없다', setDoc(p(stranger(), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: 'mA', code: 'student-code-123456', joinedAt: 1 }));
await deny('다른 사람의 역할 문서를 만들 수 없다', setDoc(p(stranger(), '/members/uOther'), { uid: 'uOther', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1 }));
await deny('역할 문서에 이메일을 저장하지 않는다', setDoc(p(as('uStranger', 's@x.com'), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1, name: '신입', email: 's@x.com' }));
await allow('올바른 코드로 참여', setDoc(p(as('uStranger', 's@x.com'), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1, name: '신입' }));
await deny('팀원은 교수자 코드를 읽을 수 없다', getDoc(p(amy(), '/secrets/prof')));
await deny('교수자는 팀원 코드를 읽을 수 없다', getDoc(p(prof(), '/secrets/student')));
await allow('팀원은 팀원 코드를 읽는다', getDoc(p(amy(), '/secrets/student')));
await allow('팀장은 교수자 코드를 읽는다', getDoc(p(owner(), '/secrets/prof')));
await env.withSecurityRulesDisabled(async ctx => { await updateDoc(doc(ctx.firestore(), `teams/${T}/members/uBen`), { email: 'old@x.com' }); });
await deny('이메일을 지우며 역할을 바꿀 수 없다', updateDoc(p(ben(), '/members/uBen'), { role: 'prof' }));
await allow('예전에 저장된 내 이메일을 지운다', setDoc(p(ben(), '/members/uBen'), { uid: 'uBen', role: 'student', memberId: 'mB', code: 'x', joinedAt: 1 }));
await deny('자기 역할을 바꿀 수 없다', updateDoc(p(prof(), '/members/uProf'), { role: 'student' }));

// ---------- 팀원 행세 차단 (이번에 막은 구멍) ----------
const db = stranger();
{
  const b = writeBatch(db);
  b.update(p(db, '/members/uStranger'), { memberId: 'mA' });
  b.set(p(db, '/claims/mA'), { uid: 'uStranger', at: 2 });
  await deny('이미 다른 계정이 쓰는 팀원을 고를 수 없다', b.commit());
}
await deny('claim 없이 팀원을 고를 수 없다', updateDoc(p(db, '/members/uStranger'), { memberId: 'mFree' }));
await deny('자기 팀원이 아닌 claim을 만들 수 없다', setDoc(p(db, '/claims/mZ'), { uid: 'uStranger', at: 2 }));
{
  const b = writeBatch(db);
  b.update(p(db, '/members/uStranger'), { memberId: 'mFree' });
  b.set(p(db, '/claims/mFree'), { uid: 'uStranger', at: 2 });
  await allow('빈자리 팀원은 고를 수 있다', b.commit());
}
await deny('한 번 고른 팀원을 바꿀 수 없다', updateDoc(p(db, '/members/uStranger'), { memberId: 'mB' }));
await deny('남의 claim을 지울 수 없다', deleteDoc(p(amy(), '/claims/mB')));
await deny('다른 팀원 이름으로 기록을 쓸 수 없다', setDoc(p(amy(), '/items/forged'), record('forged', 'mB', 'uAmy', 'team')));
await deny('다른 사람을 작성자로 기록을 쓸 수 없다', setDoc(p(amy(), '/items/forged2'), record('forged2', 'mA', 'uBen', 'team')));
await deny('다른 팀원 이름으로 접속 표시를 할 수 없다', setDoc(p(amy(), '/presence/uAmy'), { uid: 'uAmy', memberId: 'mB', at: 2 }));
await allow('자기 이름으로 접속 표시', setDoc(p(amy(), '/presence/uAmy'), { uid: 'uAmy', memberId: 'mA', at: 2 }));
await deny('남의 접속 표시를 쓸 수 없다', setDoc(p(amy(), '/presence/uBen'), { uid: 'uBen', memberId: 'mA', at: 2 }));

// 예전에 만든 방: 이미 연결된 계정은 자기 claim을 채워 넣을 수 있다
await seed();
await env.withSecurityRulesDisabled(async ctx => { await deleteDoc(doc(ctx.firestore(), `teams/${T}/claims/mB`)); });
await deny('예전 방에서도 남의 claim은 못 채운다', setDoc(p(amy(), '/claims/mB'), { uid: 'uAmy', at: 2 }));
await allow('예전 방: 자기 claim 채워 넣기', setDoc(p(ben(), '/claims/mB'), { uid: 'uBen', at: 2 }));

// ---------- 공유 범위 ----------
await seed();
await allow('작성자는 나만 기록을 읽는다', getDoc(p(amy(), '/items/iMe')));
await deny('다른 팀원은 나만 기록을 못 읽는다', getDoc(p(ben(), '/items/iMe')));
await allow('팀원은 팀 기록을 읽는다', getDoc(p(ben(), '/items/iTeam')));
await deny('교수자는 팀 기록을 못 읽는다', getDoc(p(prof(), '/items/iTeam')));
await allow('교수자는 교수자까지 기록을 읽는다', getDoc(p(prof(), '/items/iProf')));
await deny('교수자는 나만 기록을 못 읽는다', getDoc(p(prof(), '/items/iMe')));
await allow('교수자는 itemMeta로 횟수를 본다', getDocs(collection(prof(), `teams/${T}/itemMeta`)));
await deny('팀원도 범위 없이 items 전체를 읽을 수 없다', getDocs(collection(ben(), `teams/${T}/items`)));
await allow('범위 쿼리(team)', getDocs(query(collection(ben(), `teams/${T}/items`), where('visibility', '==', 'team'))));
await allow('범위 쿼리(내 것)', getDocs(query(collection(ben(), `teams/${T}/items`), where('ownerUid', '==', 'uBen'))));
await deny('교수자는 기록을 쓸 수 없다', setDoc(p(prof(), '/items/x'), record('x', 'mA', 'uProf', 'prof')));
await deny('교수자는 결정을 쓸 수 없다', setDoc(p(prof(), '/decisions/x'), { id: 'x', text: 'x' }));

// ---------- 기록 쓰기 ----------
await allow('내 기록 쓰기', setDoc(p(ben(), '/items/mine'), record('mine', 'mB', 'uBen', 'me')));
await deny('이상한 공유 범위 거절', setDoc(p(ben(), '/items/bad1'), record('bad1', 'mB', 'uBen', 'everyone')));
await deny('모르는 기록 종류 거절', setDoc(p(ben(), '/items/bad2'), record('bad2', 'mB', 'uBen', 'team', { type: 'virus' })));
await deny('너무 긴 내용 거절', setDoc(p(ben(), '/items/bad3'), record('bad3', 'mB', 'uBen', 'team', { content: 'x'.repeat(50001) })));
await deny('작성 시각이 숫자가 아니면 거절', setDoc(p(ben(), '/items/bad4'), record('bad4', 'mB', 'uBen', 'team', { createdAt: 'now' })));
await allow('투표는 다른 팀원도', updateDoc(p(ben(), '/items/iTeam'), { votes: arrayUnion('mB') }));
await deny('다른 팀원은 내용을 못 고친다', updateDoc(p(ben(), '/items/iTeam'), { content: '변조' }));
await deny('다른 팀원은 공유 범위를 못 바꾼다', updateDoc(p(ben(), '/items/iTeam'), { visibility: 'me' }));
await deny('보정 요청 없이는 분류를 못 바꾼다', updateDoc(p(ben(), '/items/iTeam'), { type: 'idea' }));
await deny('보정 요청 없이는 키워드를 못 바꾼다', updateDoc(p(ben(), '/items/iTeam'), { keywords: ['가짜'] }));
await deny('다른 기록의 보정 요청으로는 못 바꾼다', updateDoc(p(ben(), '/items/iTeam'), { type: 'idea', appliedCorrection: 'corrAi' }));
await deny('보정으로도 AI 대화 원문은 못 고친다', updateDoc(p(ben(), '/items/iAi'), { appliedCorrection: 'corrAi', ai: { tool: 'ChatGPT', purpose: 'research', transcript: '변조' } }));
await allow('보정 요청을 확인하며 AI 사용 목적을 바꿀 수 있다', updateDoc(p(ben(), '/items/iAi'), { appliedCorrection: 'corrAi', ai: { tool: 'ChatGPT', purpose: 'code', transcript: '원문' } }));
await allow('보정 요청을 확인하며 AI 대화로 바꿀 수 있다', updateDoc(p(ben(), '/items/iTeam'), { appliedCorrection: 'corrTeam', type: 'ai', ai: { tool: '', purpose: 'etc', transcript: 'x' } }));
await deny('남의 표를 대신 넣을 수 없다', updateDoc(p(ben(), '/items/iProf'), { votes: arrayUnion('mO') }));
await deny('다른 사람 표를 지울 수 없다', updateDoc(p(ben(), '/items/iProf'), { votes: [] , table: 'x' }));
await allow('테이블에 올리기', updateDoc(p(ben(), '/items/iProf'), { table: { x: 10, y: 20 } }));
await deny('테이블 좌표에 글자를 넣을 수 없다', updateDoc(p(ben(), '/items/iProf'), { table: { x: '"><img>', y: 1 } }));
await deny('기록 id에 이상한 글자를 넣을 수 없다', setDoc(p(ben(), `/items/${encodeURIComponent('"><img src=x>')}`), record('x', 'mB', 'uBen', 'team')));
await deny('문서 id와 내용의 id가 달라야 할 이유가 없다', setDoc(p(ben(), '/items/same1'), record('other', 'mB', 'uBen', 'team')));
await deny('javascript: 주소를 저장할 수 없다', setDoc(p(ben(), '/items/js1'), record('js1', 'mB', 'uBen', 'team', { url: 'javascript:alert(1)' })));
await deny('javascript: 대소문자 바꿔도 안 됨', setDoc(p(ben(), '/items/js2'), record('js2', 'mB', 'uBen', 'team', { url: 'JaVaScRiPt:alert(1)' })));
await allow('https 주소는 저장', setDoc(p(ben(), '/items/ok1'), record('ok1', 'mB', 'uBen', 'team', { url: 'https://a.b/c?d=1:2' })));
await allow('스킴 없는 주소도 저장', setDoc(p(ben(), '/items/ok2'), record('ok2', 'mB', 'uBen', 'team', { url: 'example.com/a' })));
await deny('미래 시각으로 기록할 수 없다', setDoc(p(ben(), '/items/fut'), record('fut', 'mB', 'uBen', 'team', { createdAt: Date.now() + 3 * 864e5 })));
const metaOf = (o = {}) => ({ memberId: 'mB', ownerUid: 'uBen', type: 'memo', createdAt: 1, visibility: 'team', purpose: null, correctionId: null, imported: null, ...o });
await deny('기록 없이 횟수만 늘릴 수 없다', setDoc(p(ben(), '/itemMeta/ghost'), metaOf()));
{
  const db2 = ben(), b = writeBatch(db2);
  b.set(p(db2, '/items/pair'), record('pair', 'mB', 'uBen', 'team'));
  b.set(p(db2, '/itemMeta/pair'), metaOf());
  await allow('기록과 횟수는 함께 저장', b.commit());
}
await deny('남의 횟수 기록 종류를 바꿀 수 없다', updateDoc(p(ben(), '/itemMeta/iProf'), { type: 'idea' }));

// 명단: 다른 팀원 칸을 건드릴 수 없다
const team = () => `teams/${T}`;
const entry = (id, o = {}) => ({ id, name: id, color: '#555555', ...o });
await deny('예전 명단 배열을 고칠 수 없다', updateDoc(doc(ben(), team()), { members: ROSTER.map(m => (m.id === 'mA' ? { ...m, name: '가짜' } : m)) }));
await deny('연동 대상은 팀원이 못 바꾼다 (피해자 토큰으로 비공개 저장소를 읽히는 공격)', updateDoc(doc(ben(), team()), { links: { github: 'victim/private-repo' } }));
await allow('연동 대상은 팀장이 정한다', updateDoc(doc(owner(), team()), { links: { github: 'team/repo' } }));
await allow('방 이름은 팀원도 바꾼다', updateDoc(doc(ben(), team()), { teamName: '새 이름' }));
await deny('팀장도 예전 명단 배열을 고쳐 쓸 수는 없다', updateDoc(doc(owner(), team()), { members: ROSTER.slice(0, 1) }));
await deny('팀원은 명단 배열을 비울 수 없다', updateDoc(doc(ben(), team()), { members: [] }));
await allow('옮긴 뒤 팀장은 명단 배열을 비운다', updateDoc(doc(owner(), team()), { members: [] }));
await deny('명단 배열이 찬 방을 새로 만들 수 없다', setDoc(doc(as('uNew2'), 'teams/N9'), { teamName: 'x', ownerUid: 'uNew2', members: [entry('a', { color: '"><img>' })] }));
await env.withSecurityRulesDisabled(async ctx => {
  for (const m of ROSTER) await setDoc(doc(ctx.firestore(), `teams/${T}/roster/${m.id}`), m);
  await setDoc(doc(ctx.firestore(), `teams/${T}/claims/mC`), { uid: 'uCara', at: 1 });
});
const mine = (o = {}) => ({ ...ROSTER[2], ...o });
await allow('팀원은 명단을 읽는다', getDocs(collection(ben(), `teams/${T}/roster`)));
await allow('교수자도 명단을 읽는다', getDocs(collection(prof(), `teams/${T}/roster`)));
await deny('낯선 사람은 명단을 못 읽는다', getDocs(collection(stranger(), `teams/${T}/roster`)));
await deny('다른 팀원 이름을 바꿀 수 없다', setDoc(p(ben(), '/roster/mA'), { ...ROSTER[1], name: '가짜' }));
await deny('다른 팀원 칸을 지울 수 없다', deleteDoc(p(ben(), '/roster/mA')));
await deny('내 칸에 공격 문자열 색을 넣을 수 없다', setDoc(p(ben(), '/roster/mB'), mine({ color: 'red;"><img src=x>' })));
await deny('명단에 사진 주소를 저장하지 않는다', setDoc(p(ben(), '/roster/mB'), mine({ photo: 'https://lh3.googleusercontent.com/a/x' })));
await deny('명단에 이메일을 저장하지 않는다', setDoc(p(ben(), '/roster/mB'), mine({ email: 'b@x.com' })));
await deny('내 칸의 계정을 남으로 바꿀 수 없다', setDoc(p(ben(), '/roster/mB'), mine({ uid: 'uAmy' })));
await deny('칸 안의 id를 바꿀 수 없다', setDoc(p(ben(), '/roster/mB'), mine({ id: 'mA' })));
await deny('새 칸을 남의 계정으로 만들 수 없다', setDoc(p(ben(), '/roster/mNew'), entry('mNew', { uid: 'uAmy' })));
await deny('칸 id에 이상한 글자를 넣을 수 없다', setDoc(p(ben(), `/roster/${encodeURIComponent('"><img>')}`), entry('"><img>')));
await deny('주인이 있는 칸을 가로채 새로 만들 수 없다 (옮기기 전 칸)', setDoc(p(ben(), '/roster/mC'), entry('mC')));
await deny('교수자는 명단을 못 쓴다', setDoc(p(prof(), '/roster/mNew'), entry('mNew')));
await allow('내 칸은 고칠 수 있다', setDoc(p(ben(), '/roster/mB'), mine({ name: '벤2', connections: { github: 'ok' } })));
await allow('내 칸을 연결 해제할 수 있다', setDoc(p(ben(), '/roster/mB'), { id: 'mB', name: '벤', color: '#333333' }));
await allow('새 팀원 칸을 더할 수 있다', setDoc(p(cara(), '/roster/mNew'), entry('mNew')));
await allow('주인인 칸을 옮겨 만들 수 있다', setDoc(p(cara(), '/roster/mC'), entry('mC', { uid: 'uCara' })));
await allow('팀장은 내보낼 때 칸을 정리한다', setDoc(p(owner(), '/roster/mA'), { id: 'mA', name: '에이미', color: '#222222' }));
await allow('팀장은 칸을 지울 수 있다 (장난으로 만든 칸)', deleteDoc(p(owner(), '/roster/mNew')));
await allow('팀장은 예전 방의 칸을 옮긴다', setDoc(p(owner(), '/roster/mOld'), entry('mOld')));

// 보정 요청 (RQ-14)
await seed();
await allow('확인자가 빠진 기여를 요청자 이름으로 추가', setDoc(p(ben(), '/items/fromCorr'), record('fromCorr', 'mA', 'uAmy', 'team', { correctionId: 'corr1' })));
await deny('자기 보정 요청을 스스로 확인할 수 없다', updateDoc(p(amy(), '/corrections/corr1'), { status: 'applied', confirmedBy: 'mA' }));
await deny('확인자를 다른 사람으로 남길 수 없다', updateDoc(p(ben(), '/corrections/corr1'), { status: 'applied', confirmedBy: 'mO' }));
await allow('다른 팀원이 자기 이름으로 확인', updateDoc(p(ben(), '/corrections/corr1'), { status: 'applied', confirmedBy: 'mB' }));
await deny('처리한 요청을 되돌릴 수 없다', updateDoc(p(owner(), '/corrections/corr1'), { status: 'rejected', confirmedBy: 'mO' }));
await deny('남의 기여를 대신 보정 요청할 수 없다', setDoc(p(ben(), '/corrections/forged'), { id: 'forged', kind: 'missing', memberId: 'mA', requesterUid: 'uBen', status: 'pending' }));
await allow('내 기여 보정 요청', setDoc(p(ben(), '/corrections/mine'), { id: 'mine', kind: 'missing', memberId: 'mB', requesterUid: 'uBen', status: 'pending' }));
await deny('남의 이름으로 변경 이력을 쓸 수 없다', setDoc(p(ben(), '/logs/forged'), { at: 1, text: '위조', by: 'uAmy' }));
await deny('누가 썼는지 없는 이력은 안 된다', setDoc(p(ben(), '/logs/noby'), { at: 1, text: '위조' }));
await allow('변경 이력 추가', setDoc(p(ben(), '/logs/mine'), { at: 1, text: '내용', by: 'uBen' }));
await deny('처리한 요청으로 기록을 찍어낼 수 없다', setDoc(p(ben(), '/items/fromCorr2'), record('fromCorr2', 'mA', 'uAmy', 'team', { correctionId: 'corr1' })));
await deny('변경 이력은 고칠 수 없다', updateDoc(p(amy(), '/logs/log1'), { text: '변조' }));
await deny('변경 이력은 지울 수 없다', deleteDoc(p(owner(), '/logs/log1')));

// ---------- 회의 ----------
await seed();
await allow('교수자는 공유된 회의를 읽는다', getDoc(p(prof(), '/calls/c1')));
await deny('교수자는 공유 안 된 회의를 못 읽는다', getDoc(p(prof(), '/calls/c2')));
await deny('교수자는 녹취 원문을 못 읽는다', getDocs(collection(prof(), `teams/${T}/calls/c1/lines`)));
await allow('교수자는 공유된 회의 쿼리를 쓴다', getDocs(query(collection(prof(), `teams/${T}/calls`), where('shareProf', '==', true))));
await deny('다른 사람 이름으로 녹취를 쓸 수 없다', setDoc(p(ben(), '/calls/live/lines/x'), { uid: 'uAmy', memberId: 'mA', name: '에이미', text: '가짜 발언', at: 3 }));
await allow('내 발언 쓰기', setDoc(p(ben(), '/calls/live/lines/y'), { uid: 'uBen', memberId: 'mB', name: '벤', text: '네', at: 3 }));
await deny('녹취를 고칠 수 없다', updateDoc(p(ben(), '/calls/c1/lines/l2'), { text: '변조' }));
await allow('내 발언은 지울 수 있다', deleteDoc(p(ben(), '/calls/c1/lines/l2')));
await deny('남의 발언은 지울 수 없다 (회의 시작자·팀장이 아니면)', deleteDoc(p(ben(), '/calls/c1/lines/l1')));
await deny('보낸·받는 사람이 아니면 연결 정보를 못 읽는다', getDoc(p(cara(), '/calls/c1/signals/s1')));
await allow('받는 사람은 연결 정보를 읽는다', getDoc(p(ben(), '/calls/c1/signals/s1')));
await deny('끝난 회의를 다시 열 수 없다', updateDoc(p(ben(), '/calls/c1'), { status: 'live' }));
await allow('진행 중 회의 끝내기', updateDoc(p(ben(), '/calls/live'), { status: 'ended', endedAt: 5, summary: null, closedBy: 'uBen' }));
await allow('요약 저장', updateDoc(p(ben(), '/calls/live'), { summary: '요약', summaryBy: 'rule', attendees: ['벤'], lineCount: 1 }));
await deny('저장된 요약을 다른 팀원이 고칠 수 없다', updateDoc(p(ben(), '/calls/c1'), { summary: '조작된 요약' }));
await deny('다른 사람 이름으로 회의를 끝낼 수 없다', updateDoc(p(ben(), '/calls/live'), { closedBy: 'uAmy' }));
await deny('시작자·팀장이 아니면 교수자 공유를 못 켠다', updateDoc(p(ben(), '/calls/c2'), { shareProf: true }));
await allow('시작자는 교수자 공유를 켠다', updateDoc(p(amy(), '/calls/c2'), { shareProf: true }));
await allow('팀장도 교수자 공유를 끈다', updateDoc(p(owner(), '/calls/c2'), { shareProf: false }));
await deny('만들 때부터 교수자 공유를 켤 수 없다', setDoc(p(ben(), '/calls/nw'), { id: 'nw', title: 't', status: 'live', startedBy: 'uBen', startedAt: 1, shareProf: true }));
await deny('회의 시작자를 바꿀 수 없다', updateDoc(p(ben(), '/calls/c1'), { startedBy: 'uBen' }));
await deny('시작자·팀장이 아니면 회의 기록을 지울 수 없다', deleteDoc(p(ben(), '/calls/c2')));
await allow('시작자는 회의 녹취를 지운다', deleteDoc(p(amy(), '/calls/c1/lines/l1')));
await allow('시작자는 남은 연결 정보도 지운다', getDocs(collection(amy(), `teams/${T}/calls/c1/signals`)));
await allow('시작자는 회의를 지운다', deleteDoc(p(amy(), '/calls/c2')));
await allow('팀장은 회의를 지운다', deleteDoc(p(owner(), '/calls/c1')));

// ---------- 방 관리 ----------
await seed();
await deny('팀원은 초대 코드를 바꿀 수 없다', updateDoc(p(amy(), '/secrets/student'), { code: 'new-code-1234567890' }));
await deny('짧은 코드로 방을 만들 수 없다', (async () => { const n = as('uShort'), b = writeBatch(n); b.set(doc(n, 'teams/S'), { teamName: 's', ownerUid: 'uShort', members: [] }); b.set(doc(n, 'teams/S/secrets/student'), { code: 'abc' }); await b.commit(); })());
await deny('짧은 코드로 바꿀 수 없다', updateDoc(p(owner(), '/secrets/student'), { code: 'short' }));
await deny('만료 기한을 31일 넘게 잡을 수 없다', updateDoc(p(owner(), '/secrets/student'), { code: 'new-code-1234567890', expiresAt: Date.now() + 32 * 864e5 }));
await deny('팀원은 만료 기한을 늘릴 수 없다', updateDoc(p(amy(), '/secrets/student'), { expiresAt: Date.now() + 864e5 }));
await allow('만료 기한이 없는 예전 링크로 참여', setDoc(p(as('uOld'), '/members/uOld'), { uid: 'uOld', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1 }));
await allow('만료되게 설정 (시험용)', updateDoc(p(owner(), '/secrets/student'), { expiresAt: Date.now() - 1000 }));
await deny('만료된 링크로는 참여 불가', setDoc(p(as('uLate'), '/members/uLate'), { uid: 'uLate', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1 }));
await allow('이미 들어온 사람은 만료 뒤에도 그대로', getDoc(doc(as('uOld'), `teams/${T}`)));
await allow('기한 안의 링크로 참여', updateDoc(p(owner(), '/secrets/student'), { expiresAt: Date.now() + 7 * 864e5 }));
await allow('기한이 남으면 참여 가능', setDoc(p(as('uLate'), '/members/uLate'), { uid: 'uLate', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1 }));
await allow('팀장이 초대 코드를 다시 발급', updateDoc(p(owner(), '/secrets/student'), { code: 'new-code-1234567890', expiresAt: Date.now() + 7 * 864e5 }));
await deny('옛 초대 코드로는 참여 불가', setDoc(p(stranger(), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1 }));
await allow('새 코드로 참여', setDoc(p(stranger(), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'new-code-1234567890', joinedAt: 1 }));

await deny('다시 발급해도 교수자 코드는 팀원이 못 읽는다', getDoc(p(amy(), '/secrets/prof')));
await deny('팀원은 역할 목록을 볼 수 없다', getDocs(collection(amy(), `teams/${T}/members`)));
await allow('팀장은 역할 목록을 본다', getDocs(collection(owner(), `teams/${T}/members`)));
await deny('팀원은 다른 팀원을 내보낼 수 없다', deleteDoc(p(amy(), '/members/uBen')));
await allow('팀장이 교수자 접근을 끊는다', deleteDoc(p(owner(), '/members/uProf')));
await deny('끊긴 교수자는 팀을 못 읽는다', getDoc(doc(prof(), `teams/${T}`)));
{
  const o = owner(), b = writeBatch(o);
  b.delete(p(o, '/members/uBen'));
  b.delete(p(o, '/claims/mB'));
  await allow('팀장이 팀원을 내보낸다 (claim도 비움)', b.commit());
}
await deny('내보낸 팀원은 기록을 못 쓴다', setDoc(p(ben(), '/items/after'), record('after', 'mB', 'uBen', 'team')));
await deny('내보낸 팀원은 기록을 못 읽는다', getDoc(p(ben(), '/items/iTeam')));

await seed();
await deny('팀장은 넘기기 전에 나갈 수 없다', deleteDoc(p(owner(), '/members/uOwner')));
await allow('팀원은 스스로 나간다', deleteDoc(p(ben(), '/members/uBen')));
await deny('팀원은 팀장을 가로챌 수 없다', updateDoc(doc(amy(), `teams/${T}`), { ownerUid: 'uAmy' }));
await deny('방 밖의 사람에게 넘길 수 없다', updateDoc(doc(owner(), `teams/${T}`), { ownerUid: 'uStranger' }));
await deny('교수자에게 넘길 수 없다', updateDoc(doc(owner(), `teams/${T}`), { ownerUid: 'uProf' }));
await deny('넘기면서 다른 칸을 함께 바꿀 수 없다', updateDoc(doc(owner(), `teams/${T}`), { ownerUid: 'uAmy', deleting: true }));
await allow('팀장 넘기기', updateDoc(doc(owner(), `teams/${T}`), { ownerUid: 'uAmy' }));
await allow('넘긴 뒤 옛 팀장은 나갈 수 있다', deleteDoc(p(owner(), '/members/uOwner')));

// ---------- 방 삭제 (두 단계) ----------
await seed();
await deny('삭제 표시 전에는 남의 기록을 못 지운다', deleteDoc(p(owner(), '/items/iMe')));
await deny('삭제 표시 전에는 이력을 못 지운다', deleteDoc(p(owner(), '/logs/log1')));
await deny('팀원은 삭제 표시를 할 수 없다', updateDoc(doc(amy(), `teams/${T}`), { deleting: true }));
await deny('팀원은 방을 지울 수 없다', deleteDoc(doc(amy(), `teams/${T}`)));
await allow('팀장이 삭제 표시', updateDoc(doc(owner(), `teams/${T}`), { deleting: true }));
await deny('삭제 중에도 팀원은 남의 기록을 못 지운다', deleteDoc(p(ben(), '/items/iMe')));
{
  // 앱과 같은 순서: 목록을 읽고 → 묶음으로 지우고 → 마지막에 팀 문서
  const o = owner();
  const paths = [];
  const meta = await getDocs(collection(o, `teams/${T}/itemMeta`));
  meta.docs.forEach(d => paths.push(`/items/${d.id}`, `/itemMeta/${d.id}`));
  paths.push('/items/iAi');
  for (const c of ['decisions', 'quests', 'corrections', 'logs', 'accessLogs', 'presence', 'claims', 'members']) {
    const snap = await getDocs(collection(o, `teams/${T}/${c}`));
    snap.docs.forEach(d => paths.push(`/${c}/${d.id}`));
  }
  for (const c of ['c1', 'c2', 'live']) {
    for (const sub of ['lines', 'peers', 'signals']) {
      const snap = await getDocs(collection(o, `teams/${T}/calls/${c}/${sub}`));
      snap.docs.forEach(d => paths.push(`/calls/${c}/${sub}/${d.id}`));
    }
    paths.push(`/calls/${c}`);
  }
  paths.push('/secrets/student', '/secrets/prof');
  const b = writeBatch(o);
  paths.forEach(x => b.delete(p(o, x)));
  await allow(`묶음으로 하위 문서 ${paths.length}개 삭제`, b.commit());
  await allow('마지막에 팀 문서 삭제', deleteDoc(doc(o, `teams/${T}`)));
}

// ---------- 새 방 만들기 ----------
await env.clearFirestore();
await env.withSecurityRulesDisabled(async ctx => giveConsent(ctx.firestore()));
{
  const o = as('uNew');
  const b = writeBatch(o);
  const tp = 'teams/N';
  b.set(doc(o, tp), { teamName: '새 방', course: '', ownerUid: 'uNew', members: [], decisionDismissed: [], links: {}, createdAt: 1 });
  b.set(doc(o, `${tp}/secrets/student`), { code: 'aaaaaaaaaaaaaaaaaa' });
  b.set(doc(o, `${tp}/secrets/prof`), { code: 'bbbbbbbbbbbbbbbbbb' });
  b.set(doc(o, `${tp}/members/uNew`), { uid: 'uNew', role: 'student', memberId: 'm1', code: '', joinedAt: 1 });
  b.set(doc(o, `${tp}/claims/m1`), { uid: 'uNew', at: 1 });
  await allow('방 만들기 (팀·코드·역할·claim을 한 번에)', b.commit());
  await allow('방을 만든 사람이 명단 칸을 쓴다', setDoc(doc(o, `${tp}/roster/m1`), { id: 'm1', name: '나', color: '#123456', uid: 'uNew', at: 0 }));
  await deny('남을 팀장으로 방을 만들 수 없다', setDoc(doc(o, 'teams/N2'), { teamName: 'x', ownerUid: 'uOther' }));
  await deny('삭제 표시가 된 방을 만들 수 없다', setDoc(doc(o, 'teams/N3'), { teamName: 'x', ownerUid: 'uNew', deleting: true }));
  // 큰 워크스페이스 올리기: 앱이 쓰는 묶음 크기(24건)가 규칙 평가 한도 안에 들어야 한다
  const big = writeBatch(o);
  for (let i = 0; i < 12; i++) {
    big.set(doc(o, `${tp}/items/b${i}`), record(`b${i}`, 'm1', 'uNew', 'team'));
    big.set(doc(o, `${tp}/itemMeta/b${i}`), { memberId: 'm1', ownerUid: 'uNew', type: 'memo', createdAt: 1, visibility: 'team', purpose: null, correctionId: null, imported: null });
  }
  await allow('한 묶음 24건 올리기 (기록·횟수 12쌍)', big.commit());
}

// ---------- 접근 기록 ----------
await seed();
await allow('거절된 접근 기록 남기기', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/uStranger_join_20261105'), { uid: 'uStranger', what: 'join', at: 1 }));
await deny('같은 날 같은 기록을 쏟아낼 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/uStranger_join_20261105'), { uid: 'uStranger', what: 'join', at: 2 }));
await deny('임의의 id로 쏟아낼 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/a9'), { uid: 'uStranger', what: 'join', at: 1 }));
await deny('남의 이름 id로 쓸 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/uAmy_join_20261105'), { uid: 'uStranger', what: 'join', at: 1 }));
await deny('접근 기록에 이메일을 저장하지 않는다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/uStranger_open_20261105'), { uid: 'uStranger', email: 's@x.com', what: 'join', at: 1 }));
await deny('접근 기록에 다른 칸을 넣을 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/uStranger_view_20261105'), { uid: 'uStranger', what: 'x', at: 1, blob: 'y' }));
await allow('내 접근 기록은 지울 수 있다', deleteDoc(p(as('uStranger', 's@x.com'), '/accessLogs/uStranger_join_20261105')));
await deny('팀원은 접근 기록을 못 읽는다', getDocs(collection(amy(), `teams/${T}/accessLogs`)));
await allow('팀장은 접근 기록을 읽는다', getDocs(collection(owner(), `teams/${T}/accessLogs`)));

// ---------- 동의와 보호자 동의 ----------
await env.clearFirestore();
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'teams/R'), { teamName: 'r', ownerUid: 'uOwner', members: [] });
  await setDoc(doc(db, 'teams/R/secrets/student'), { code: 'student-code-123456' });
});
const joinR = uid => setDoc(doc(as(uid), `teams/R/members/${uid}`), { uid, role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1 });
const newRoom = (uid, id) => setDoc(doc(as(uid), `teams/${id}`), { teamName: 'x', ownerUid: uid, members: [] });
await deny('동의 전에는 방에 들어갈 수 없다', joinR('kNo'));
await deny('동의 전에는 방을 만들 수 없다', newRoom('kNo', 'Z1'));
await allow('동의 기록 남기기 (만 14세 이상)', setDoc(doc(as('kAdult'), 'users/kAdult'), { consent: CONSENT }));
await allow('동의 후 방 참여', joinR('kAdult'));
await allow('필수 동의가 빠진 기록', setDoc(doc(as('kHalf'), 'users/kHalf'), { consent: { ...CONSENT, privacy: false } }));
await deny('필수 동의가 빠지면 방에 못 들어감', joinR('kHalf'));

const TOKEN = 'guardian-token-1234567890';
const kid = () => as('kKid');
await allow('아이가 보호자 요청 만들기', setDoc(doc(kid(), `guardianRequests/${TOKEN}`), { childUid: 'kKid', status: 'pending', createdAt: 1, version: 'test' }));
await deny('요청을 처음부터 승인 상태로 만들 수 없다', setDoc(doc(kid(), 'guardianRequests/guardian-token-self-approve'), { childUid: 'kKid', status: 'approved', createdAt: 1, version: 'test' }));
await deny('다른 아이 이름으로 요청을 만들 수 없다', setDoc(doc(as('kOther'), 'guardianRequests/guardian-token-other-child'), { childUid: 'kKid', status: 'pending', createdAt: 1, version: 'test' }));
await deny('짧은 토큰은 거절', setDoc(doc(kid(), 'guardianRequests/short'), { childUid: 'kKid', status: 'pending', createdAt: 1, version: 'test' }));
await allow('만 14세 미만으로 동의 기록', setDoc(doc(kid(), 'users/kKid'), { consent: { ...CONSENT, over14: false, guardianToken: TOKEN } }));
await deny('보호자 승인 전에는 방에 못 들어감', joinR('kKid'));
await deny('보호자 승인 전에는 방을 못 만듦', newRoom('kKid', 'Z2'));
await deny('혼자 만 14세 이상으로 바꿀 수 없다', updateDoc(doc(kid(), 'users/kKid'), { 'consent.over14': true }));
await deny('아이가 스스로 승인할 수 없다', updateDoc(doc(kid(), `guardianRequests/${TOKEN}`), { status: 'approved', guardianUid: 'kKid', guardianEmail: 'k@x.com', decidedAt: 1 }));
const guardian = () => as('gMom', 'mom@x.com');
await deny('보호자 칸에 남의 계정을 쓸 수 없다', updateDoc(doc(guardian(), `guardianRequests/${TOKEN}`), { status: 'approved', guardianUid: 'gDad', guardianEmail: 'mom@x.com', decidedAt: 1 }));
await deny('보호자 이메일을 속일 수 없다', updateDoc(doc(guardian(), `guardianRequests/${TOKEN}`), { status: 'approved', guardianUid: 'gMom', guardianEmail: 'fake@x.com', decidedAt: 1 }));
await deny('요청 내용(아이)을 바꿀 수 없다', updateDoc(doc(guardian(), `guardianRequests/${TOKEN}`), { childUid: 'kOther', status: 'approved', guardianUid: 'gMom', guardianEmail: 'mom@x.com', decidedAt: 1 }));
await deny('요청 목록은 볼 수 없다', getDocs(collection(guardian(), 'guardianRequests')));
await allow('링크를 아는 보호자는 요청을 읽는다', getDoc(doc(guardian(), `guardianRequests/${TOKEN}`)));
await allow('보호자 승인', updateDoc(doc(guardian(), `guardianRequests/${TOKEN}`), { status: 'approved', guardianUid: 'gMom', guardianEmail: 'mom@x.com', decidedAt: 1 }));
await allow('승인 후 방 참여', joinR('kKid'));
await deny('다른 사람이 보호자 결정을 뒤집을 수 없다', updateDoc(doc(as('gStranger', 's@x.com'), `guardianRequests/${TOKEN}`), { status: 'rejected', guardianUid: 'gStranger', guardianEmail: 's@x.com', decidedAt: 2 }));
await allow('보호자는 철회할 수 있다', updateDoc(doc(guardian(), `guardianRequests/${TOKEN}`), { status: 'revoked', guardianUid: 'gMom', guardianEmail: 'mom@x.com', decidedAt: 2 }));
await deny('철회 후에는 새 방에 못 들어감', newRoom('kKid', 'Z3'));
await allow('아이는 계정을 지우며 요청을 지운다', deleteDoc(doc(kid(), `guardianRequests/${TOKEN}`)));
await allow('내 계정 문서를 지운다', deleteDoc(doc(kid(), 'users/kKid')));
await deny('남의 계정 문서는 못 지운다', deleteDoc(doc(as('kOther'), 'users/kAdult')));

await quiet(() => env.cleanup());
console.log(`\n규칙 시험: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
