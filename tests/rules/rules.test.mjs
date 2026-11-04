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
async function allow(name, p) { try { await assertSucceeds(p); pass++; console.log(`PASS  ${name}`); } catch (e) { fail++; console.log(`FAIL  ${name} (거절됨: ${e.message.slice(0, 200)})`); } }
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

const record = (id, memberId, ownerUid, visibility, extra = {}) => ({
  id, memberId, ownerUid, visibility, type: 'memo', title: `기록 ${id}`, content: '내용', url: '', createdAt: 1, votes: [], table: null, ...extra,
});

// 규칙을 거치지 않고 기본 방을 채운다
async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const t = p => doc(db, `teams/${T}${p}`);
    await setDoc(doc(db, `teams/${T}`), { teamName: '호랑이양말', course: '소공', ownerUid: 'uOwner', members: [{ id: 'mO', name: '팀장', uid: 'uOwner' }, { id: 'mA', name: '에이미', uid: 'uAmy' }, { id: 'mB', name: '벤', uid: 'uBen' }, { id: 'mFree', name: '빈자리' }], decisionDismissed: [], links: {} });
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
await deny('역할 문서의 이메일을 속일 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1, name: '신입', email: 'prof@x.com' }));
await allow('올바른 코드로 참여', setDoc(p(as('uStranger', 's@x.com'), '/members/uStranger'), { uid: 'uStranger', role: 'student', memberId: null, code: 'student-code-123456', joinedAt: 1, name: '신입', email: 's@x.com' }));
await deny('팀원은 교수자 코드를 읽을 수 없다', getDoc(p(amy(), '/secrets/prof')));
await deny('교수자는 팀원 코드를 읽을 수 없다', getDoc(p(prof(), '/secrets/student')));
await allow('팀원은 팀원 코드를 읽는다', getDoc(p(amy(), '/secrets/student')));
await allow('팀장은 교수자 코드를 읽는다', getDoc(p(owner(), '/secrets/prof')));
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
await deny('다른 팀원은 AI 대화 원문을 못 고친다', updateDoc(p(ben(), '/items/iAi'), { ai: { tool: 'ChatGPT', purpose: 'research', transcript: '변조' } }));
await allow('다른 팀원은 AI 사용 목적을 보정할 수 있다', updateDoc(p(ben(), '/items/iAi'), { ai: { tool: 'ChatGPT', purpose: 'code', transcript: '원문' } }));
await allow('보정으로 AI 대화가 될 때 ai 칸을 만들 수 있다', updateDoc(p(ben(), '/items/iTeam'), { type: 'ai', ai: { tool: '', purpose: 'etc', transcript: 'x' } }));
await deny('작성자도 작성자를 바꿀 수 없다', updateDoc(p(amy(), '/items/iTeam'), { ownerUid: 'uBen' }));
await deny('남의 기록을 지울 수 없다', deleteDoc(p(ben(), '/items/iTeam')));
await allow('내 기록은 지운다', deleteDoc(p(amy(), '/items/iTeam')));

// 보정 요청 (RQ-14)
await seed();
await deny('자기 보정 요청을 스스로 확인할 수 없다', updateDoc(p(amy(), '/corrections/corr1'), { status: 'applied', confirmedBy: 'mA' }));
await deny('확인자를 다른 사람으로 남길 수 없다', updateDoc(p(ben(), '/corrections/corr1'), { status: 'applied', confirmedBy: 'mO' }));
await allow('다른 팀원이 자기 이름으로 확인', updateDoc(p(ben(), '/corrections/corr1'), { status: 'applied', confirmedBy: 'mB' }));
await allow('확인자가 빠진 기여를 요청자 이름으로 추가', setDoc(p(ben(), '/items/fromCorr'), record('fromCorr', 'mA', 'uAmy', 'team', { correctionId: 'corr1' })));
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
await deny('회의 시작자를 바꿀 수 없다', updateDoc(p(ben(), '/calls/c1'), { startedBy: 'uBen' }));
await deny('시작자·팀장이 아니면 회의 기록을 지울 수 없다', deleteDoc(p(ben(), '/calls/c2')));
await allow('시작자는 회의 녹취를 지운다', deleteDoc(p(amy(), '/calls/c1/lines/l1')));
await allow('시작자는 남은 연결 정보도 지운다', getDocs(collection(amy(), `teams/${T}/calls/c1/signals`)));
await allow('시작자는 회의를 지운다', deleteDoc(p(amy(), '/calls/c2')));
await allow('팀장은 회의를 지운다', deleteDoc(p(owner(), '/calls/c1')));

// ---------- 방 관리 ----------
await seed();
await deny('팀원은 초대 코드를 바꿀 수 없다', updateDoc(p(amy(), '/secrets/student'), { code: 'new-code-1234567890' }));
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
{
  const o = as('uNew');
  const b = writeBatch(o);
  const tp = 'teams/N';
  b.set(doc(o, tp), { teamName: '새 방', course: '', ownerUid: 'uNew', members: [{ id: 'm1', name: '나', uid: 'uNew' }], decisionDismissed: [], links: {}, createdAt: 1 });
  b.set(doc(o, `${tp}/secrets/student`), { code: 'aaaaaaaaaaaaaaaaaa' });
  b.set(doc(o, `${tp}/secrets/prof`), { code: 'bbbbbbbbbbbbbbbbbb' });
  b.set(doc(o, `${tp}/members/uNew`), { uid: 'uNew', role: 'student', memberId: 'm1', code: '', joinedAt: 1 });
  b.set(doc(o, `${tp}/claims/m1`), { uid: 'uNew', at: 1 });
  await allow('방 만들기 (팀·코드·역할·claim을 한 번에)', b.commit());
  await deny('남을 팀장으로 방을 만들 수 없다', setDoc(doc(o, 'teams/N2'), { teamName: 'x', ownerUid: 'uOther' }));
  await deny('삭제 표시가 된 방을 만들 수 없다', setDoc(doc(o, 'teams/N3'), { teamName: 'x', ownerUid: 'uNew', deleting: true }));
  // 큰 워크스페이스 올리기: 한 묶음 400건도 규칙 평가 한도 안에 들어야 한다
  const big = writeBatch(o);
  for (let i = 0; i < 200; i++) {
    big.set(doc(o, `${tp}/items/b${i}`), record(`b${i}`, 'm1', 'uNew', 'team'));
    big.set(doc(o, `${tp}/itemMeta/b${i}`), { memberId: 'm1', ownerUid: 'uNew', type: 'memo', createdAt: 1, visibility: 'team', purpose: null, correctionId: null, imported: null });
  }
  await allow('한 묶음 400건 올리기', big.commit());
}

// ---------- 접근 기록 ----------
await seed();
await allow('거절된 접근 기록 남기기', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/a2'), { uid: 'uStranger', email: 's@x.com', what: 'join', at: 1 }));
await deny('접근 기록의 이메일을 속일 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/a3'), { uid: 'uStranger', email: 'prof@x.com', what: 'join', at: 1 }));
await deny('접근 기록에 다른 칸을 넣을 수 없다', setDoc(p(as('uStranger', 's@x.com'), '/accessLogs/a4'), { uid: 'uStranger', email: 's@x.com', what: 'x', at: 1, blob: 'y' }));
await deny('팀원은 접근 기록을 못 읽는다', getDocs(collection(amy(), `teams/${T}/accessLogs`)));
await allow('팀장은 접근 기록을 읽는다', getDocs(collection(owner(), `teams/${T}/accessLogs`)));

await quiet(() => env.cleanup());
console.log(`\n규칙 시험: ${pass}개 통과, ${fail}개 실패`);
process.exit(fail ? 1 : 0);
