-- BrainRoom(팀트레이스) 데이터 모델 — ERDCloud 가져오기용 MySQL DDL
--
-- 실제 저장소는 Firestore(문서 DB)이고, 이 파일은 그 구조를 테이블로 옮긴 논리 모델입니다.
--   * Firestore 컬렉션            → 테이블
--   * 하위 컬렉션(teams/{t}/...)  → team_id 등 부모 키를 가진 테이블
--   * 문서 안 배열·맵             → 별도 테이블 (team_members, item_votes, decision_sources, user_teams)
--   * 시각은 모두 밀리초 단위 Unix 시간(Date.now())
-- 원본 경로는 각 테이블 COMMENT에 적었습니다. 코드 기준: js/cloud.js, js/store.js, js/trace.js, js/meeting.js

-- users/{uid}
CREATE TABLE users (
  uid           VARCHAR(128) NOT NULL COMMENT 'Firebase Auth 사용자 id',
  PRIMARY KEY (uid)
) COMMENT = '사용자 (users/{uid})';

-- teams/{teamId}
CREATE TABLE teams (
  team_id             VARCHAR(64)  NOT NULL COMMENT '방 id',
  team_name           VARCHAR(30)  NOT NULL COMMENT '방(팀) 이름',
  course              VARCHAR(40)  NULL     COMMENT '수업명',
  owner_uid           VARCHAR(128) NOT NULL COMMENT '방을 만든 사람',
  decision_dismissed  JSON         NULL     COMMENT '무시한 결정 후보 키 목록',
  created_at          BIGINT       NOT NULL COMMENT '만든 시각',
  PRIMARY KEY (team_id),
  FOREIGN KEY (owner_uid) REFERENCES users (uid)
) COMMENT = '방 (teams/{teamId})';

-- users/{uid}.teams 맵
CREATE TABLE user_teams (
  uid           VARCHAR(128) NOT NULL COMMENT '사용자',
  team_id       VARCHAR(64)  NOT NULL COMMENT '참여한 방',
  name          VARCHAR(30)  NULL     COMMENT '방 이름 (목록 표시용)',
  role          VARCHAR(10)  NOT NULL COMMENT 'student | prof',
  PRIMARY KEY (uid, team_id),
  FOREIGN KEY (uid) REFERENCES users (uid),
  FOREIGN KEY (team_id) REFERENCES teams (team_id)
) COMMENT = '내 방 목록 (users/{uid}.teams)';

-- teams/{teamId}.members 배열 (명단)
CREATE TABLE team_members (
  member_id       VARCHAR(32)  NOT NULL COMMENT '팀원 id',
  team_id         VARCHAR(64)  NOT NULL COMMENT '방',
  name            VARCHAR(20)  NOT NULL COMMENT '이름',
  color           VARCHAR(7)   NOT NULL COMMENT '방 색 (#rrggbb)',
  uid             VARCHAR(128) NULL     COMMENT '연결된 로그인 계정 (명단에서 고른 사람)',
  email           VARCHAR(254) NULL     COMMENT '이메일',
  photo           VARCHAR(500) NULL     COMMENT '프로필 사진 URL',
  pinned_idea_id  VARCHAR(32)  NULL     COMMENT '화이트보드에 고정한 아이디어 (items.item_id)',
  PRIMARY KEY (member_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (uid) REFERENCES users (uid)
) COMMENT = '팀원 명단 (teams/{t}.members[])';

-- teams/{teamId}/members/{uid}
CREATE TABLE team_roles (
  team_id     VARCHAR(64)  NOT NULL COMMENT '방',
  uid         VARCHAR(128) NOT NULL COMMENT '사용자',
  role        VARCHAR(10)  NOT NULL COMMENT 'student | prof',
  member_id   VARCHAR(32)  NULL     COMMENT '명단에서 고른 팀원 (교수자는 없음)',
  code        VARCHAR(40)  NULL     COMMENT '참여할 때 쓴 초대 코드',
  joined_at   BIGINT       NOT NULL COMMENT '참여 시각',
  PRIMARY KEY (team_id, uid),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (uid) REFERENCES users (uid),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id)
) COMMENT = '방 역할·권한 (teams/{t}/members/{uid}) — 보안 규칙이 이 표로 권한을 판단';

-- teams/{teamId}/secrets/{kind}
CREATE TABLE team_secrets (
  team_id   VARCHAR(64) NOT NULL COMMENT '방',
  kind      VARCHAR(10) NOT NULL COMMENT 'student = 팀원 초대 | prof = 교수자 초대',
  code      VARCHAR(40) NOT NULL COMMENT '초대 코드',
  PRIMARY KEY (team_id, kind),
  FOREIGN KEY (team_id) REFERENCES teams (team_id)
) COMMENT = '초대 코드 (teams/{t}/secrets/{kind}) — 팀원 코드는 팀원, 교수자 코드는 방장만 읽음';

-- teams/{teamId}/items/{itemId}
CREATE TABLE items (
  item_id         VARCHAR(32)  NOT NULL COMMENT '기록 id',
  team_id         VARCHAR(64)  NOT NULL COMMENT '방',
  member_id       VARCHAR(32)  NOT NULL COMMENT '누구의 기록인지 (팀원)',
  owner_uid       VARCHAR(128) NOT NULL COMMENT '관리하는 계정 (수정·삭제 권한)',
  type            VARCHAR(10)  NOT NULL COMMENT 'link | memo | idea | ai',
  title           VARCHAR(80)  NOT NULL COMMENT '제목 (개인정보 가림 후)',
  content         TEXT         NULL     COMMENT '내용·요약 (개인정보 가림 후)',
  url             VARCHAR(500) NULL     COMMENT '원본 링크',
  visibility      VARCHAR(5)   NOT NULL COMMENT '공유 범위 me(나만) | team | prof(교수자까지)',
  themes          JSON         NULL     COMMENT '자동 분류 주제 id 목록',
  keywords        JSON         NULL     COMMENT '자동 추출 키워드 목록',
  table_x         DOUBLE       NULL     COMMENT '회의 테이블 위 위치 x(%) — 없으면 테이블에 없음',
  table_y         DOUBLE       NULL     COMMENT '회의 테이블 위 위치 y(%)',
  ai_tool         VARCHAR(20)  NULL     COMMENT 'AI 대화: ChatGPT | Claude | Gemini | 기타',
  ai_purpose      VARCHAR(10)  NULL     COMMENT 'AI 대화: research | draft | code | translate | idea | etc',
  ai_transcript   TEXT         NULL     COMMENT 'AI 대화 원문 (최대 6000자, 개인정보 가림)',
  ai_source_id    VARCHAR(200) NULL     COMMENT 'AI 대화 원본 id (중복 방지)',
  correction_id   VARCHAR(32)  NULL     COMMENT '기여 보정으로 추가된 기록이면 그 요청 (corrections.correction_id)',
  imported        BOOLEAN      NULL     COMMENT '방장이 기존 데이터에서 가져온 기록',
  created_at      BIGINT       NOT NULL COMMENT '기록 시각',
  PRIMARY KEY (item_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id),
  FOREIGN KEY (owner_uid) REFERENCES users (uid)
) COMMENT = '기록: 자료·메모·아이디어·AI 대화 (teams/{t}/items/{id}) — 공유 범위대로 읽기 제한';

-- teams/{teamId}/itemMeta/{itemId}
CREATE TABLE item_meta (
  item_id         VARCHAR(32)  NOT NULL COMMENT '기록 (items와 1:1)',
  team_id         VARCHAR(64)  NOT NULL COMMENT '방',
  member_id       VARCHAR(32)  NOT NULL COMMENT '팀원',
  owner_uid       VARCHAR(128) NOT NULL COMMENT '관리 계정',
  type            VARCHAR(10)  NOT NULL COMMENT '기록 종류',
  visibility      VARCHAR(5)   NOT NULL COMMENT '공유 범위',
  purpose         VARCHAR(10)  NULL     COMMENT 'AI 사용 목적',
  correction_id   VARCHAR(32)  NULL     COMMENT '보정 요청',
  imported        BOOLEAN      NULL     COMMENT '가져온 기록',
  created_at      BIGINT       NOT NULL COMMENT '기록 시각',
  PRIMARY KEY (item_id),
  FOREIGN KEY (item_id) REFERENCES items (item_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id)
) COMMENT = '기록 요약 (teams/{t}/itemMeta/{id}) — 내용 없이 횟수·목적만, 교수자 집계용';

-- items.votes 배열
CREATE TABLE item_votes (
  item_id     VARCHAR(32) NOT NULL COMMENT '기록',
  member_id   VARCHAR(32) NOT NULL COMMENT '투표한 팀원',
  PRIMARY KEY (item_id, member_id),
  FOREIGN KEY (item_id) REFERENCES items (item_id),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id)
) COMMENT = '회의 테이블 👍 투표 (items.votes[])';

-- teams/{teamId}/decisions/{id}
CREATE TABLE decisions (
  decision_id     VARCHAR(32)  NOT NULL COMMENT '결정 id',
  team_id         VARCHAR(64)  NOT NULL COMMENT '방',
  text            VARCHAR(300) NOT NULL COMMENT '결정 내용',
  origin          VARCHAR(10)  NOT NULL COMMENT 'auto(자동 후보) | vote(투표) | manual(직접)',
  candidate_key   VARCHAR(80)  NULL     COMMENT '자동 후보에서 확정했으면 그 후보 키',
  created_by      VARCHAR(32)  NULL     COMMENT '기록한 팀원',
  created_at      BIGINT       NOT NULL COMMENT '확정 시각',
  PRIMARY KEY (decision_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (created_by) REFERENCES team_members (member_id)
) COMMENT = '결정 기록 (teams/{t}/decisions/{id}) — 근거가 없으면 확인 필요 목록';

-- decisions.sourceIds 배열
CREATE TABLE decision_sources (
  decision_id   VARCHAR(32) NOT NULL COMMENT '결정',
  item_id       VARCHAR(32) NOT NULL COMMENT '근거 기록',
  PRIMARY KEY (decision_id, item_id),
  FOREIGN KEY (decision_id) REFERENCES decisions (decision_id),
  FOREIGN KEY (item_id) REFERENCES items (item_id)
) COMMENT = '결정의 근거 링크 (decisions.sourceIds[])';

-- teams/{teamId}/quests/{id}
CREATE TABLE quests (
  quest_id    VARCHAR(32) NOT NULL COMMENT '퀘스트 id',
  team_id     VARCHAR(64) NOT NULL COMMENT '방',
  week        BIGINT      NOT NULL COMMENT '주차 (그 주 월요일 0시)',
  title       VARCHAR(60) NOT NULL COMMENT '목표',
  target      VARCHAR(10) NOT NULL COMMENT 'any | link | memo | idea | ai | decision | manual',
  count       INT         NOT NULL COMMENT '목표 개수',
  done        BOOLEAN     NOT NULL COMMENT '직접 체크 완료 (manual일 때)',
  PRIMARY KEY (quest_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id)
) COMMENT = '주차별 퀘스트 (teams/{t}/quests/{id})';

-- teams/{teamId}/corrections/{id}
CREATE TABLE corrections (
  correction_id   VARCHAR(32)  NOT NULL COMMENT '보정 요청 id',
  team_id         VARCHAR(64)  NOT NULL COMMENT '방',
  member_id       VARCHAR(32)  NOT NULL COMMENT '요청한 팀원',
  requester_uid   VARCHAR(128) NOT NULL COMMENT '요청한 계정',
  kind            VARCHAR(10)  NOT NULL COMMENT 'missing(빠진 기여) | reclass(분류 수정)',
  title           VARCHAR(80)  NULL     COMMENT 'missing: 추가할 기록 제목',
  type            VARCHAR(10)  NOT NULL COMMENT 'missing: 추가할 종류 / reclass: 바꿀 종류',
  url             VARCHAR(500) NULL     COMMENT 'missing: 근거 링크',
  item_id         VARCHAR(32)  NULL     COMMENT 'reclass: 고칠 기록',
  note            VARCHAR(300) NULL     COMMENT '설명',
  status          VARCHAR(10)  NOT NULL COMMENT 'pending | applied',
  confirmed_by    VARCHAR(32)  NULL     COMMENT '확인한 다른 팀원',
  created_at      BIGINT       NOT NULL COMMENT '요청 시각',
  PRIMARY KEY (correction_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id),
  FOREIGN KEY (requester_uid) REFERENCES users (uid),
  FOREIGN KEY (item_id) REFERENCES items (item_id),
  FOREIGN KEY (confirmed_by) REFERENCES team_members (member_id)
) COMMENT = '기여 보정 요청 (teams/{t}/corrections/{id}) — 다른 팀원 1명 확인 시 반영';

-- teams/{teamId}/logs/{id}
CREATE TABLE change_logs (
  log_id    VARCHAR(32)  NOT NULL COMMENT '이력 id',
  team_id   VARCHAR(64)  NOT NULL COMMENT '방',
  text      VARCHAR(300) NOT NULL COMMENT '변경 내용 (요청자·확인자 포함)',
  at        BIGINT       NOT NULL COMMENT '시각',
  PRIMARY KEY (log_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id)
) COMMENT = '기여 보정 변경 이력 (teams/{t}/logs/{id}) — 추가만 가능';

-- teams/{teamId}/accessLogs/{id}
CREATE TABLE access_logs (
  log_id    VARCHAR(32)  NOT NULL COMMENT '기록 id',
  team_id   VARCHAR(64)  NOT NULL COMMENT '접근하려던 방',
  uid       VARCHAR(128) NOT NULL COMMENT '시도한 계정',
  email     VARCHAR(254) NULL     COMMENT '시도한 계정 이메일',
  what      VARCHAR(20)  NOT NULL COMMENT 'join | open | prof-view',
  at        BIGINT       NOT NULL COMMENT '시각',
  PRIMARY KEY (log_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (uid) REFERENCES users (uid)
) COMMENT = '권한 없는 접근 시도 (teams/{t}/accessLogs/{id}) — 방장만 읽음';

-- teams/{teamId}/calls/{callId}
CREATE TABLE calls (
  call_id           VARCHAR(32)  NOT NULL COMMENT '회의 id',
  team_id           VARCHAR(64)  NOT NULL COMMENT '방',
  title             VARCHAR(40)  NOT NULL COMMENT '회의 제목',
  status            VARCHAR(5)   NOT NULL COMMENT 'live | ended',
  started_by        VARCHAR(128) NOT NULL COMMENT '시작한 계정',
  started_by_name   VARCHAR(20)  NULL     COMMENT '시작한 사람 이름',
  started_at        BIGINT       NOT NULL COMMENT '시작 시각',
  ended_at          BIGINT       NULL     COMMENT '끝난 시각',
  summary           TEXT         NULL     COMMENT '규칙 기반 요약',
  attendees         JSON         NULL     COMMENT '참석자 이름 목록',
  line_count        INT          NULL     COMMENT '녹취 줄 수',
  PRIMARY KEY (call_id),
  FOREIGN KEY (team_id) REFERENCES teams (team_id),
  FOREIGN KEY (started_by) REFERENCES users (uid)
) COMMENT = '음성·화상 회의 (teams/{t}/calls/{id})';

-- teams/{teamId}/calls/{callId}/peers/{uid}
CREATE TABLE call_peers (
  call_id     VARCHAR(32)  NOT NULL COMMENT '회의',
  uid         VARCHAR(128) NOT NULL COMMENT '참여 계정',
  member_id   VARCHAR(32)  NULL     COMMENT '팀원',
  name        VARCHAR(20)  NOT NULL COMMENT '표시 이름',
  cam         BOOLEAN      NOT NULL COMMENT '카메라 켬',
  joined_at   BIGINT       NOT NULL COMMENT '참여 시각 (재접속 구분)',
  beat        BIGINT       NOT NULL COMMENT '마지막 살아 있음 표시 (20초마다)',
  left_at     BIGINT       NULL     COMMENT '나간 시각',
  PRIMARY KEY (call_id, uid),
  FOREIGN KEY (call_id) REFERENCES calls (call_id),
  FOREIGN KEY (uid) REFERENCES users (uid),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id)
) COMMENT = '회의 참여자 (calls/{c}/peers/{uid})';

-- teams/{teamId}/calls/{callId}/signals/{id}
CREATE TABLE call_signals (
  signal_id   VARCHAR(32)  NOT NULL COMMENT '신호 id',
  call_id     VARCHAR(32)  NOT NULL COMMENT '회의',
  from_uid    VARCHAR(128) NOT NULL COMMENT '보낸 사람',
  to_uid      VARCHAR(128) NOT NULL COMMENT '받는 사람',
  from_at     BIGINT       NOT NULL COMMENT '보낸 사람의 참여 시각',
  to_at       BIGINT       NOT NULL COMMENT '받는 사람의 참여 시각',
  type        VARCHAR(10)  NOT NULL COMMENT 'offer | answer | candidate',
  data        JSON         NOT NULL COMMENT 'SDP 또는 ICE 후보',
  at          BIGINT       NOT NULL COMMENT '시각',
  PRIMARY KEY (signal_id),
  FOREIGN KEY (call_id) REFERENCES calls (call_id),
  FOREIGN KEY (from_uid) REFERENCES users (uid),
  FOREIGN KEY (to_uid) REFERENCES users (uid)
) COMMENT = 'WebRTC 연결 정보 (calls/{c}/signals/{id}) — 받는 사람이 읽고 바로 지움';

-- teams/{teamId}/calls/{callId}/lines/{id}
CREATE TABLE call_lines (
  line_id     VARCHAR(32)  NOT NULL COMMENT '녹취 줄 id',
  call_id     VARCHAR(32)  NOT NULL COMMENT '회의',
  uid         VARCHAR(128) NOT NULL COMMENT '말한 계정 (본인만 기록 가능)',
  member_id   VARCHAR(32)  NULL     COMMENT '팀원',
  name        VARCHAR(20)  NOT NULL COMMENT '표시 이름',
  text        TEXT         NOT NULL COMMENT '받아쓴 발언 (개인정보 가림)',
  at          BIGINT       NOT NULL COMMENT '시각',
  PRIMARY KEY (line_id),
  FOREIGN KEY (call_id) REFERENCES calls (call_id),
  FOREIGN KEY (uid) REFERENCES users (uid),
  FOREIGN KEY (member_id) REFERENCES team_members (member_id)
) COMMENT = '회의 녹취 (calls/{c}/lines/{id})';
