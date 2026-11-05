# BrainRoom 코크핏 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방 메타포를 "콘스텔레이션" 디자인의 정보 중심 코크핏으로 바꾸고, GitHub를 Cloudflare Worker 프록시 경유 실연동으로 end-to-end 동작시킨다.

**Architecture:** 전송 계층(`apiGet`)만 프록시로 바꾸고 수집 로직·`item` 모델은 재사용. 새 UI는 `state`만 읽는 독립 모듈(`js/workspace.js`). Worker에 읽기 전용 GitHub 프록시 엔드포인트 추가. 디자인 토큰을 전역에 깔아 모든 페이지가 콘스텔레이션 테마를 상속.

**Tech Stack:** 바닐라 JS(빌드 없음), Cloudflare Workers(ESM), Firestore/Firebase Auth, Pretendard(jsdelivr CDN). 테스트: `node`(worker/test, tests/unit) + Firestore 에뮬레이터 e2e(headless + axe-core).

**Spec:** `docs/superpowers/specs/2026-11-05-brainroom-cockpit-v1-design.md`

## Global Constraints

- 빌드 과정 없음. 정적 HTML/JS, `index.html`의 `<script>`로 로드(모듈 전역). 새 파일은 스크립트 태그 추가.
- CSP 준수: 새 외부 리소스는 Pretendard(폰트·CSS)만, 출처 `https://cdn.jsdelivr.net`(현 CSP `style-src`/`font-src`에 이미 허용). 프록시 호출 대상 `*.workers.dev`는 현 `connect-src`에 이미 허용 — CSP 변경 불필요. 새 CDN 링크엔 SRI `integrity` 부여.
- 색/치수는 **CSS 변수(토큰)로만**. 새 코드에 하드코딩 hex 금지(토큰 정의부 제외).
- 콘스텔레이션 다크 테마 기본값: `--bg:#0e1030 --surface:#171a44 --surface-2:#1e2250 --ink:#eef1ff --muted:#9aa2d4 --line:#2a2f63 --primary:#8ea2ff --primary-strong:#a9b8ff --primary-deep:#4b5bbf`; 점 `--dot-1:#8ea2ff --dot-2:#c9d4ff --dot-3:#4b5bbf --dot-dim:#2b3270`. `MEMBER_COLORS` 유지.
- 토큰(PAT/OAuth)은 클라이언트에만(sealToken), Firestore·git에 절대 올리지 않음. GitHub 스코프는 읽기 전용.
- 저장 전 `maskPII`, 가시성 규칙 `canSee` 유지. 접근성: axe 무결점, skip-link·aria 유지.
- 카피는 한국어(기술용어는 원문).
- 데모 모드(`guestMode`)는 네트워크로 나가지 않음 — 프록시를 타지 않는다.

## Review Focus

- 프록시 경로가 allowlist 밖이면 403이어야 한다(SSRF/남용). → Task 3
- 프록시에 GET 외 메서드가 오면 405여야 한다. → Task 3
- `PROXY_URL` 미설정 시 `apiGet`는 직접 fetch로 폴백해 GitHub 수집이 깨지지 않아야 한다. → Task 4
- 구버전 워크스페이스(`milestones`/`deliverables` 없음)를 `migrate`가 `[]`로 채워 크래시하지 않아야 한다. → Task 5
- 피드는 `visibility:'me'` 아이템을 소유자에게만 보이고, 제목/본문을 `esc`로 이스케이프해야 한다(저장형 XSS). → Task 6

---

### Task 1: 디자인 시스템 토대 (콘스텔레이션 토큰 + 공통 셸 리스타일)

**Files:**
- Modify: `css/style.css` (상단에 `:root` 토큰 블록 추가/치환; 헤더·내비·버튼·카드·타이포 규칙을 토큰 기반으로)
- Modify: `index.html` (Pretendard CSS 링크 추가 + `<body>`/`:root`에 다크 테마 적용)
- Test: `tests/e2e/run.mjs` (스모크 + axe 케이스 추가)

**Interfaces:**
- Produces: CSS 토큰 `--bg --surface --surface-2 --ink --muted --line --primary --primary-strong --primary-deep --dot-1..3 --dot-dim --radius --font-sans`; 유틸 클래스 `.eyebrow`(대문자·레터스페이싱·muted), `.btn-ghost`(아웃라인+↗). 이후 모든 Task가 이 토큰을 사용.

- [ ] **Step 1: e2e 실패 테스트 추가** — 앱 로드 후 `getComputedStyle(body).backgroundColor`가 딥네이비(`rgb(14,16,48)` 근사)이고, 헤더/본문이 axe 위반 0건.
- [ ] **Step 2: 실패 확인** — Run: `cd tests && npm run e2e` Expected: FAIL(배경색 불일치).
- [ ] **Step 3: 구현** — `css/style.css`에 콘스텔레이션 토큰 `:root` 블록, `body{background:var(--bg);color:var(--ink);font-family:var(--font-sans)}`, 헤더/`#nav`/`.btn`/카드류를 토큰으로 리팩터. `index.html`에 Pretendard link(SRI) + `--font-sans:Pretendard,'Malgun Gothic',sans-serif`. Galmuri는 `.iso`(공간 베타)에서만.
- [ ] **Step 4: 통과 확인** — Run: `cd tests && npm run e2e` Expected: PASS.
- [ ] **Step 5: 커밋** — `git add css/style.css index.html tests/e2e/run.mjs && git commit -m "feat(design): 콘스텔레이션 디자인 토큰·공통 셸"`

---

### Task 2: 시작/로그인 화면 재구성 (콘스텔레이션 히어로 + COLLECT·CONNECT·CREATE)

**Files:**
- Modify: `js/app.js` (시작화면 렌더 함수 — 현 로그인/샘플 진입 화면)
- Modify: `css/style.css` (히어로·점 모티프·섹션 스타일)
- Test: `tests/e2e/run.mjs`

**Interfaces:**
- Consumes: Task 1 토큰.
- Produces: 시작화면 마크업(히어로 헤드라인 "흩어진 생각이 하나의 방향이 되도록", 3단계 COLLECT/CONNECT/CREATE, CTA 버튼, `data-act` 유지). 기존 로그인/샘플 진입 핸들러(`#sampleBtn` 등) 재사용.

- [ ] **Step 1: 실패 테스트** — 미로그인 로드 시 히어로 헤드라인 텍스트와 "샘플 팀으로 체험하기" 버튼이 존재하고, 점 모티프 컨테이너(`.hero-dots`)가 있으며 axe 0건. `prefers-reduced-motion`에서 점 애니메이션이 정지.
- [ ] **Step 2: 실패 확인** — `cd tests && npm run e2e` Expected: FAIL.
- [ ] **Step 3: 구현** — 시작화면 렌더를 콘스텔레이션 히어로로 교체(기존 Google 로그인·샘플 진입 버튼·법적 링크 유지). 점 모티프는 SVG/`<canvas>` + `@media (prefers-reduced-motion)` 정지. 카피는 스펙 §9.5.
- [ ] **Step 4: 통과 확인** — `cd tests && npm run e2e` Expected: PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(design): 콘스텔레이션 시작화면"`

---

### Task 3: Worker — GitHub 프록시 엔드포인트

**Files:**
- Modify: `worker/src/index.js` (라우터에 분기 + `githubProxy()`; `config()`에 `proxy:{github:true}`)
- Modify: `worker/wrangler.toml` (주석: 프록시 활성 조건)
- Test: `worker/test/proxy.test.mjs`

**Interfaces:**
- Produces: `GET /v1/proxy/github/<path>?<query>` → `https://api.github.com/<path>`; 요청 헤더 `X-BR-Token`을 `Authorization: Bearer`로 변환; 응답 status/body 통과. `GET /v1/config` 응답에 `proxy.github:true`. upstream 기준 URL은 env `GITHUB_API_URL`(테스트 주입, 기본 `https://api.github.com`).

- [ ] **Step 1: 실패 테스트** — `proxy.test.mjs`에 추가(기존 `call`/가짜 upstream 패턴): ① 유효 토큰+allowlist 경로(`/v1/proxy/github/repos/o/r/commits`) → 200, upstream이 받은 `authorization`가 `Bearer <X-BR-Token>`. ② 비-allowlist(`/v1/proxy/github/user/keys`) → 403. ③ `POST` → 405. ④ Firebase 토큰 없음 → 401. ⑤ 일일 한도 초과 → 429. ⑥ `/v1/config`에 `proxy.github===true`.
- [ ] **Step 2: 실패 확인** — Run: `node worker/test/proxy.test.mjs` Expected: 신규 케이스 FAIL.
- [ ] **Step 3: 구현** — 라우터에 `pathname.startsWith('/v1/proxy/github/')` 분기 → `githubProxy(req, env, user)`. 메서드 GET 한정(else 405), 경로 allowlist 정규식(`repos/[^/]+/[^/]+/(commits|pulls|issues)`, `repos/[^/]+/[^/]+/pulls/\d+/(reviews|comments)`, `user`, `users/[^/]+`) else 403, `verifyFirebaseUser`·`checkLimits`·`recordUsage`·`cors` 재사용, `fetch(${GITHUB_API_URL}/<path>?<query>, {headers:{Authorization:'Bearer '+req.headers.get('X-BR-Token'), Accept:'application/vnd.github+json', 'User-Agent':'brainroom'}})`. `config()`에 `proxy:{github:true}`. 테스트 env에 `GITHUB_API_URL` 주입.
- [ ] **Step 4: 통과 확인** — Run: `node worker/test/proxy.test.mjs` Expected: 전부 PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(worker): GitHub 콘텐츠 프록시(읽기전용)"`

---

### Task 4: 프런트 전송 계층 — 프록시 라우팅

**Files:**
- Modify: `js/integrations.js` (`apiGet`)
- Modify: `js/ai.js` 또는 호출부(프록시 가용 플래그/토큰 헬퍼 재사용 지점)
- Test: `tests/unit/app.test.cjs`

**Interfaces:**
- Consumes: Task 3 프록시 엔드포인트, `/v1/config`의 `proxy.github`.
- Produces: `apiGet(source,url,token,init)` 동작 — 데모→`sampleFetch`; 실모드+프록시가용(github)→`${PROXY_URL}/v1/proxy/github/<path+query>`로 요청(헤더 `Authorization: Bearer <firebaseIdToken>`, `X-BR-Token: <token>`); 그 외→직접 `fetch`.

- [ ] **Step 1: 실패 테스트** — `app.test.cjs`에 추가(vm ctx의 `fetch`를 URL 기록용으로 교체, `PROXY_URL`/프록시플래그 전역 세팅): ① 프록시 가용 시 `apiGet('github','https://api.github.com/repos/o/r/commits?..')` 호출이 `${PROXY}/v1/proxy/github/repos/o/r/commits?..`로 나가고 `X-BR-Token` 포함. ② `PROXY_URL` 미설정 시 원 URL 그대로 직접 fetch. ③ `guestMode=true`면 네트워크 호출 없이 `sampleFetch` 경유.
- [ ] **Step 2: 실패 확인** — Run: `node tests/unit/app.test.cjs` Expected: 신규 케이스 FAIL.
- [ ] **Step 3: 구현** — `apiGet`에 분기 추가. 프록시 가용 판단은 `PROXY_URL` 설정 + `/v1/config.proxy.github` 캐시. Firebase ID 토큰 취득은 기존 `proxyCall` 토큰 로직 재사용. `syncGithub`/`gh` 등은 불변.
- [ ] **Step 4: 통과 확인** — Run: `node tests/unit/app.test.cjs` Expected: PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(integrations): GitHub 호출 프록시 라우팅(+직접 폴백)"`

---

### Task 5: 데이터 모델 — 마일스톤·산출물 + 마이그레이션 + 샘플 시드

**Files:**
- Modify: `js/store.js` (`migrate`, CRUD 헬퍼, `sampleWorkspace`)
- Test: `tests/unit/app.test.cjs`

**Interfaces:**
- Produces: `state.milestones[]`=`{id,title,phase?,dueAt,status('todo'|'doing'|'done'),kind('phase'|'present'|'custom'),createdAt,createdBy}`, `state.deliverables[]`=`{id,title,docType('SSRD'|'SSAD'|'test'|'present'|'custom'),status('draft'|'review'|'submitted'),ownerId,url,dueAt,milestoneId?,createdAt}`. 헬퍼: `addMilestone(obj)`, `updateMilestone(id,patch)`, `removeMilestone(id)`, `addDeliverable(obj)`, `updateDeliverable(id,patch)`, `removeDeliverable(id)`, `contribution(memberId)`→`{counts:{source:n},byType:{type:n},week:n,last,topKeywords[]}`.

- [ ] **Step 1: 실패 테스트** — ① `migrate({version:1,items:[],members:[]})` 후 `ws.milestones`/`ws.deliverables`가 `[]`. ② `addDeliverable({title:'SSRD',docType:'SSRD',ownerId:me})` 후 목록 길이 1·상태 `'draft'` 기본. ③ `contribution(me)`가 해당 팀원 work 아이템 수를 소스별로 집계. ④ `sampleWorkspace()`가 마일스톤·산출물 예시를 1개 이상 시드.
- [ ] **Step 2: 실패 확인** — Run: `node tests/unit/app.test.cjs` Expected: FAIL.
- [ ] **Step 3: 구현** — `migrate`에 `ws.milestones ??= []; ws.deliverables ??= [];`. CRUD 헬퍼(+`saveState()`). `contribution`은 `itemsOf`/`profile` 패턴 재사용. `sampleWorkspace`에 디자인씽킹 단계 마일스톤 + SSRD/SSAD 산출물 시드. `app.test.cjs`의 `globalThis.T` export에 신규 헬퍼 추가.
- [ ] **Step 4: 통과 확인** — Run: `node tests/unit/app.test.cjs` Expected: PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(store): 마일스톤·산출물 모델 + 기여도 집계 + 샘플 시드"`

---

### Task 6: 코크핏 피드 뷰 (수집 = COLLECT)

**Files:**
- Create: `js/workspace.js`
- Modify: `index.html` (스크립트 태그 추가)
- Modify: `css/style.css` (피드·필터·카드·상세)
- Test: `tests/unit/app.test.cjs`(필터 로직), `tests/e2e/run.mjs`(렌더/흐름)

**Interfaces:**
- Consumes: Task 1 토큰, `state.items`·`canSee`·`crossMemberLinks`·`esc`·기존 `#panel`/`openPanel`.
- Produces: `renderWorkspace()`(메인 피드), `feedFilter(items, {q,source,memberId,type,since})`→필터된 배열(가시성 `canSee` 적용·텍스트/소스/사람/타입/기간 매칭), `feedCardHTML(item)`, 상세는 기존 패널 재사용.

- [ ] **Step 1: 실패 테스트(단위)** — `feedFilter`: ① `q='다회용기'`가 제목/키워드 매칭. ② `source:'github'`가 `work.source==='github'`만. ③ 다른 팀원의 `visibility:'me'` 아이템은 제외(`canSee`). ④ `feedCardHTML`가 `<script>` 제목을 이스케이프(출력에 `&lt;script&gt;`).
- [ ] **Step 2: 실패 확인** — Run: `node tests/unit/app.test.cjs` Expected: FAIL.
- [ ] **Step 3: 구현(로직)** — `js/workspace.js`에 `feedFilter`·`feedCardHTML`(토큰 스타일, 플랫폼 아이콘·사람색·상대시간·원문링크·키워드태그·🔗연결배지). `app.test.cjs` export에 추가.
- [ ] **Step 4: 통과 확인(단위)** — Run: `node tests/unit/app.test.cjs` Expected: PASS.
- [ ] **Step 5: 실패 테스트(e2e)** — 데모 진입 후 `workspace`에서: 피드 카드≥1 렌더, 검색어 입력 시 목록 축소, 소스 필터칩 동작, 카드 클릭 시 상세 패널 열림, axe 0건.
- [ ] **Step 6: 실패 확인** — `cd tests && npm run e2e` Expected: FAIL.
- [ ] **Step 7: 구현(렌더)** — `renderWorkspace()`: 상단 검색+필터칩, 본문 활동 스트림, 클릭→`openPanel`. `index.html`에 `js/workspace.js` 로드.
- [ ] **Step 8: 통과 확인** — `cd tests && npm run e2e` Expected: PASS.
- [ ] **Step 9: 커밋** — `git commit -m "feat(workspace): 코크핏 활동 피드(검색·필터·상세)"`

---

### Task 7: 사이드레일 — 마일스톤/산출물 + 기여도 (CONNECT·CREATE)

**Files:**
- Modify: `js/workspace.js` (레일 렌더 + 상호작용)
- Modify: `js/app.js` (레일 액션 `data-act` 위임 라우팅)
- Modify: `css/style.css`
- Test: `tests/e2e/run.mjs`

**Interfaces:**
- Consumes: Task 5 CRUD·`contribution`, Task 6 `renderWorkspace`.
- Produces: `railHTML()`(마일스톤 D-day·상태, 산출물 상태·담당·링크·빠른추가, 팀원 기여도 미니, 연결 인사이트 상위 N, 연동/프록시 상태). 액션: 마일스톤/산출물 추가·상태변경.

- [ ] **Step 1: 실패 테스트(e2e)** — 데모 진입 후: 레일에 시드된 마일스톤/산출물 표시, "산출물 추가"로 항목 1개 증가, 상태 토글이 반영, 기여도 패널에 팀원별 수치, axe 0건.
- [ ] **Step 2: 실패 확인** — `cd tests && npm run e2e` Expected: FAIL.
- [ ] **Step 3: 구현** — `railHTML()` + `renderWorkspace`에 결합. `app.js` 클릭 위임에 레일 `data-act`(milestone/deliverable add·toggle) 분기 추가(기존 위임 핸들러 패턴).
- [ ] **Step 4: 통과 확인** — `cd tests && npm run e2e` Expected: PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(workspace): 마일스톤·산출물 레일 + 기여도 패널"`

---

### Task 8: 내비게이션 — 코크핏 기본화면 + 방/오피스 → 공간(베타)

**Files:**
- Modify: `js/app.js` (`render()` 라우팅, 기본 뷰, `#nav` 구성, `STUDENT_VIEWS`)
- Modify: `index.html` (`#nav` 버튼)
- Modify: `css/style.css`
- Test: `tests/e2e/run.mjs`

**Interfaces:**
- Consumes: Task 6/7 `renderWorkspace`.
- Produces: 기본 뷰 `workspace`; `#nav`에 `워크스페이스/타임라인/결정/리포트/연동` + `공간(베타)`; `render()`가 `state.view==='workspace'`→`renderWorkspace()`, `space`→기존 `renderMeeting/office/room`(iso). 로그인/신규팀 생성 후 랜딩도 `workspace`.

- [ ] **Step 1: 실패 테스트(e2e)** — 데모 진입 시 기본 화면이 코크핏(피드)이고, 내비에 "공간(베타)"가 있으며 클릭 시 iso 방 씬 렌더, "워크스페이스"로 복귀 가능, axe 0건.
- [ ] **Step 2: 실패 확인** — `cd tests && npm run e2e` Expected: FAIL.
- [ ] **Step 3: 구현** — `render()` 분기·기본 `state.view='workspace'`(newWorkspace/진입부), `#nav` 재구성, `office/room/meeting`을 `space` 그룹으로. 기존 iso 뷰·`hall.js`·`player.js`는 space에서만 로드.
- [ ] **Step 4: 통과 확인** — `cd tests && npm run e2e` Expected: PASS.
- [ ] **Step 5: 전체 테스트** — Run: `cd tests && npm run all` Expected: 전부 PASS.
- [ ] **Step 6: 커밋** — `git commit -m "feat(nav): 코크핏 기본화면 + 공간(베타) 분리"`

---

## Self-Review (작성자 체크)

1. **스펙 커버리지**: §6 프록시→T3, §7 전송→T4, §8 모델→T5, §9 코크핏 UI→T6/T7, §9.5 디자인/랜딩→T1/T2, §내비·데모→T8/각 e2e, §11 보안(가시성·esc·토큰 비노출)→Review Focus+T3/T4/T6. 로드맵(§14)은 v1 비포함(의도적).
2. **스텝 스캔**: 각 스텝은 테스트명+단언 / 시그니처 / 실행·기대만 — 결정 없는 줄·불필요한 본문 없음.
3. **타입 일관성**: `milestones/deliverables` 필드·`feedFilter` 시그니처·`contribution` 반환이 T5↔T6↔T7에서 동일.
4. **Review Focus**: 5개 각각 소유 Task의 테스트로 고정(403/405→T3, 폴백→T4, migrate→T5, me-가시성/XSS→T6).
5. **비례**: 계획이 스펙보다 길지 않음(시그니처·테스트명 위주).
