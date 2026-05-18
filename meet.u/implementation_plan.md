# meet.u AI 매칭 모듈 — 구현 계획서

> **문서 목적**: SRS/PRD 픽스 후 코드 작성을 위한 청사진. Day-by-day 일정 + 분업 + 마일스톤 + 검증.
> **대상**: AI 팀 (제이·정희재)
> **참조**: `ai_module_prd_srs.md`, `ai_module_v1_sprint.md`, `position_skill_weights.md`
> **작성일**: 2026-05-13
> **구현 시작**: 2026-05-19 (화)
> **데모일**: 2026-05-29 (금)

---

## 1. 전제 조건 (구현 시작 전 완료되어야 할 것)

| 항목 | 완료 시점 |
|------|----------|
| 옵션 A 확정 반영 | ✅ 5/13 수 완료 |
| 4가지 충돌 결정 (OQ-07~11) | 5/14 목 미팅 |
| 양쪽 doc 통일 + 외부 요청서 갱신 + 팀 검토 + **명세 동결** | **5/15 금 18:00** |
| 주말 buffer + 5/18 월 최종 확인 | 5/16~5/18 |
| **구현 시작** | **5/19 화 09:00** |

> **5/15 금 = 명세 동결 (spec freeze)**: 양쪽 doc·요청서 모두 동결.
> **5/18 월 = 최종 확인 (final review)**: 코드 시작 전 마지막 sanity check. 변경 발생 시 5/18 안에만 반영.
> **5/19 화 = 코드 시작**: 이 시점부터 명세 변경 금지 (예외: 구현 중 발견된 명세 결함은 1줄 노트만 허용, 전면 재작성 금지).

---

## 2. 디렉토리 구조 (5/19 Day 1 확정)

```
meet-u-ai/
├── ai_module/
│   ├── __init__.py
│   ├── main.py                    # FastAPI 진입점
│   ├── settings.py                # 환경변수 로드
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── health.py              # GET /ai/health
│   │   ├── ifn.py                 # POST /ai/ifn/compute
│   │   └── match.py               # POST /ai/match/recommend
│   ├── schemas.py                 # Pydantic 요청·응답 모델
│   ├── models.py                  # 도메인 dataclass
│   ├── clients/
│   │   ├── __init__.py
│   │   ├── backend_client.py      # httpx + retry + mock
│   │   ├── llm_client.py          # SAIFE X wrapper
│   │   └── mocks/
│   │       ├── sample_skills.json
│   │       ├── sample_candidates.json
│   │       ├── sample_positions.json
│   │       └── sample_cooperation.json
│   ├── algorithm/
│   │   ├── __init__.py
│   │   ├── ifn.py                 # IFN dataclass + default fill
│   │   ├── ifpiwa.py              # ezij 계산 (논문 식)
│   │   ├── cooperation.py         # r_ii' 변환 + γ 계산
│   │   ├── fitness.py             # F = Σ ez · x · γ
│   │   ├── decode.py              # 트리 → 팀 매핑
│   │   ├── gp.py                  # DEAP 셋업 + 메인 루프
│   │   ├── qlearning.py           # Q-table + ε-greedy
│   │   └── diversity.py           # Top-3 다양성 패널티
│   ├── config/
│   │   └── position_skill_weights.yaml
│   └── utils/
│       ├── seed.py                # set_seed(random, numpy, DEAP)
│       ├── logging.py             # structlog 설정
│       └── timeout.py             # asyncio.wait_for wrapper
├── tests/
│   ├── unit/
│   │   ├── test_ifn.py
│   │   ├── test_ifpiwa.py
│   │   ├── test_cooperation.py
│   │   ├── test_fitness.py
│   │   ├── test_decode.py
│   │   └── test_diversity.py
│   ├── integration/
│   │   └── test_e2e_mock.py
│   └── fixtures/
│       ├── manual_calc_5x3.json   # 손계산 검증용
│       └── snapshot_seed42.json   # 결정성 회귀
├── docs/                          # 기존 .md (추가 금지)
├── .env.example
├── requirements.txt
├── pyproject.toml
└── README.md
```

---

## 3. 의존성 (`requirements.txt`)

```
# Core
fastapi==0.115.*
uvicorn[standard]==0.34.*
pydantic==2.*

# Algorithm
deap==1.4.*
numpy==1.26.*

# HTTP client
httpx==0.27.*
tenacity==9.*

# LLM
# (SAIFE X SDK 또는 httpx 직접 호출)

# Logging
structlog==24.*

# Config
pyyaml==6.*
python-dotenv==1.*

# Testing
pytest==8.*
pytest-asyncio==0.24.*
```

---

## 4. 2인 분업

### A 트랙 (인프라/IO/통합)
**담당 영역**:
- `main.py`, `routers/*`
- `schemas.py` (Pydantic) — Day 1 공동 작성 후 동결
- `clients/backend_client.py` — httpx + retry + mock
- **`clients/llm_client.py` — SAIFE X httpx wrapper (HTTP 호출·응답 파싱·재시도만)**
- `utils/{seed,logging,timeout}.py`
- `settings.py` — 환경변수
- 백엔드 통합·디버깅

### B 트랙 (알고리즘 코어)
**담당 영역**:
- `models.py` (dataclass) — Day 1 공동 작성 후 동결
- **`algorithm/ifn.py` — IFN 산출 로직 (LLM 응답 → IFN 매핑·고정 매핑 fallback·default fill)**
- `algorithm/ifpiwa.py` — ezij
- `algorithm/cooperation.py` — r_ii' + γ
- `algorithm/fitness.py`
- `algorithm/decode.py` — 디코딩
- `algorithm/gp.py` — DEAP + 메인 루프
- `algorithm/qlearning.py` — Q-table
- `algorithm/diversity.py`
- `config/position_skill_weights.yaml`

> **LLM 책임 분리**: A는 `llm_client.py` (HTTP 호출 wrapper만), B는 `algorithm/ifn.py` (응답을 IFN으로 변환·fallback 결정). 즉 A가 `client.call(prompt) → response_text` 까지, B가 `response_text → IFN(mu, nu)` 변환.

### 공유 모듈 (Day 1 공동 작성 후 동결)
- `schemas.py`
- `models.py`

### 코드 충돌 방지 규칙
1. 같은 파일 동시 수정 금지 → 분 단위 슬랙 락
2. dev 브랜치: `dev/jay`, `dev/heejae`
3. 매일 저녁 21:00 main 머지
4. B 트랙은 A 트랙의 BackendClient 기다리지 않고 mock으로 진행

---

## 5. 10일 일정표 (5/19 ~ 5/28 + 버퍼)

### Week 1 — 핵심 구현 압축 (5/19 ~ 5/22, 4일)

| Day | 날짜 | A 트랙 | B 트랙 | 종료 기준 |
|-----|------|--------|--------|----------|
| **D1** | 5/19 화 | FastAPI 골격 + 라우터 스텁 + Pydantic 스키마 + `clients/mocks/` JSON 5개 | 도메인 모델 + YAML 로더 + 단위 테스트 (IFN·models) | `uvicorn main:app` 동작 / pytest 그린 |
| **D2** | 5/20 수 | BackendClient (httpx+Mock+retry) + 로깅 + 시드 유틸 + **LLM client (SAIFE X httpx wrapper)** | IFN + Default fill + **IFN 산출 로직 (고정 매핑 fallback 포함)** | 7개 backend mock 호출 OK / IFN 단위 테스트 통과 |
| **D3** | 5/21 목 | `/match/recommend` 라우터 + 후보 필터 + asyncio timeout | IFPIWA + r_ii' + γ (pair factor) + DEAP terminal/function set 등록 | ezij 손계산 일치 (오차 < 1e-6) / γ 범위 [0.80, 1.10] |
| **D4** | 5/22 금 | 다양성 패널티 + match_result 변환 + E2E mock 통과 | Fitness + GP 디코딩 + 표준 GP 50세대 메인 루프 (Q-learning 없이) | **M1 달성**: 표준 GP baseline + mock E2E 통과 |

### 주말 5/23~5/24 — 휴식

### Week 2 — Q-learning 통합 + 백엔드 통합 + 데모 (5/25 ~ 5/29)

| Day | 날짜 | 작업 | 종료 기준 |
|-----|------|------|----------|
| **D5** | 5/25 월 | **오전 (필수)**: Q-learning + ε-greedy 통합 → RL-GP 100세대 mock E2E / **오후 (선택)**: 백엔드 실통합 smoke test | **M2 필수**: Q-learning mock E2E 통과. **선택**: 백엔드 1회 호출 성공 (실패 시 D6 이연 허용) |
| **D6** | 5/26 화 | A: 새로고침·health·로그 점검 + 30명 풀 성능 측정 / B: 손계산 검증 + seed42 snapshot + 엣지 케이스 | p50 ≤ 15s, p95 ≤ 30s / snapshot test 통과 / 422·504 분기 동작 |
| **D7** | 5/27 수 | (둘 다) 디버깅 + README + 핸드오프 자료 정리 | **M3: 핸드오프 완료** (체크리스트 100%) |
| **D8** | 5/28 목 | 데모 발표 자료 + 시연 리허설 | 시연 영상 또는 발표 슬라이드 |
| **D9** | 5/29 금 | **데모일** + 마지막 버퍼 (피드백 반영·버그 픽스) | 시연 |

---

## 6. 마일스톤

### M1 (D4, 5/22 금) — 알고리즘 Baseline + 전체 API 동작
**목표**: 표준 GP (Q-learning 없이) 50세대 + mock 백엔드 E2E 통과

- pytest 통과율 100% (IFN, IFPIWA, r_ii', γ, 디코딩 각 5개 이상)
- 시드 42로 3회 연속 실행 → 동일 top3
- 후보 5/포지션 3 ezij 손계산 ±1e-6 일치
- 후보 10/포지션 3에서 50세대 GP 30s 내
- OpenAPI 스키마가 PRD/SRS 3.3.A와 100% 일치
- 후보 15/포지션 5에서 200 응답
- `request_id`, `duration_ms` 로그 포함

### M2 (D5, 5/25 월) — RL-GP 100세대 통합 + 백엔드 smoke test
**목표**: Q-learning 포함 RL-GP 100세대 mock E2E (필수) + 백엔드 실통합 smoke test (선택)

**필수 기준 (Q-learning mock E2E)**:
- Q-table 학습 후 0이 아닌 값
- **RL-GP 100세대 60s 내 완료** (M1 50세대에서 100세대로 복귀)
- 결정성 유지 (시드 42 → 동일 top3)
- mock 모드 E2E 200 응답
- 422 / 504 / 500 분기 검증

**선택 기준 (백엔드 실통합)**:
- `USE_MOCK_BACKEND=false` 로 1회 호출 성공 (smoke test)
- 백엔드 측이 7개 엔드포인트를 5/25까지 준비 못 한 경우 D6로 이연 가능

**Fallback (100세대 60s 초과 시)**:
- (a) population 100 → 50으로 축소
- (b) generation 100 → 75로 축소
- (c) 응답 metadata에 `actual_generations`, `actual_population` 기록
- **목표는 60s 내 정상 완료.** 성능 조정 후에도 60s 초과 시 504 timeout으로 처리하며, 데모 기준에서는 timeout 없는 정상 응답을 목표로 한다 (안전장치 발화는 허용되나 정상 흐름으로 간주하지 않음).

### M3 (D7, 5/27 수) — 백엔드 통합 + 핸드오프
**목표**: 실백엔드 통합 + 시연 준비
- `USE_MOCK_BACKEND=false`로 30명 풀 200 응답
- p50 ≤ 15s, p95 ≤ 30s (10회 측정)
- 새로고침 시 다른 top3 출력
- 핸드오프 체크리스트 100%
- README + 발표 자료 작성

---

## 7. 알고리즘 핵심 식 (구현 참조)

### 7.1 IFN Default Fill (FR-AI-01)
```
미클릭 스킬 → (μ=0, ν=0.7, π=0.3)
클릭 스킬   → LLM 산출 (또는 옵션 a: 고정 매핑)
```

### 7.2 IFPIWA (4.3.2)
```
d(α, α')   = ½ (|μ - μ'| + |ν - ν'|)
sup(α, α') = 1 - d(α, α')
T(αᵢⱼₗ)    = Σ wⱼₗ' · sup(αᵢⱼₗ', αᵢⱼₗ)
ρᵢⱼₗ       = wⱼₗ(1 + T) / Σ wⱼₗ(1 + T)
ezᵢⱼ       = IFPIWA(αᵢⱼ₁, ..., αᵢⱼₗ)
```

### 7.3 r_ii' 변환 (4.4)
```
양쪽 +2 (합=4)        → r = 1
한쪽 -1 (이상)         → r = -1
이력 없음 / 그 외       → r = 0
```

### 7.4 γ 계산 (4.1) — v1 MVP pair factor 방식 (2026-05-14 OQ-11 결정)
```
pair_factor(i, j):
  r_ii' = +1  →  1.05
  r_ii' =  0  →  1.00
  r_ii' = -1  →  0.90

γ = clamp(mean(pair_factor over team pairs), 0.80, 1.10)
단일 사용자 팀 / 계산 가능 쌍 없음 → γ = 1.00
```
> 논문식 `½(3+Σr·x·x/[Σn(s)]²)` (범위 [1,2])는 v2 검토 항목.

### 7.5 Fitness (4.1)
```
F = Σᵢ Σⱼ ezᵢⱼ · xᵢⱼ · γ
```

### 7.6 Q-learning (4.6)
```
상태: improved / no_improve
행동: P1 / P2 / P3 / P4
보상: Rₜ = f*ₜ - f*ₜ₋₁
업데이트: Q(S,A) ← Q(S,A) + α[R + γ_rl·max Q(S',a) - Q(S,A)]
α = 0.01, γ_rl = 0.9
ε 스케줄: 0.3 → 0.05 선형 감쇠
```

### 7.7 다양성 패널티 (FR-AI-04)
```
1위 ← all_teams 중 최고 fitness
2위 후보 ← 1위와 ⌈N/2⌉명 이상 겹치면 fitness × 0.5
2위 ← 패널티 후 최고
3위 ← 1·2위 모두와 비교 후 동일 절차
```

---

## 8. 환경변수 (`.env.example`)

```
# Backend integration
BACKEND_BASE_URL=https://capstone-pi-gray.vercel.app
INTERNAL_TOKEN=<공유 토큰>
USE_MOCK_BACKEND=true              # 개발 단계 mock, 운영은 false

# LLM
SAIFE_X_API_KEY=<API 키>
SAIFE_X_BASE_URL=<엔드포인트>

# IFN
IFN_MODE=fixed                     # fixed | llm_classify | llm_continuous

# Algorithm
GP_GENERATIONS=100
GP_POPULATION=100
GP_SEED=42

# Timeout
AI_TIMEOUT_SECONDS=60                       # AI 모듈 자체 실행 제한 (asyncio.wait_for)
EXPECTED_BACKEND_READ_TIMEOUT_SECONDS=90    # 연동 계약값. AI가 강제하는 게 아니라 백엔드 측 설정 기대값 (NFR-PERF-04)
```

---

## 9. 위험 + 우회

| 위험 | 가능성 | 우회 |
|------|--------|------|
| 백엔드 7개 엔드포인트 미준비 | 높음 | `USE_MOCK_BACKEND=true` 유지 |
| `/candidates` 엔드포인트 미합의 | 높음 | `GET /users/all` + 클라이언트 필터링 대체 |
| DEAP 디코딩 버그 | 중 | D4 종료 전까지 안되면 그리디 fallback |
| SAIFE X 키/연동 실패 | 중 | 옵션 (a) 고정 매핑 사용 |
| 100세대 60s 초과 | 낮~중 | 집단 50 또는 세대 75로 축소 |
| 결정성 안 잡힘 | 낮 | `set_seed()` 유틸 + dict/set 정렬 |
| 코드 충돌 | 낮~중 | 파일 단위 소유권 + dev 브랜치 |
| 명세 변경 충동 | 중 | **5/15 금 명세 동결 + 5/18 월 최종 확인 후 변경 금지** |

---

## 10. 검증 명세

### 단위 테스트 케이스 (각 모듈 5개 이상)
- IFN: 클릭/미클릭/제약 위반/default fill/연산자
- IFPIWA: 논문 worked example, 손계산 5x3
- r_ii': 7가지 입력 조합 (+2/+2, +2/0, 0/0, +2/-1, -1/0, -1/-1, 이력 없음)
- γ: 모두 r=1 → 1.05, 모두 r=0 → 1.00, 모두 r=-1 → 0.90, 혼합 → clamp [0.80, 1.10] 검증
- 디코딩: 후보 5/포지션 3 / 후보 = 포지션 boundary / 후보 < 포지션

### 통합 테스트
- mock backend E2E (후보 15/포지션 5)
- 실 backend E2E (30명 풀)
- 새로고침 시나리오
- 422 / 504 분기

### 결정성 회귀
- 시드 42 snapshot test (top3 JSON 저장 후 매 빌드 비교)

---

## 11. 핸드오프 체크리스트 (D9 마감)

- [ ] `uvicorn main:app --port 8001` 실행 가이드 README 작성
- [ ] `sample_request.json`, `sample_response.json` 5개
- [ ] `.env.example` 동결
- [ ] `requirements.txt` 동결
- [ ] mock 모드 E2E 통과 (후보 10, 포지션 3)
- [ ] 백엔드 실연동 E2E 통과 (1회 이상)
- [ ] AI 모듈 60초 타임아웃 발화 동작 확인 (`asyncio.wait_for(60)`)
- [ ] **백엔드 측 read timeout 90초로 설정 확인** (NFR-PERF-04)
- [ ] 422 응답 동작 확인 (후보 < 포지션)
- [ ] 시드 42 snapshot test 통과
- [ ] 백엔드 7개 엔드포인트 구현 확인 (양측 합의)
- [ ] **γ 계산 수식이 ai_module_prd_srs.md 4.1 기준 일치 확인** (v1: pair factor 평균 + clamp [0.80, 1.10])

---

## 12. 6월 이후 (졸업 보고서 작성)

- 옵션 B (사전 학습 tree) 실험 — 졸업 보고서에 "향후 작업"
- 합성 사전학습 결과 분석
- GitHub API 통합 검토
- 옵션 A/baseline 비교 실험 (교수 확인 후)
