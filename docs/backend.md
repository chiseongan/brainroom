# BrainRoom 백엔드 운영 문서

독자: 이 저장소를 배포하거나 고치는 개발자. 사용법은 [user-guide.md](user-guide.md)를 보세요.

## 구성

서버를 직접 운영하지 않습니다. 브라우저가 Firestore에 바로 읽고 쓰고, 권한은 `firestore.rules`가 강제합니다. 브라우저에 둘 수 없는 비밀 값이 필요한 일만 프록시가 맡습니다.

| 부분 | 역할 | 없으면 |
|---|---|---|
| GitHub Pages | 정적 앱 (`index.html`, `js/`, `css/`) | 앱을 못 엶 |
| Firebase Auth | Google 로그인 | 이 브라우저에만 저장되는 데모 모드 |
| Firestore + `firestore.rules` | 방 데이터 저장, 권한 강제 | 위와 같음 |
| Cloudflare Worker (`worker/`) | AI 요약, Figma 그림 인식, OAuth 교환·갱신, TURN 자격 | 규칙 기반 요약, 토큰 붙여넣기 연결, 직접 연결 회의만 |
| Chrome 확장 (`extension/`) | AI 대화·검색 기록을 열린 앱 탭으로 전달 | 대화 파일 올리기·붙여넣기 |

## 권한 모델

- **역할** `teams/{t}/members/{uid}`: `student` 또는 `prof`. 비밀 초대 코드가 맞고 만료 전이어야 만들 수 있습니다. 기한은 7일이고(규칙 상한 31일) 서버 시각으로 검사합니다. `expiresAt`이 없는 예전 방의 링크는 다시 발급할 때까지 만료되지 않습니다.
- **팀원 칸** `teams/{t}/claims/{memberId}`: 먼저 만든 계정이 그 칸의 주인입니다. 칸을 고르는 것(`members` 수정)과 claim 만들기는 한 묶음으로 처리되어야 통과합니다. 기록의 작성자 검사는 이 연결을 기준으로 합니다.
- **명단** `teams/{t}/roster/{memberId}`: 칸마다 문서 하나. 팀원은 내 칸만, 팀장은 모두 고칩니다. 예전 방의 `teams.members` 배열은 읽어서 옮기기만 하고 고칠 수 없습니다.
- **팀장** `teams/{t}.ownerUid`: 코드 재발급, 내보내기, 넘기기, 방 삭제를 합니다. 넘기기 전에는 나갈 수 없습니다.
- **방 삭제**: 팀장이 `deleting: true`를 표시해야 남의 기록과 변경 이력을 지울 수 있습니다. 중간에 끊기면 방 관리에서 이어 하거나 취소합니다.

규칙이 막지 못하는 것:

- 교수자가 볼 수 있는 항목은 규칙으로 막지만, 교수자 화면의 집계는 앱이 계산합니다.
- 회의 녹취 한 줄의 `name`, `memberId`는 쓴 사람이 정합니다. Meet 녹취 가져오기에 필요하기 때문입니다.

## 서버 없이 하는 정리 작업

Cloud Functions를 쓰지 않으므로, 방을 열어 둔 사람의 브라우저가 대신 합니다.

| 작업 | 시점 | 코드 |
|---|---|---|
| 아무도 없는 회의 끝내기·요약 | 2분마다, 방을 연 팀원 누구나 | `sweepCalls` (`js/meeting.js`) |
| 요약이 빠진 회의 다시 요약 | 위와 같음 | `writeCallSummary` |
| 예전 방의 claim 채우기 | 방을 열 때 | `ensureMyClaim` (`js/cloud.js`) |
| 지워진 방을 내 목록에서 빼기 | 방 열기 실패 시 | `pruneTeamIfGone` |
| 연동 토큰 갱신 | 가져오기 직전, 또는 401 응답 시 | `refreshOAuth` (`js/integrations.js`) |

아무도 방을 열지 않으면 이 작업들은 다음에 누군가 열 때까지 미뤄집니다.

보안 설계와 배포 전 체크리스트는 [security.md](security.md)에 있습니다.

## 동의와 개인정보

`users/{uid}.consent`에 동의 판·시각·만 14세 이상 여부를 저장합니다. 규칙은 방 만들기와 참여 때 이를 확인합니다. 만 14세 미만은 `guardianRequests/{비밀 토큰}`을 만들고, 다른 계정이 그 링크에서 승인해야 합니다. 약관·방침을 크게 바꾸면 `js/legal.js`의 `CONSENT_VERSION`을 올리세요. 다음 접속 때 다시 동의를 받습니다.

운영자 정보는 `js/legal-config.js`, 문서는 `legal/`에 있습니다. 수집 항목을 바꾸면 `legal/privacy.html`과 동의 화면 요약을 함께 고치세요. 명단(`roster`)과 역할 문서, 접근 기록에는 이메일·사진을 저장하지 않으며 규칙이 막습니다.

## 비용과 한도

- **Firestore 무료 요금제**: 하루 읽기 5만, 쓰기 2만 회를 **프로젝트 전체가 함께** 씁니다. 수업 전체가 쓰면 빠듯할 수 있어, 접속 표시는 화면을 볼 때만 2분마다 갱신합니다.
- **프록시 AI 비용**: 사용자별 하루 요청 수(`DAILY_REQUESTS_PER_USER`, 기본 60), 하루 예산(`DAILY_BUDGET_KRW`, 기본 5천 원), 월 예산(`MONTHLY_BUDGET_KRW`, 기본 5만 원)을 넘으면 429를 돌려주고 앱은 규칙 기반으로 돌아갑니다. 거절·잘림 응답도 토큰을 쓰므로 함께 셉니다.
- **KV를 연결해야 상한이 정확합니다.** KV가 없으면 Worker 인스턴스 메모리에만 기록되어, 인스턴스가 바뀌면 숫자가 초기화됩니다. KV를 써도 동시 요청에서는 조금 넘을 수 있습니다.
- Firebase 프로젝트에는 어떤 Google 계정이든 로그인할 수 있으므로, 프록시는 로그인 여부까지만 확인합니다. 방 소속은 확인하지 않습니다. 하루 예산이 이 위험의 상한입니다.

## 배포

순서가 중요합니다. **새 앱 코드는 새 규칙이 있어야 팀원 선택과 방 만들기가 되고, 옛 앱은 새 규칙에서 같은 동작이 거절됩니다.** 둘 사이 간격을 짧게 잡으세요.

```bash
# 1. 규칙 게시 (콘솔의 규칙 탭에 붙여넣어도 됩니다)
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules

# 2. 바로 이어서 앱 배포
git checkout main && git merge backend-dev && git push
```

이미 있는 방은 그대로 씁니다. 각 팀원이 방을 열면 자기 칸의 claim이 채워지며, 채워지기 전까지는 그 칸이 다른 계정에 선점될 수 있습니다.

**프록시 (선택)**

```bash
cd worker && npm install
npx wrangler login
npx wrangler kv namespace create USAGE      # 나온 id를 wrangler.toml에 넣기
npx wrangler secret put ANTHROPIC_API_KEY   # 쓰는 비밀 값만 (목록은 wrangler.toml)
# 로컬에서 시험하려면 worker/.dev.vars 에 ALLOWED_ORIGINS="http://localhost:5173"
npx wrangler deploy                         # 나온 주소를 js/ai-config.js의 PROXY_URL에
```

OAuth를 쓰려면 각 서비스의 앱 설정에 돌아올 주소(`https://chiseongan.github.io/brainroom/`)를 등록하고, `wrangler.toml`에 공개 client id를 넣습니다. Figma 승인 코드는 30초 뒤 만료되므로, 승인 후 돌아왔을 때 로그인이 풀려 있으면 다시 연결해야 합니다.

**Chrome 확장**: 앱과 별개로 zip으로 전달합니다. `extension/manifest.json`의 버전을 올리고 `python tools/build_extension_zip.py`로 만드세요. 개발용 localhost 권한은 빠집니다.

**주간 요약**은 저장하지 않고 보는 사람의 브라우저에서 계산합니다 (`weeklySummary`, `js/trace.js`). 규칙과 쓰기 횟수에 영향이 없고, 교수자는 걸러진 데이터로 계산하므로 권한이 그대로 지켜집니다. 규칙 기반이며 AI를 쓰지 않습니다.

## 시험

GitHub에 올리면 `.github/workflows/test.yml`이 전체를 돌립니다.

```bash
cd tests && npm install
npm run unit        # 앱 로직 (네트워크 없음)
npm run proxy       # Worker 코드 + 실제 Anthropic SDK, 바깥 서비스는 가짜
npm run rules       # 에뮬레이터에서 실제 규칙 (Java 21 이상)
npm run e2e         # 실제 앱 + 실제 SDK + 실제 규칙 + 실제 WebRTC (Chrome, Java)
npm run extension   # 실제 Chrome에 확장을 올려 가짜 AI·검색 페이지로
npm run all         # 전부
```

`worker/`에서도 먼저 `npm install`이 필요합니다. `CHROME_PATH`로 Chrome 위치를 바꿀 수 있습니다.

확인하지 못한 것: 실제 Claude 응답 품질, 실제 Figma·Notion·Drive 연결, 실제 ChatGPT·Claude·Gemini 화면 구조, 한국어 받아쓰기 정확도. 시험에서는 모두 가짜로 대신합니다.

결정 추출 품질(`tests/data/decision-sentences.json`)은 직접 쓴 문장으로 잰 값이고, 틀린 문장에 맞춰 패턴을 고쳤으므로 실제 성능을 보여 주지 않습니다. SSRD LS-7의 측정은 실제 회의 녹취로 따로 해야 합니다.
