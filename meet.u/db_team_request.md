# DB 팀 요청 사항 — meet.u AI 매칭 + CPU 온도 기능

> **문서 목적**: AI 매칭 모듈과 CPU 온도 기능 구현을 위해 DB 팀이 추가하거나 정의해야 할 테이블 스키마·인덱스·제약을 정리.
> **대상**: 최인표 (DB 담당)
> **작성일**: 2026-05-13
> **작성 근거**: `ai_module_prd_srs.md`, `developer-team-matching-ai-prd-srs.md`, `cpu_temperature_feature.md`, `meet-u_master.md`

---

## 0. 책임 분담

| 책임 | 담당 |
|------|------|
| 테이블 DDL 작성·실행 | DB 팀 (본 문서 참조) |
| 데이터 조회·저장 API | 백엔드 팀 |
| 데이터 계산 (IFN, r_ii', γ 등) | AI 팀 |
| 본 문서의 스키마 검토·승인 | DB 팀 + 백엔드 팀 합의 |

→ **AI 모듈은 DB에 직접 접근하지 않는다.** 모든 데이터는 백엔드 REST API 경유.

---

## 1. 우선순위

| 우선 | 기준 | 적용 테이블 |
|------|------|------------|
| **P0** | AI 매칭 동작 필수 | 1.1~1.5 |
| **P1** | 평가·CPU 온도 흐름 필수 | 2.1~2.4 |
| **P2** | 알림·운영 향상 | 3.1 |

---

## 2. P0 — AI 매칭 동작 필수 테이블

### 2.1 `USER_SKILL` — 사용자 보유 스킬

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| user_id | VARCHAR/ID | NOT NULL, FK → USER | 사용자 |
| skill_id | VARCHAR | NOT NULL | 스킬 정규화 ID (예: `react`, `spring_boot`) |
| source | VARCHAR | NOT NULL | `user_input` / `system_inferred` 등 |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 |

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (user_id, skill_id) | 중복 방지 |
| INDEX (skill_id) | 후보군 필터링 조회 빠르게 |

**참조**: `developer-team-matching-ai-prd-srs.md` 8.1
**조회 패턴**: `GET /user/{userId}/skills` 응답 생성

---

### 2.2 `USER_SKILL_IFN` — IFN 평가 값

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| user_id | VARCHAR | NOT NULL, FK → USER | 사용자 |
| skill_id | VARCHAR | NOT NULL | 스킬 정규화 ID |
| mu | DECIMAL(4,3) | NOT NULL, CHECK 0 ≤ mu ≤ 1 | 숙련도 |
| nu | DECIMAL(4,3) | NOT NULL, CHECK 0 ≤ nu ≤ 1, mu + nu ≤ 1 | 비숙련도 |
| source_version | VARCHAR | NOT NULL | 분석 파이프라인 버전 (예: `ifn-v1.0`) |
| evaluated_at | TIMESTAMP | NOT NULL | 평가 시각 |

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (user_id, skill_id) | 단일 IFN 값만 보존 |
| INDEX (evaluated_at) | 월 1회 cron의 갱신 대상 조회 |

**참조**: `ai_module_prd_srs.md` FR-AI-01, `developer-team-matching-ai-prd-srs.md` 8.1
**주의**:
- `pi`는 저장 안 함 (파생값: `pi = 1 - mu - nu`)
- 미클릭 스킬은 행 자체가 없음 (AI 모듈이 매칭 시점에 default fill 적용)

---

### 2.3 `PROJECT_POSITION` — 모집 포지션·요구 스킬

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| position_id | VARCHAR/ID | PRIMARY KEY | 포지션 식별자 |
| project_id | VARCHAR | NOT NULL, FK → PROJECT | 소속 프로젝트 |
| name | VARCHAR | NOT NULL | 포지션명 (예: 백엔드1, 백엔드2) |
| headcount | INT | NOT NULL, > 0 | 모집 인원 |
| required_skills | JSON / 별도 매핑 테이블 | NOT NULL | 요구 스킬 ID 목록 |

**참조**: `ai_module_prd_srs.md` 3.3.B, `developer-team-matching-ai-prd-srs.md` 8.1
**조회 패턴**: `GET /project/{projectId}/positions`

**대안 — 정규화 시**:
```
PROJECT_POSITION_SKILL
- position_id (FK)
- skill_id
- PRIMARY KEY (position_id, skill_id)
```

---

### 2.4 `COOPERATION_WILLINGNESS` (또는 `USER_RELATIONSHIP`) — 사용자 쌍 협업 의지

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| user_id_a | VARCHAR | NOT NULL, FK → USER | 사용자 A |
| user_id_b | VARCHAR | NOT NULL, FK → USER | 사용자 B (A < B 정렬 권장) |
| r_base | SMALLINT | NOT NULL, CHECK -1 ≤ r_base ≤ 1 | 기본 협업 의지 (-1/0/1) |
| r_final | SMALLINT | NOT NULL, CHECK -1 ≤ r_final ≤ 1 | 최종 (MVP에서 r_base와 동일) |
| positive_negative_sum | INT | NOT NULL | 상호 평가 합산 (디버깅용) |
| updated_at | TIMESTAMP | NOT NULL | 마지막 갱신 시각 |

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (user_id_a, user_id_b) | 쌍 unique (A < B 정렬) |
| INDEX (user_id_a) | 한 사용자의 모든 관계 조회 |

**참조**: `ai_module_prd_srs.md` 4.4, `developer-team-matching-ai-prd-srs.md` 8.1
**조회 패턴**: `GET /cooperation/{userA}/{userB}`
**갱신 트리거**: 백엔드 cron — `COLLABORATION_REVIEW` 변경 후 14일 만료 시점

---

### 2.5 `MATCHING_RUN` + `MATCHING_TEAM_MEMBER` — 추천 결과 저장

#### `MATCHING_RUN` — 매칭 실행 단위

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| matching_run_id | VARCHAR/ID | PRIMARY KEY | 매칭 실행 식별자 |
| project_id | VARCHAR | NOT NULL, FK → PROJECT | 프로젝트 |
| status | VARCHAR | NOT NULL | `queued` / `running` / `succeeded` / `failed` |
| model_version | VARCHAR | NULL | GP 모델 버전 |
| q_table_version | VARCHAR | NULL | Q-table 버전 |
| started_at | TIMESTAMP | NOT NULL | 시작 시각 |
| finished_at | TIMESTAMP | NULL | 종료 시각 |
| error_code | VARCHAR | NULL | 실패 시 코드 |

#### `MATCHING_TEAM_MEMBER` — 팀별 배정 멤버

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| matching_run_id | VARCHAR | NOT NULL, FK | 매칭 실행 |
| team_rank | SMALLINT | NOT NULL, 1~3 | 추천 순위 |
| position_id | VARCHAR | NOT NULL, FK | 배정 포지션 |
| position_slot | SMALLINT | NOT NULL | 동일 포지션 슬롯 (백엔드1·백엔드2 구분) |
| user_id | VARCHAR | NOT NULL, FK | 배정 사용자 |
| status | VARCHAR | NOT NULL | `pending` / `requested` / `accepted` / `rejected` / `expired` |
| _match_score | DECIMAL | NULL | **내부용** 정렬·감사 (사용자 화면 미노출, `_` 접두사) |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 |

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (matching_run_id, team_rank, position_id, position_slot) | 유일성 |
| INDEX (project_id, created_at DESC) | 최근 추천 결과 조회 |

**참조**: `ai_module_prd_srs.md` 3.3.B, `developer-team-matching-ai-prd-srs.md` 8.1

**중요**:
- `_match_score`·`_objective` 같은 `_` 접두사 컬럼은 **백엔드가 프론트엔드 응답 시 제거**
- `status` 흐름: `pending` (AI 추천 직후) → `requested` (지원 요청 발송) → `accepted` / `rejected` / `expired`

---

## 3. P1 — 평가·CPU 온도 흐름

### 3.1 `COLLABORATION_REVIEW` — 협업 의지 평가 입력

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| review_id | VARCHAR/ID | PRIMARY KEY | 평가 ID |
| project_id | VARCHAR | NOT NULL, FK | 프로젝트 |
| reviewer_user_id | VARCHAR | NOT NULL, FK | 평가자 |
| reviewee_user_id | VARCHAR | NOT NULL, FK | 평가 대상 |
| score | SMALLINT | NOT NULL, CHECK score IN (-1, 0, 2) | `+2` 좋아요 / `0` 미평가 / `-1` 싫어요 |
| review_started_at | TIMESTAMP | NOT NULL | 평가 시작 (프로젝트 완료 시점) |
| review_expires_at | TIMESTAMP | NOT NULL | 만료 시각 (started + 14일) |
| submitted_at | TIMESTAMP | NULL | 제출 시각 (NULL = 미응답) |

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (review_id) | 유일성 |
| INDEX (project_id, reviewer_user_id, reviewee_user_id) | 중복 평가 방지 조회 |
| INDEX (review_expires_at) | 만료 cron 조회 빠르게 |

**참조**: `developer-team-matching-ai-prd-srs.md` FR-410~414, 8.1
**갱신 흐름**: 14일 만료 cron → 미응답 평가 0점 처리 → `COOPERATION_WILLINGNESS` 재계산

---

### 3.2 `PEER_REVIEW` — CPU 온도용 후기 태그 (협업 의지와 별개)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| review_id | VARCHAR/ID | PRIMARY KEY | 평가 ID |
| project_id | VARCHAR | NOT NULL, FK | 프로젝트 |
| reviewer_user_id | VARCHAR | NOT NULL, FK | 평가자 |
| reviewee_user_id | VARCHAR | NOT NULL, FK | 평가 대상 |
| cpu_tag | VARCHAR | NOT NULL | 5개 태그 중 1개 |
| submitted_at | TIMESTAMP | NULL | 제출 시각 |

**`cpu_tag` 값** (`cpu_temperature_feature.md` 3절):
- `소통_원활` (긍정, +α)
- `기여도_높음` (긍정, +α)
- `보통` (중립, 0)
- `참여_저조` (부정, -β)
- `소통_어려움` (부정, -β)

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (review_id) | 유일성 |
| INDEX (project_id, reviewer_user_id, reviewee_user_id) | 중복 방지 |

**중요**:
- 본 테이블은 **CPU 온도 점수 계산용**. AI 매칭에 미반영
- `COLLABORATION_REVIEW`와 **별개 테이블**. 같은 평가 화면에서 둘 다 입력받지만 저장은 분리

---

### 3.3 `USER_TRUST` — CPU 온도 점수

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| user_id | VARCHAR | PRIMARY KEY, FK | 사용자 |
| value | INT | NOT NULL, CHECK 30 ≤ value ≤ 99 | CPU 온도 (기본 50) |
| updated_at | TIMESTAMP | NOT NULL | 마지막 갱신 |

**참조**: `cpu_temperature_feature.md` FR-TRUST-01~04
**갱신 트리거**: 14일 만료 cron → `PEER_REVIEW` 합산 → CPU 온도 재계산

---

### 3.4 `PROFILE_ANALYSIS_JOB` — IFN 비동기 작업 추적 (선택)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| job_id | VARCHAR/ID | PRIMARY KEY | 작업 ID |
| user_id | VARCHAR | NOT NULL, FK | 사용자 |
| status | VARCHAR | NOT NULL | `queued` / `running` / `succeeded` / `failed` / `retrying` |
| started_at | TIMESTAMP | NULL | 시작 시각 |
| finished_at | TIMESTAMP | NULL | 종료 시각 |
| error_code | VARCHAR | NULL | 실패 코드 |

**참조**: `developer-team-matching-ai-prd-srs.md` FR-001~007

---

## 4. P2 — 알림·운영 (선택)

### 4.1 `MATCHING_RECOMMENDATION_EXCLUSION` — 새로고침 시 제외 명단

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| project_id | VARCHAR | NOT NULL, FK | 프로젝트 |
| position_id | VARCHAR | NOT NULL, FK | 포지션 |
| user_id | VARCHAR | NOT NULL, FK | 제외된 사용자 |
| excluded_by | VARCHAR | NOT NULL, FK | 모집글 작성자 |
| matching_run_id | VARCHAR | NOT NULL, FK | 발생 매칭 실행 |
| reason_code | VARCHAR | NULL | 사유 (선택) |
| created_at | TIMESTAMP | NOT NULL | 제외 시각 |

| 인덱스 | 목적 |
|-------|------|
| PRIMARY KEY (project_id, position_id, user_id) | 중복 제외 방지 |

**참조**: `developer-team-matching-ai-prd-srs.md` 8.1

---

### 4.2 `RECOMMENDATION_NOTIFICATION` — 알림 발송 기록

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| notification_id | VARCHAR/ID | PRIMARY KEY | 알림 ID |
| project_id | VARCHAR | NOT NULL, FK | 프로젝트 |
| matching_run_id | VARCHAR | NOT NULL, FK | 추천 실행 |
| team_rank | SMALLINT | NULL | 특정 팀 알림 시 |
| sender_user_id | VARCHAR | NOT NULL, FK | 발송자 (모집글 작성자) |
| recipient_user_id | VARCHAR | NOT NULL, FK | 수신자 |
| status | VARCHAR | NOT NULL | `queued` / `sent` / `failed` |
| created_at | TIMESTAMP | NOT NULL | 생성 시각 |
| sent_at | TIMESTAMP | NULL | 발송 완료 시각 |

**참조**: `developer-team-matching-ai-prd-srs.md` 8.1

---

## 5. 기존 `PROJECT` 테이블 연동

기존 `PROJECT` 테이블에 다음 컬럼이 있다고 가정 (없으면 추가 필요):

| 컬럼 | 매핑 |
|------|------|
| status (또는 PJ_PROGRESS) | `진행전` (모집 중) / `진행중` / `진행종료` |
| owner_user_id | 모집글 작성자 |
| deadline | 모집 마감일 |

**참조**: `developer-team-matching-ai-prd-srs.md` 8.1 + `meet-u_master.md`

---

## 6. 데이터 보존 정책

| 테이블 | 보존 기간 |
|--------|----------|
| USER_SKILL, USER_SKILL_IFN | 무기한 (회원 탈퇴 시 cascade 삭제) |
| COOPERATION_WILLINGNESS | 무기한 |
| MATCHING_RUN, MATCHING_TEAM_MEMBER | **무기한** (졸업 프로젝트 30명 규모상 부담 미미) |
| COLLABORATION_REVIEW | 14일 만료 후에도 보존 (감사용) |
| PEER_REVIEW | 동일 |
| USER_TRUST | 무기한 |
| PROFILE_ANALYSIS_JOB | 30일 후 archive 권장 |

**참조 결정**: `ai_module_prd_srs.md` 6.1 가정

---

## 7. 보안·개인정보

| 항목 | 정책 |
|------|------|
| AI 모듈의 DB 직접 접근 | **금지** — 백엔드 API 경유만 |
| 점수 컬럼 (`_match_score`, `_objective`) | DB에 저장 가능. 단 백엔드가 프론트엔드로 전달 시 **제거** |
| IFN 원값 (mu, nu) | DB에 저장. 사용자 화면 미노출 |
| LLM 송신 데이터 | 닉네임·이메일·실명 송신 금지 (백엔드가 마스킹 후 AI로 전달) |

---

## 8. 일정

| 우선 | 테이블 수 | 완료 기한 |
|------|----------|----------|
| P0 (2.1~2.5) | 5개 | **5/18 (일)** — 양쪽 doc 동결 시점 |
| P1 (3.1~3.4) | 4개 | 5/24 (토) — 1주차 구현 중 |
| P2 (4.1~4.2) | 2개 | 5/29 (목) — 데모 전 |

→ DB 팀은 **P0 5개를 5/18 안에 DDL 작성·검토 완료**해야 백엔드가 5/19부터 엔드포인트 구현 가능.

---

## 9. 미결정 항목 (DB·백엔드 공동 협의)

| 항목 | 옵션 |
|------|------|
| 정규화 vs 비정규화 | `PROJECT_POSITION.required_skills`를 JSON 컬럼 / 별도 테이블 |
| user_id 타입 | VARCHAR (UUID·OAuth ID) / BIGINT |
| 인덱스 추가 | 검색 패턴에 따라 추가 권장 |
| 외래키 제약 | CASCADE / SET NULL / RESTRICT 정책 |

→ DB 팀이 Oracle 21c 환경에 맞게 결정.

---

## 10. AI 팀이 사용하지 않는 테이블

AI 모듈은 다음 테이블에 **접근·계산·갱신하지 않음** (참고용으로만 알고 있음):

- `USER_TRUST` — CPU 온도. 백엔드가 계산·갱신
- `PEER_REVIEW` — CPU 온도용 후기. 백엔드가 처리
- `RECOMMENDATION_NOTIFICATION` — 알림. 백엔드 책임

→ AI 모듈은 **추천 결과 산출까지만**. 그 이후 흐름은 백엔드/프론트엔드 책임.

---

## 11. 다음 액션

1. **DB 팀 검토**: 본 문서 검토 후 5/14 회의에서 합의
2. **DDL 작성**: P0 5개 테이블 5/16 (금)까지 1차안 작성
3. **백엔드 팀 공유**: P0 스키마 확정 후 백엔드 API 구현 시작 (5/19~)
4. **테스트 데이터 준비**: 회원 30명 분량 더미 데이터 (5/19~5/23)

질문 있으면 AI 팀(제이·정희재)에게 연락.
