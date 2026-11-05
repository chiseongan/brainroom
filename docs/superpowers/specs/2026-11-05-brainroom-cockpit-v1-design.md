# BrainRoom v1 설계 — 정보 중심 "프로젝트 코크핏"
### 수직 슬라이스: GitHub 실연동(프록시) + 코크핏 뼈대

- 날짜: 2026-11-05
- 상태: 리뷰 대기 (설계 합의 → 구현 계획 전 단계)
- 범위: v1 수직 슬라이스. 나머지 플랫폼·기능은 §14 로드맵.

---

## 1. 배경과 문제

BrainRoom은 "여러 플랫폼(GitHub·Figma·Notion·Slack·Google Drive·Linear·Calendar·Discord)에 흩어진 팀프로젝트 조각을 한곳에 모으는" 서비스다. 집계 엔진은 이미 상당 부분 존재한다:

- 모든 자료는 `item`으로 정규화된다 — `{memberId, type, title, content, url, createdAt, keywords[], themes[], visibility, work?}` ([js/store.js:108](../../../js/store.js)).
- 플랫폼 수집 결과는 `type:'work'` 아이템이며, `syncGithub/syncFigma/syncNotion` → `upsertWork`가 변환한다 ([js/integrations.js:145](../../../js/integrations.js)).
- 수집 즉시 키워드·테마 추출(`analyze`), 팀원 간 교차 연결(`crossMemberLinks`), 결정 로그·타임라인·리포트까지 데이터로 존재.

**문제는 "표현"과 "연동 신뢰성" 두 가지다.**
1. 이 정보들이 전부 "가상 오피스/방 꾸미기" 메타포로 감싸져 있어 정보가 묻힌다 — GitHub/Slack 같은 "정보가 중심"인 느낌이 안 난다.
2. 실연동이 브라우저 직접 호출(PAT 붙여넣기)에 의존한다. GitHub·Figma는 CORS가 열려 있어 되지만 **Notion·Slack은 브라우저 CORS가 막혀 서버 프록시가 반드시 필요**하고, 비밀키·레이트리밋·예산 관리도 서버가 있어야 안전하다. 현재 Cloudflare Worker는 OAuth 교환·AI요약·TURN만 하고 **콘텐츠 API는 프록시하지 않으며**, `PROXY_URL=''`이라 꺼져 있다 ([js/ai-config.js](../../../js/ai-config.js), [worker/src/index.js](../../../worker/src/index.js)).

## 2. 제품 논제와 수업 정합성

**논제: BrainRoom = 학생·초기 팀의 "프로젝트 코크핏(단일 진실 공급원)".** 단순 활동 피드가 아니라, 흩어진 조각이 **마일스톤·산출물·기여도**에 자동으로 꽂혀 "우리가 어디까지 왔고, 무엇이 연결되고, 무엇이 결정됐는지"를 한 화면에서 보여준다.

대상 수업(소프트웨어공학 캡스톤)의 설계 의도 — 디자인씽킹 5단계(공감→정의→아이디어→프로토타입→테스트), Agile/Scrum, MBASE/WinWin Spiral, 산출물 **SSRD·SSAD·테스트보고서**, 사이클 발표, 팀 **상호평가** — 와 정확히 맞물린다. 핵심은 **마일스톤·산출물(문서)·기여도**이며, 성적이 걸린 결과물은 대부분 문서/발표다.

**왜 무조건 쓰는가:** 팀원이 각 툴을 일일이 열지 않아도, 여기만 보면 (1) 팀 전체 활동이 한 줄로 흐르고, (2) 마감·산출물 진행이 보이고, (3) 누가 얼마나 기여했는지(상호평가·교수자 보기)가 보인다.

## 3. 목표 / 비목표

**목표 (v1)**
- G1. GitHub 실연동을 **Worker 프록시 경유**로 동작시킨다(읽기 전용, 인증·레이트리밋·예산 포함). 프록시 미설정 시 기존 직접 호출로 폴백.
- G2. "가상 방" 대신 **정보 중심 코크핏 UI**를 기본 화면으로 만든다: 활동 피드(검색·필터·상세) + 마일스톤/산출물 레일 + 팀원 기여도.
- G3. 데모 모드(로그인 없이 샘플)를 그대로 유지한다.
- G4. 실배포 "직전"까지 — 코드·테스트·런북 완비. 실제 배포/OAuth 앱 등록은 사용자 몫으로 명확히 문서화.

**비목표 (v1에서 제외, §14 로드맵)**
- Slack·Notion·Figma·Google Drive·Linear·Calendar·Discord 프록시/수집 (GitHub 패턴 복제).
- OAuth "계정으로 연결" 버튼 전면화 (v1은 GitHub만 OAuth+PAT, 나머지 로드맵).
- AI 합성(SSRD 초안 자동 생성·주간 다이제스트 자동화).
- 실시간 회의(TURN). 전사록 임포트는 기존 기능 유지.
- 가상 방/오피스/아바타/걷기 — "공간(베타)" 뷰로 숨김(삭제 아님).

## 4. 범위 (v1 수직 슬라이스)

1. **백엔드**: Worker에 `/v1/proxy/github/*` 추가 (읽기 전용, Firebase 인증·CORS·예산 재사용).
2. **프런트 전송 계층**: `apiGet`가 GitHub 호출을 프록시로 라우팅(설정 시). 수집 로직(`syncGithub`·`upsertWork`)·`item` 모델은 재사용.
3. **코크핏 UI**: 새 기본 뷰 `workspace`(피드) + `기여도` 패널 + `마일스톤/산출물` 레일. 상세 패널. 검색·필터.
4. **데이터 모델**: `milestones[]`·`deliverables[]` 신규(최소), 기여도는 기존 아이템에서 파생(저장 없음).
5. **내비게이션**: `office`·`room`을 "공간(베타)"로 이동. `timeline·decisions·report·integrations`는 유지·정돈.
6. **데모 모드 유지** + **테스트** + **런북**.

## 5. 아키텍처 개요

```
[브라우저 프런트(정적, 바닐라 JS)]
  UI 레이어(신규): workspace 피드 / 마일스톤·산출물 / 기여도   ← 신규
  ─────────────────────────────────────────────
  수집 레이어(재사용): syncGithub → upsertWork → state.items  ← 변경 최소
  전송 레이어: apiGet ──(실모드 & PROXY_URL)──▶ Worker 프록시   ← 변경
                      └(데모)▶ sampleFetch  └(폴백)▶ 직접 fetch
                                   │
[Cloudflare Worker] /v1/proxy/github/*  ──▶ api.github.com      ← 신규
  재사용: verifyFirebaseUser · CORS(ALLOWED_ORIGINS) · checkLimits · recordUsage
[Firestore] 팀 아이템 동기화(기존) — 토큰은 올리지 않고 결과 아이템만
```

설계 원칙: **수집 레이어와 표현 레이어를 분리**한다. 전송 계층만 프록시로 바꾸고, 새 UI는 `state.items`(+`work` 메타)와 신규 `milestones/deliverables`만 읽는 독립 모듈로 둔다.

## 6. 백엔드 — GitHub 프록시 엔드포인트

**라우트**: `GET /v1/proxy/github/<path...>?<query>` → `https://api.github.com/<path...>?<query>`

- **메서드**: GET만 허용(읽기 전용). 그 외 405.
- **경로 allowlist**(정규식, 그 외 403): `repos/{owner}/{repo}/commits`, `repos/{owner}/{repo}/pulls`, `repos/{owner}/{repo}/issues`, `repos/{owner}/{repo}/pulls/{n}/{reviews|comments}`, `user`, `users/{login}`. SSRF/남용 방지.
- **인증**: 기존 `verifyFirebaseUser`(Firebase ID 토큰 RS256 검증) 재사용 ([worker/src/index.js:80](../../../worker/src/index.js)). 데모 모드는 프록시를 타지 않으므로 무관.
- **플랫폼 토큰 전달(무상태 패스스루)**: 클라이언트가 자신의 GitHub 토큰(PAT 또는 OAuth 액세스)을 `X-BR-Token` 헤더로 보낸다. Worker는 이를 `Authorization: Bearer`로 바꿔 GitHub에 전달하고 **저장하지 않는다**. (기존 "토큰은 클라이언트에만" 보안 모델 유지. Worker는 중계·CORS 우회·레이트리밋만 담당.)
- **응답**: GitHub 상태코드·바디·관련 헤더(ETag, X-RateLimit-*) 그대로 전달. CORS 헤더는 `ALLOWED_ORIGINS` 기준.
- **레이트리밋/예산**: `checkLimits`/`recordUsage` 재사용(프록시 요청 1건 = 사용량 1). KV 바인딩 없으면 인메모리(부정확) — 런북에 KV 생성 명시.
- **구현 위치**: `worker/src/index.js` 라우터(`:378` 부근)에 분기 추가 + `githubProxy(req, env, ctx, user)` 함수. 공통 헬퍼(`cors`, `json`, `checkLimits`, `recordUsage`) 재사용.

**config 노출**: `GET /v1/config`가 `{ proxy: { github: true } }` 같은 능력 플래그를 포함하도록 확장 → 프런트가 프록시 가용 여부 판단.

## 7. 프런트 — 전송 계층 변경

`apiGet(source, url, token, init)` ([js/integrations.js:79](../../../js/integrations.js)) 수정:

- **데모 모드**: 기존대로 `sampleFetch` (변경 없음).
- **실모드 & 프록시 가용(`github`)**: 원 URL(`https://api.github.com/...`)을 `${PROXY_URL}/v1/proxy/github/<path+query>`로 치환하고, `Authorization: Bearer <firebaseIdToken>` + `X-BR-Token: <github 토큰>` 헤더로 요청.
- **폴백**: `PROXY_URL` 미설정이면 기존 직접 `fetch` (GitHub은 CORS 열려 있어 동작). → 프록시 없이도 깨지지 않음.
- `gh/fg/nt` 래퍼·`syncGithub`·`upsertWork`·`syncAllWork`는 **그대로** 둔다(전송 계층만 바뀌므로).
- Firebase ID 토큰 취득은 기존 `proxyCall` 경로의 토큰 로직 재사용([js/ai.js](../../../js/ai.js)).

## 8. 데이터 모델 변경

기존 `item`·`decisions`·`quests` 유지. 신규 두 컬렉션(워크스페이스 필드, `migrate`에서 기본값 `[]` 추가 — [js/store.js:39](../../../js/store.js) 패턴):

- **`milestones[]`**: `{ id, title, phase?, dueAt, status('todo'|'doing'|'done'), kind('phase'|'present'|'custom'), createdAt, createdBy }`
  - 수업 흐름에 맞춘 기본 템플릿을 "추가" 버튼으로 제안(디자인씽킹 5단계 / Cycle 발표 / SSRD·SSAD·테스트 마감) — 강제 아님, 팀이 자유 편집.
- **`deliverables[]`**: `{ id, title, docType('SSRD'|'SSAD'|'test'|'present'|'custom'), status('draft'|'review'|'submitted'), ownerId, url, dueAt, milestoneId?, createdAt }`
  - `url`은 구글독스 등 원문 링크(수동 입력; Drive 연동은 로드맵에서 자동).
- **기여도(contribution)**: 저장하지 않고 `state.items`에서 파생(`profile()` 유사). 팀원별 집계: 소스(github/…)·타입·주간 건수, 최근 활동, 키워드 Top. 교수자 보기·상호평가 보조.

마이그레이션: `migrate(ws)`에 `ws.milestones ??= []; ws.deliverables ??= [];` 추가. Firestore 동기화는 기존 메커니즘(팀 문서)에 두 배열 포함. 토큰은 여전히 비동기화(로컬/서버만).

## 9. 코크핏 UI

새 모듈 `js/workspace.js`(신규), CSS는 `css/style.css`에 섹션 추가. 라우팅은 기존 `go(view)`/`render()`([js/app.js:44](../../../js/app.js)) 재사용.

**기본 랜딩 = `workspace`**(기존 `meeting` 대체; `meeting`은 테이블 보드로 잔존 가능).

레이아웃(3열, 모바일 1열 스택):
- **좌/중 — 활동 피드**: 상단 **전체 검색창** + **필터칩**(플랫폼·사람·타입·기간). 본문은 시간순 **활동 카드** 스트림. 카드 = 플랫폼 아이콘 + 제목 + 사람(색) + 상대시간 + 원문 링크 + 키워드/테마 태그 + 🔗연결 배지(cross-member). 무한/페이지네이션.
- **우 — 사이드레일**: ① **마일스톤/산출물**(D-day, 상태, 담당, 링크, 빠른 추가) ② **팀원 기여도**(미니 막대/최근활동) ③ 연결 인사이트 상위 N ④ 연동/프록시 상태.
- **상세 패널**: 카드 클릭 → 기존 `#panel`에 본문·맥락·연결된 조각·원문 링크(열림: `openPanel` 패턴 재사용).

검색/필터는 클라이언트 측 `state.items` 필터(타입·소스·memberId·기간·텍스트 매칭; 기존 `visibleItems`/`canSee` 가시성 규칙 준수).

내비게이션: `nav`에서 `workspace`를 첫 탭으로, `타임라인·결정·리포트·연동` 유지, **`회의실(공간) · 전체보기`를 "공간(베타)" 단일 항목으로 묶어 뒤로**. 기존 `hall.js`/`player.js`/room 뷰는 그 베타 뷰에서만 로드.

## 9.5 디자인 시스템 (신규 시작화면 컨셉 채택)

사용자가 만든 새 시작화면 컨셉(에디토리얼·미니멀)을 **앱 전역의 디자인 토대**로 채택한다. 다른 페이지들도 이 언어로 통일한다.

- **팔레트 — "콘스텔레이션"(딥네이비 다크, 기본 테마)**: `--bg:#0e1030`(페이지 딥네이비), `--surface:#171a44`(패널/카드), `--surface-2:#1e2250`(상단 표면), `--ink:#eef1ff`(니어화이트), `--muted:#9aa2d4`(페리윙클 그레이), `--line:#2a2f63`(헤어라인), 액센트 `--primary:#8ea2ff`(빛나는 페리윙클), `--primary-strong:#a9b8ff`, `--primary-deep:#4b5bbf`; 점 `--dot-1:#8ea2ff` `--dot-2:#c9d4ff` `--dot-3:#4b5bbf` `--dot-dim:#2b3270`. 팀원 색(MEMBER_COLORS)은 유지(다크 위에서 잘 보임). **라이트 모드는 토큰 오버라이드로 후속 토글.**
- **타이포**: 본문/UI는 깔끔한 산스(Pretendard, CSP `font-src https://cdn.jsdelivr.net` 허용 범위 내 CDN). 스케일: eyebrow(12px·대문자·+letter-spacing·muted), 디스플레이 h1(heavy, 40–56px, tight), 섹션 라벨(`01 / THE IDEA` 형식), 본문 15–16px. **Galmuri(픽셀)는 "공간(베타)" iso 씬에서만** 유지.
- **컴포넌트**: 아웃라인 미니멀 버튼(↗ 화살표), 얇은 라인 구분, 넉넉한 여백, 숫자 섹션 라벨, 점 클러스터 로고.
- **모티프**: 점 클러스터(로고) + 랜딩 히어로의 "흩어진 점 → 모이는" 모션(SVG/canvas, prefers-reduced-motion 존중).
- **내러티브 축**: **COLLECT(모으고) → CONNECT(연결하고) → CREATE(만들어요)** 를 제품 골격으로 — 코크핏의 피드(=COLLECT), 연결 인사이트(=CONNECT), 마일스톤·결정(=CREATE)에 그대로 매핑.
- **적용 범위(v1)**: ① 디자인 토큰·공통 셸(헤더·내비·버튼·카드·타이포) 전역 리스타일 → 모든 페이지가 토큰 상속. ② **시작/로그인 화면을 컨셉대로 재구성**(히어로 + COLLECT/CONNECT/CREATE + CTA). ③ 코크핏을 이 언어로 신규 구축. "공간(베타)" 등 레거시 뷰는 토큰은 상속하되 세부 재디자인은 로드맵.

## 10. 데모 모드 보존

- `sampleapi.js`가 GitHub·Figma·Notion 형식 가상 데이터를 제공 → 코크핏 피드/기여도에 그대로 표시.
- 샘플 워크스페이스에 **마일스톤·산출물 예시**(디자인씽킹 단계, SSRD/SSAD 마감 등)를 시드해 코크핏 가치를 즉시 보여줌([js/store.js:194](../../../js/store.js) `sampleWorkspace` 확장).
- 프록시는 데모에서 타지 않음(기존 `guestMode` 분기 유지).

## 11. 보안 / 프라이버시

- 토큰(PAT/OAuth)은 **클라이언트에만**(sealToken, IndexedDB AES-GCM — [js/secure.js](../../../js/secure.js)) 저장, Firestore 비동기화. 프록시는 무상태 패스스루.
- 프록시는 **읽기 전용 경로 allowlist** + GET 한정으로 SSRF/남용 차단.
- 기존 `maskPII`로 저장 전 개인정보 형태 문자열 마스킹 유지([js/trace.js](../../../js/trace.js)).
- 가시성(나만/팀/교수자) 규칙(`canSee`) 피드·검색에 그대로 적용.
- Worker CORS `ALLOWED_ORIGINS`·Firebase 인증·예산 상한 유지.

## 12. 테스트 전략

- **Worker**: `worker/test`에 `githubProxy` 단위 테스트 — allowlist 통과/차단, GET 외 405, 토큰 헤더 변환, 인증 실패 401, 예산 초과 429. 외부는 기존처럼 페이크.
- **프런트 수집**: `apiGet` 라우팅 분기 테스트(데모→sampleFetch, 실+프록시→프록시 URL, 폴백→직접). `tests/` 기존 하네스 패턴 사용.
- **UI(E2E)**: 데모 진입 → 코크핏 피드 렌더 → 검색/필터 → 마일스톤 추가 → 상세 패널. 기존 `tests/` E2E 방식.
- 회귀: `migrate`가 구버전 워크스페이스에 `milestones/deliverables` 채우는지.

## 13. 배포 런북 (사용자 몫 — "실배포 직전"의 경계)

내가 코드·테스트·문서를 완비한다. **실제 배포·등록은 당신 계정**이 필요하다:
1. `cd worker && npm install && npx wrangler login`
2. `npx wrangler kv namespace create USAGE` → 반환 id를 `wrangler.toml`에 기입(정확한 예산 집계).
3. 비밀값 주입: `npx wrangler secret put ANTHROPIC_API_KEY`(선택, AI용) 등. (v1 GitHub 프록시 자체는 플랫폼 비밀키 불필요 — 토큰 패스스루.)
4. `npx wrangler deploy` → 배포 URL을 `js/ai-config.js`의 `PROXY_URL`에 기입.
5. (OAuth로 갈 때만) GitHub OAuth 앱 등록 → `GITHUB_CLIENT_ID`(wrangler.toml 공개) + `GITHUB_CLIENT_SECRET`(secret), 리다이렉트 URI 등록.
6. 팀원은 각자 GitHub **읽기 전용 PAT** 발급·연결(또는 OAuth). 팀장이 대상 저장소 지정.
7. (선택) Firebase/Firestore·호스팅은 기존 README 절차. **토큰·키는 저장소에 커밋하지 않음.**

## 14. 리스크 / 열린 질문 / 로드맵

**리스크**
- Notion/Slack CORS는 v1 범위 밖이지만 로드맵의 전제(프록시 필수) — GitHub 프록시를 **플랫폼 일반화 가능한 형태**로 설계해 복제 비용을 낮춘다.
- 프록시 토큰 패스스루는 Worker가 전송 중 토큰을 본다(TLS·무저장). 더 강한 모델(서버 보관 OAuth)은 Slack 단계에서 도입.
- 기본 랜딩 교체는 기존 사용자 흐름 변화 — 데모·회귀 테스트로 방어.

**로드맵(슬라이스 검증 후, 소스별 "프록시 엔드포인트 + sync 함수 + 피드 카드 타입" 3조각 추가)**
1. **Google Drive/Docs**(성적 문서 — 우선) → 산출물 자동 링크/상태.
2. **Slack**(OAuth 워크스페이스 설치, 프록시 필수) → 결정·스레드.
3. **Notion**(프록시 필수) → 기획/문서.
4. **Figma** → 프로토타입.
5. **Linear/Jira** → 태스크, **Google Calendar** → 마감, **Discord** → 메시지.
6. **AI 합성**: 모은 리서치 → SSRD 초안/주간 다이제스트(Worker `/v1/summarize` 재사용).
7. 가상 "공간(베타)" 복귀·고도화(원하면).

---

## 설계 자기검토 (내부)
- 플레이스홀더/TBD 없음.
- 일관성: 전송 계층만 변경 + 수집/모델 재사용이라는 원칙이 §5–§8 전반에서 유지됨.
- 범위: v1은 단일 구현 계획으로 가능한 크기(프록시 1종 + UI 뼈대 + 모델 2개). 나머지는 로드맵으로 분리.
- 모호성 해소: 토큰은 "클라이언트 보관 + 프록시 무상태 패스스루"로 단일화. 기본 랜딩은 `workspace`로 명시.
