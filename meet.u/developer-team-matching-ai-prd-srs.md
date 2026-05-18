# 개발자 팀 매칭 웹 서비스 추천 파트 PRD/SRS

문서 버전: v0.1  
작성일: 2026-05-11  
범위: 졸업 프로젝트 수준의 개발자 팀 매칭 웹 서비스 추천 파트(AI) 기능 명세  
기반 논문: *A Reinforcement Learning-assisted Genetic Programming Algorithm for Team Formation Problem Considering Person-Job Matching*

---

## 0. 문서 권위 범위 및 버전 정의

### 0.1 문서 권위 범위

본 문서는 추천 파트의 제품 요구사항, 사용자 시나리오, 화면 흐름, 데이터 엔터티, 서비스 정책을 권위로 한다. AI 모듈 API 계약, RL-GP 알고리즘 구현 세부사항, IFPIWA 수식, Q-learning 파라미터, timeout 실행 정책의 구현 기준은 `ai_module_prd_srs.md`를 권위 문서로 따른다.

### 0.2 동기화 규칙

다음 항목이 변경되면 변경한 사람이 양쪽 문서에 같은 결정 내용을 반영하고 팀 채널에 공유한다.

- API 계약, 데이터 스키마, 알고리즘 파라미터
- `position_match_score`, `communication_efficiency_gamma`, timeout, GitHub 통합 범위
- Open Questions 결정 상태와 결정 완료 로그

두 문서에 표현 차이가 있는 경우, 제품/UX/데이터 엔터티는 본 문서를 우선하고 AI 구현 세부사항은 `ai_module_prd_srs.md`를 우선한다.

### 0.3 MVP 버전 정의

| 버전 | 정의 | 범위 |
|---|---|---|
| MVP v1 | 2026-05 데모와 초기 구현 대상 | 사용자 입력 스킬과 사전 계산 또는 mock IFN 기반 추천, IFPIWA 기반 사용자-포지션 적합도, RL-GP per-request 실행, `communication_efficiency_gamma` pair factor 평균 및 `[0.80, 1.10]` clamp, 추천 결과 Top 3 |
| v2 | MVP v1 이후 검토 또는 졸업 보고서 향후 작업 | GitHub API 수집, repository 분석, GitHub 기반 IFN 갱신, 월 1회 재수집, 저장된 GP tree 방식, 논문식 `γ ∈ [1,2]` 또는 다른 gamma 가중 방식 비교 실험 |

본 문서에서 별도 언급 없이 "MVP"라고 쓰는 경우 MVP v1을 의미한다.

---

## 1. 문서 목적

본 문서는 개발자 팀 매칭 웹 서비스의 추천 파트(AI)에 대한 제품 요구사항(PRD), 소프트웨어 요구사항(SRS), 화면 설계서를 하나의 문서로 정의한다.

추천 파트는 MVP v1에서 사용자의 보유 스킬과 사전 계산 또는 mock IFN 데이터를 기반으로 스킬별 직관주의 퍼지 수(Intuitionistic Fuzzy Number, IFN) 형태의 역량 값을 준비하고, 모집글의 포지션 요구사항에 맞는 후보자를 필터링한 뒤 RL-GP 기반 매칭 알고리즘으로 최종 팀 조합 추천 결과를 산출한다. GitHub API 통합은 MVP v1 범위에서 제외하고 v2 이후 검토한다.

본 문서는 코드 구현이 아니라 기능 명세, 데이터 흐름, 요구사항, 화면 설계 수준까지만 다룬다.

---

## 2. 배경 및 문제 정의

### 2.1 문제 배경

개발자 팀 매칭 서비스에서는 모집글 작성자가 프로젝트에 필요한 포지션과 요구 스킬을 입력하면, 시스템이 적합한 개발자를 추천해야 한다. 단순 키워드 매칭은 다음 한계가 있다.

- 사용자의 실제 역량을 정량화하기 어렵다.
- 동일 스킬 보유자 사이의 숙련도 차이를 반영하기 어렵다.
- 포지션별 요구 스킬의 중요도 차이를 반영하기 어렵다.
- 여러 포지션을 동시에 고려할 때 팀 전체 조합의 적합도를 평가하기 어렵다.

이를 해결하기 위해 논문의 Team Formation Problem Considering Person-Job Matching(TFP-PJM) 접근을 웹 서비스 도메인에 맞게 적용한다.

### 2.2 논문 기반 핵심 개념

논문은 팀 구성 문제를 사람-직무 매칭 문제로 보고, 후보자의 역량을 IFN으로 표현한 뒤, 0-1 정수계획 모델과 RL-GP 알고리즘을 사용해 효율적인 팀 구성안을 찾는다.

서비스 적용 시 핵심 개념은 다음과 같이 변환한다.

| 논문 개념 | 서비스 적용 |
|---|---|
| candidate | 서비스 사용자 |
| job position | 프로젝트 포지션 |
| person-job matching | 사용자-포지션 적합도 |
| capability dimension | 스킬 |
| IFN `<mu, nu>` | 스킬별 확신도 기반 역량 표현 |
| personnel relationship matrix `R` | 사용자 간 협업 의지/의사소통 행렬 |
| communication efficiency `γ` | 팀 구성 후보의 협업 효율 |
| team formation plan | 포지션별 모집 인원을 만족하는 최종 팀 조합 |
| GP rule/tree | 후보 선택 휴리스틱 |
| RL-assisted search mode selection | 매칭 탐색 전략 선택 또는 사전 학습된 추천 tree 선택 |

### 2.3 논문과 실제 시스템의 차이

| 항목 | 논문 | 실제 시스템 |
|---|---|---|
| 역량 평가 방법 | 전문가가 IFN 직접 입력 | MVP v1은 사용자 입력 스킬과 사전 계산 또는 mock IFN 사용. GitHub API 기반 자동 평가는 v2 이후 검토 |
| IFN 계산 시점 | 팀 구성 요청 시 | 백그라운드에서 사전 계산 후 DB 저장 |
| 역량 차원 | 포지션별 임의 차원 | 스킬 자체가 역량 차원 |
| 협업 의지 | 후보자 간 의사소통 행렬 입력 | 프로젝트 종료 후 상호 평가로 계산 |
| 추천 결과 | 최적 팀 구성안 | 팀 조합 추천 |
| 사용 맥락 | 기업 내 인력 배치 | 개발자 프로젝트 팀원 모집 |

---

## 3. 제품 범위

### 3.1 In Scope

- 프로필 등록/수정 이후 추천용 사용자 역량 분석 작업 생성
- 사용자 입력 스킬 기반 후보군 필터링
- 스킬별 IFN `<mu, nu>` 사전 계산 또는 mock 데이터 사용 및 `user_skill_ifn` 저장
- 프로필 저장/수정 시 사용자 입력 스킬 기준 IFN 갱신 또는 mock IFN 재생성
- 모집글 포지션 요구사항 기반 후보군 필터링
- RL-GP 기반 매칭 실행
- 팀 조합 추천 결과 산출
- 추천 결과의 포지션별 배정 후보와 주요 스킬 요약 표시
- 프로젝트 종료 후 사용자 간 협업 의지 평가 수집
- 협업 의지 기반 의사소통 행렬 계산
- 모집글 작성자의 명시적 액션에 따른 추천 후보 알림 발송
- 추천 실행 상태 및 오류 상태 표시
- CPU온도 등 외부 사용자 지표 조회

### 3.2 Out of Scope

- 일반 회원가입/로그인 기능
- 전체 프로필 CRUD 화면 구현
- 모집글 작성 전체 기능 구현
- 채팅, 지원, 합류 승인 기능
- 결제, 신고 기능
- 실제 코드 구현 및 API 구현
- 운영자용 LLM 프롬프트 관리 UI
- 수상 이력을 추천 점수에 반영하거나 신뢰도 검증하는 기능
- GitHub API 기반 사용자 활동 데이터 수집, repository 분석, 월 1회 재수집

---

## 4. 사용자 및 이해관계자

### 4.1 주요 사용자

| 사용자 | 설명 | 추천 파트에서의 목적 |
|---|---|---|
| 모집글 작성자 | 프로젝트 팀원을 찾는 사용자 | 프로젝트 요구사항에 맞는 팀 조합을 빠르게 확인 |
| 후보 개발자 | 팀에 합류할 수 있는 사용자 | 본인의 스킬과 활동이 추천에 반영됨 |
| 서비스 운영자 | 추천 품질과 시스템 상태를 관리 | 추천 실패, 품질 이슈, 비용을 모니터링 |

### 4.2 주요 사용자 목표

- 모집글 작성자는 포지션별 모집 인원을 만족하는 팀 조합 Top 3를 얻는다.
- 후보 개발자는 프로필과 보유 스킬이 갱신되면 추천 가능성이 최신 상태로 반영되어야 한다. GitHub 활동 반영은 v2 이후 검토한다.
- 운영자는 추천 실행 상태, 실패 원인, 품질 지표를 확인할 수 있어야 한다.

---

## 5. 제품 요구사항(PRD)

### 5.1 제품 목표

| ID | 목표 | 성공 기준 |
|---|---|---|
| G-01 | 팀 조합 추천 | 포지션별 `headcount`를 만족하는 팀 조합 Top 3 제공 |
| G-02 | 역량 평가 입력 준비 | 사용자 입력 스킬과 사전 계산 또는 mock 데이터 기반 스킬별 IFN 준비 |
| G-03 | 추천 결과 제공 | 팀 조합 순위와 포지션별 배정 후보 표시 |
| G-04 | 최신성 유지 | 사용자 프로필 저장/수정 시 사용자 입력 스킬과 IFN 데이터를 반영 |
| G-05 | 모집글 작성자 의사결정 지원 | 추천 결과에서 후보 비교가 가능해야 함 |

### 5.2 핵심 사용자 시나리오

#### 시나리오 1: 프로필 등록/수정 후 AI 역량 분석

1. 사용자가 닉네임, 보유 스킬, 수상 이력을 등록 또는 수정한다. GitHub URL은 MVP v1 추천 분석 입력으로 사용하지 않는다.
2. 서비스는 기본 사용자 정보와 `user_skill`을 저장한다.
3. 추천 시스템은 백그라운드 분석 작업을 생성한다.
4. MVP v1에서는 GitHub API를 호출하지 않는다.
5. 추천 시스템은 사용자 입력 스킬과 사전 계산 또는 mock 데이터를 기반으로 스킬별 IFN `<mu, nu>`를 준비한다. 자기소개와 수상 이력은 IFN 계산과 추천 점수 계산에 사용하지 않는다.
6. 결과를 `user_skill_ifn`에 저장한다.
7. GitHub API 기반 수집, repository 분석, 월 1회 재수집은 v2 이후 검토한다.

#### 시나리오 2: 모집글 작성 후 후보군 필터링

1. 모집글 작성자가 프로젝트명, 지역, 마감일을 입력한다.
2. 모집글은 기존 DB 기준 `PJ_PROGRESS = 진행전` 상태로 저장된다.
3. 작성자는 포지션명, 모집 인원, 요구 스킬을 기술 스택 버튼 선택 방식으로 입력한다.
4. 추천 시스템은 각 포지션의 `required_skills` 중 하나 이상을 `user_skill`로 보유한 사용자를 후보군으로 필터링한다.
5. 후보군이 없는 포지션은 추천 불가 상태와 사유를 반환한다.

#### 시나리오 3: 매칭 실행 및 추천 결과 확인

1. 모집글 작성자가 추천 실행을 요청한다.
2. 추천 시스템은 포지션별 후보군, 스킬 IFN, 시스템 자동 스킬 가중치, 모집 인원, 협업 의지 행렬 정보를 로드한다.
3. RL-GP 기반 매칭을 실행한다.
4. 포지션별 모집 인원을 만족하는 팀 조합 Top 3를 산출한다.
5. 모집글 작성자는 팀 조합 순위, 포지션별 배정 후보, 주요 스킬 요약을 확인한다. 내부 점수는 정렬과 운영 검증에 사용하되 사용자 화면에는 표시하지 않는다.

### 5.3 MVP 기능

| ID | 기능 | 우선순위 |
|---|---|---|
| P-01 | 프로필 변경 시 추천 분석 작업 생성 | Must |
| P-02 | 사용자 입력 스킬 기반 IFN 준비 또는 mock IFN 사용 | Must |
| P-03 | GitHub API 없이 스킬별 IFN 계산 또는 조회 | Must |
| P-04 | `user_skill_ifn` 저장 및 갱신 | Must |
| P-05 | 요구 스킬 기반 후보군 필터링 | Must |
| P-06 | 팀 조합 추천 결과 제공 | Must |
| P-07 | 추천 결과의 주요 스킬 요약 표시 | Must |
| P-08 | 추천 실행 상태 표시 | Should |
| P-09 | 추천 결과 재실행 | Should |
| P-10 | 운영자용 추천 품질 로그 조회 | Could |

---

## 6. 추천 알고리즘 제품 정책

### 6.1 후보군 필터링 정책

기본 후보군 조건은 다음과 같다.

- 포지션의 `required_skills`는 1개 이상이어야 한다.
- 포지션의 `required_skills` 중 1개 이상이 사용자의 `user_skill`에 존재해야 한다.
- 탈퇴, 정지, 비공개, 추천 제외 상태 사용자는 제외한다.
- 모집글 작성자는 본인 모집글의 후보에서 제외한다.
- 동일 프로젝트 내 이미 확정된 멤버가 있다면 중복 추천에서 제외한다.
- GitHub 연동 여부는 MVP v1 후보 필터링에 사용하지 않는다.
- 프로젝트 지역 조건은 후보 필터링이나 매칭 점수 보정에 사용하지 않는다. 지역은 모집글 작성자가 참고할 수 있는 정보로만 표시한다.

후보군 필터링은 빠른 조회를 위해 `user_skill` 기반으로 수행한다. `user_skill_ifn`은 필터링 이후 정밀 점수 계산에 사용한다.

### 6.2 IFN 계산 정책

각 사용자 `u`와 스킬 `s`에 대해 IFN을 다음 형태로 저장한다.

```text
IFN(u, s) = <mu, nu>
```

- `mu`: 사용자가 해당 스킬을 실제로 보유하고 있다고 판단되는 정도
- `nu`: 사용자가 해당 스킬을 충분히 보유하지 않았다고 판단되는 정도
- `pi = 1 - mu - nu`: 불확실성 또는 정보 부족 정도
- 제약: `0 <= mu <= 1`, `0 <= nu <= 1`, `0 <= mu + nu <= 1`

LLM은 스킬별 IFN을 반환해야 한다. 분석 성공 시 저장 대상은 스킬별 IFN, 분석 버전, 분석 시각이며, IFN 산출 근거 원문이나 근거 payload는 저장하지 않는다.

수상 이력은 다른 사용자가 프로필에서 참고할 수 있는 표시 정보로만 다루며, IFN 계산과 추천 점수에는 사용하지 않는다.

### 6.3 포지션 매칭 점수 정책

포지션 `p`의 요구 스킬 집합을 `S_p`, 시스템 자동 스킬 가중치를 `w_s`라고 할 때 사용자 `u`의 포지션 적합도는 다음 요소를 포함해야 한다.

- 요구 스킬별 `mu`
- 요구 스킬별 `nu`
- 시스템 자동 스킬 가중치
- 정보 부족 패널티
- 후보의 IFN 데이터 최신성
- 자기 신고 스킬과 분석 결과의 일치도

`position_match_score(u, p)`는 required skill별 IFN과 `position_skill_weights.md`의 raw weight를 입력으로 하여 IFPIWA 기반으로 계산한다. 정확한 수식과 구현 기준은 `ai_module_prd_srs.md` 4.3.2를 권위로 따른다.

본 문서에서는 제품 관점에서 다음 원칙만 유지한다.

- required skill별 `mu`, `nu`, `pi`를 반영한다.
- raw weight는 `position_skill_weights.md` 기준을 사용한다.
- raw weight는 사전 정규화하지 않고 IFPIWA 내부에서 정규화한다.
- IFN이 없는 required skill은 `<mu = 0, nu = 0.7, pi = 0.3>`을 사용한다.

졸업 프로젝트 범위에서는 모집글 작성자가 스킬별 가중치를 직접 입력하지 않는다. 시스템은 `position_skill_weights.md`를 기준 가중치 정책 문서로 사용하며, 포지션별 핵심 스킬 사전을 기준으로 required skill의 raw weight를 자동 부여한다. 포지션별 사전에 없는 `(position_id, skill_id)` 조합은 기본 raw weight `1.0`을 적용한다.

raw weight는 설정 파일에 그대로 저장하며, 사전 정규화하지 않는다. IFPIWA 계산 내부에서 다음 수식으로 자동 정규화한다.

```text
rho_s = w_s(1 + T_s) / sum(w_k(1 + T_k))
```

`T_s`는 IFPIWA의 지지도(Support) 합산 값이며, 다른 스킬들이 현재 스킬 `s`와 얼마나 일관된 평가를 갖는지 측정한다. 즉 `T_s`가 클수록 해당 스킬의 평가가 다른 스킬 평가들과 더 일관적이라는 의미다.

예를 들어 Backend Developer 포지션에서 `Spring`, `MySQL`, `Docker`가 선택되고 raw weight가 각각 `1.5`, `1.2`, `1.0`이라면, 이 값은 그대로 IFPIWA에 입력된다. 최종 정규화 가중치 `rho_s`는 IFPIWA 내부에서 `T_s`와 함께 계산한다.

MVP에서 사용할 포지션별 raw weight 예시는 다음과 같다.

| 포지션 | raw weight `1.5` | raw weight `1.2` | raw weight `1.0` |
|---|---|---|---|
| Backend Developer | Java, Spring, Node.js, Django, FastAPI | MySQL, PostgreSQL, Redis | Docker, AWS, 기타 선택 스킬 |
| Frontend Developer | React, Vue, Next.js, TypeScript | HTML, CSS, JavaScript | Figma, UX, 기타 선택 스킬 |
| AI/ML Engineer | Python, PyTorch, TensorFlow | Pandas, NumPy, scikit-learn | FastAPI, MLOps, Docker, 기타 선택 스킬 |

후보가 포지션의 일부 required skill만 보유하고 있고, 나머지 required skill에 대한 `user_skill_ifn`이 없는 경우 해당 스킬은 점수 계산에서 제외하지 않는다. MVP에서는 IFN이 없는 required skill의 기본값을 `<mu = 0, nu = 0.7, pi = 0.3>`으로 두고 점수를 계산한다.

CPU온도는 당근온도에서 아이디어를 얻은 매너온도 시스템이다. 프로젝트 참여 태도, 응답 매너, 협업 피드백 등 서비스 내 행동 데이터로 별도 관리한다. CPU온도는 사용자 프로필 등에서 참고용 지표로만 표시하며, MVP 추천 결과 화면에는 표시하지 않는다. 또한 협업 의지 행렬, communication efficiency `γ`, 최종 추천 점수 계산에는 사용하지 않는다.
추천 AI 파트는 CPU온도를 계산하거나 갱신하지 않고, 사용자 서비스가 관리하는 외부 지표를 필요한 경우 조회만 한다.

#### 협업 의지 및 의사소통 행렬 정책

논문은 후보자 간 의사소통 의지를 `R` 행렬로 표현하고, `r = 1`, `0`, `-1` 값을 사용해 팀의 communication efficiency `γ`를 계산한다. 서비스에서는 이를 사용자 간 협업 의지 행렬로 적용한다.

두 사용자 `u_i`, `u_j` 사이의 협업 의지 `r_value(i, j)`는 다음 정책으로 계산한다.

`r_ii'`는 논문 표기이고, `r_value`는 구현 및 본 문서에서 사용하는 변수명이다. 두 표기는 같은 사용자 쌍별 협업 의지 값(`-1`, `0`, `1`)을 의미한다.

- 두 사용자가 처음 협업하는 경우 `r_value = 0`으로 둔다.
- 프로젝트 종료 후 팀원은 함께한 사용자에 대해 협업 의지를 평가할 수 있다.
- 평가 값은 `다음에도 같이 하고 싶어요 = +2`, `다음에는 같이 하고 싶지 않아요 = -1`로 저장한다.
- 평가 시작 시각으로부터 지정된 평가 유효 시간이 지나면 미응답 평가는 `0`점으로 처리한다.
- 두 사용자가 서로에게 남긴 평가 점수의 합이 `4`이면 `r_value = 1`로 둔다.
- 두 사용자가 서로에게 남긴 평가 점수의 합이 `2` 또는 `0`이면 `r_value = 0`으로 둔다.
- 두 사용자가 서로에게 남긴 평가 점수의 합이 `1`, `-1`, `-2`이면 `r_value = -1`로 둔다.

```text
communication_matrix_entry(i, j)
= r_value(i, j)
```

매칭 알고리즘은 포지션별 사용자-포지션 적합도와 추천 팀 조합 내 사용자 간 `r_value`를 집계한 communication efficiency `γ`를 함께 고려해야 한다. 최종 추천 점수는 논문 구조에 맞춰 팀 조합 단위로 계산한다.

`r_value = 0`은 협업 이력이 없거나 중립인 상태를 의미하며, 최종 점수를 0으로 만드는 값으로 사용하지 않는다. MVP에서는 사용자 쌍별 협업 보정계수를 다음과 같이 변환한다.

| `r_value` | 의미 | pair factor |
|---|---|---|
| `1` | 긍정 협업 이력 | `1.05` |
| `0` | 이력 없음 또는 중립 | `1.00` |
| `-1` | 부정 협업 이력 | `0.90` |

팀 단위 `communication_efficiency_gamma(team)`는 팀 내부 사용자 쌍의 pair factor 평균으로 계산한다. 단일 사용자 팀이거나 계산 가능한 사용자 쌍이 없으면 `γ = 1.00`으로 둔다. MVP에서는 `γ`를 `0.80 <= γ <= 1.10` 범위로 clamp한다.

```text
team_position_match_score(team)
= aggregate(position_match_score(u_i, p_i))

final_team_score(team)
= team_position_match_score(team) * communication_efficiency_gamma(team)
```

`γ`는 개별 사용자 단위가 아니라 팀 조합이 확정된 뒤 팀 내부 사용자 쌍의 의사소통 행렬 값으로 계산한다.

### 6.4 RL-GP 적용 정책

논문은 GP가 후보 선택 휴리스틱 tree를 진화시키고, RL agent가 각 generation 이전에 population search mode를 선택하는 방식을 제안한다. 2026-05-14 OQ-07 결정에 따라 MVP v1에서는 추천 요청 시마다 RL-GP를 실행하는 per-request 옵션 A를 채택한다. 옵션 B와 baseline 비교 실험은 v2 또는 졸업 보고서 항목으로 보류한다.

#### 옵션 A: 추천 실행 시마다 RL-GP 실행

모집글 작성자가 추천을 요청할 때마다 해당 프로젝트와 후보군을 입력으로 RL-GP를 실행한다.

장점:

- 프로젝트별 요구사항에 맞게 탐색 가능
- 최신 후보군과 최신 IFN을 즉시 반영
- 논문 구조에 더 가깝다

단점:

- 응답 시간이 길어질 수 있다
- 동시 요청이 많을 때 비용과 부하가 크다
- UX상 비동기 처리와 대기 화면이 필요하다

MVP의 옵션 A 실행 기준은 다음과 같다.

- 매칭 요청 API는 `matching_run_id`와 `queued` 또는 `running` 상태를 즉시 반환한다.
- 일반 후보군 규모에서는 추천 실행 완료 목표 시간을 60초 이내로 둔다.
- AI 모듈은 60초 이내 정상 완료를 목표로 하며, 백엔드 HTTP read timeout은 90초로 둔다.
- AI 모듈 실행 시간이 60초를 초과하면 `matching_timeout`으로 중단한다.
- timeout 또는 RL-GP 실행 실패 시 옵션 B 방식 또는 단순 점수 기반 baseline으로 fallback하지 않는다.
- 실패한 매칭 작업은 추천 실패 상태로 기록하고, 실패 사유와 재실행 가능 여부를 표시한다.

#### 옵션 B: 백그라운드에서 최적 tree를 학습하고 추천 시 해당 tree 사용(v2 검토)

백그라운드 작업에서 주기적으로 RL-GP를 실행해 범용 또는 세그먼트별 최적 tree를 찾고, 추천 요청 시에는 저장된 tree로 빠르게 점수를 계산한다. MVP v1 구현 범위에는 포함하지 않으며, v2 또는 졸업 보고서에서 응답 속도와 추천 품질 저하 여부를 비교 실험한다.

장점:

- 추천 응답 시간이 짧다
- 운영 비용을 통제하기 쉽다
- 서비스 트래픽 증가에 유리하다

단점:

- 특정 프로젝트 요구사항에 대한 최적성이 낮을 수 있다
- tree 갱신 주기 사이의 데이터 변화가 즉시 반영되지 않을 수 있다
- 학습 데이터와 실제 모집글 분포가 다르면 추천 품질이 저하될 수 있다

#### 권장안

MVP v1에서는 옵션 A를 확정 운영 방식으로 사용한다. 옵션 A는 논문 구조에 더 가깝고 추천 요청 시점의 프로젝트 요구사항과 후보군을 직접 반영할 수 있으므로, 5/29 데모와 초기 구현 대상에 적합하다.

옵션 B는 추천 응답 속도와 운영 비용 측면에서 장점이 있으나, 사전 학습된 tree가 새로운 모집글에도 충분히 일반화된다는 근거가 필요하다. 따라서 옵션 B와 단순 점수 기반 baseline 비교 실험은 v2 또는 졸업 보고서 항목으로 보류한다. 비교 기준에는 추천 품질, 실행 시간, timeout 또는 실패율, 후보군 크기별 안정성을 포함한다.

#### 옵션 A/B trade-off(v2 비교 실험 참고)

| 비교 항목 | 옵션 A: 추천 실행 시마다 RL-GP 실행 | 옵션 B: 백그라운드 학습 tree 사용 |
|---|---|---|
| 응답 속도 | 느림. 추천 요청마다 탐색 비용 발생 | 빠름. 저장된 tree로 즉시 점수 계산 |
| 추천 품질 | 프로젝트별 요구사항에 더 세밀하게 적응 가능 | 일반화된 tree 품질에 의존 |
| 최신 데이터 반영 | 요청 시점 후보군과 IFN을 직접 반영 | 후보군/IFN은 반영 가능하나 tree 자체는 학습 주기에 의존 |
| 운영 비용 | 요청량 증가 시 CPU/GPU/큐 비용 증가 | 학습 비용을 배치 작업으로 통제 가능 |
| UX | 대기 화면과 비동기 완료 알림이 필요 | 모집글 작성자가 빠르게 결과 확인 가능 |
| 장애 영향 | 개별 추천 요청 실패 가능성이 상대적으로 큼 | tree만 준비되어 있으면 추천 실행 안정성이 높음 |
| 구현 난이도 | 타임아웃, 작업 큐, 중간 상태 관리가 더 복잡 | 학습 파이프라인과 tree 버전 관리가 중요 |

MVP v1에서는 옵션 A를 구현한다. 옵션 B의 저장 tree 방식과 성능 차이는 v2 또는 졸업 보고서에서 동일한 RL-GP 구현 결과를 활용해 측정한다.

## 7. 소프트웨어 요구사항(SRS)

### 7.1 기능 요구사항

#### 7.1.1 프로필 분석 작업

| ID | 요구사항 |
|---|---|
| FR-001 | 사용자가 프로필을 등록 또는 수정하면 추천 분석 작업을 생성해야 한다. |
| FR-002 | 분석 작업은 사용자 저장 트랜잭션과 분리된 비동기 백그라운드 작업으로 실행되어야 한다. |
| FR-003 | 분석 작업 상태는 `queued`, `running`, `succeeded`, `failed`, `retrying` 중 하나로 관리되어야 한다. |
| FR-004 | MVP v1에서는 GitHub URL을 추천 분석 입력으로 사용하지 않고, 사용자 입력 스킬과 사전 계산 또는 mock IFN 데이터를 사용해야 한다. |
| FR-005 | GitHub API 통합, rate limit 처리, repository 수집 재시도는 MVP v1 범위에서 제외하고 v2 이후 검토해야 한다. |
| FR-006 | 분석 성공 시 스킬별 IFN, 분석 버전, 분석 시각을 저장해야 하며 근거 데이터는 저장하지 않아야 한다. |
| FR-007 | 기존 IFN이 있는 경우 새 분석 결과로 갱신하되 이전 결과의 생성 시각과 버전을 추적해야 한다. |

#### 7.1.2 GitHub 데이터 수집

| ID | 요구사항 |
|---|---|
| FR-101 | MVP v1에서는 GitHub 데이터 수집을 구현하지 않는다. |
| FR-102 | GitHub URL 파싱, 공개 repository 조회, README/code 분석, repository metadata 수집은 v2 이후 검토한다. |
| FR-103 | v1 추천 결과와 점수 계산은 GitHub 연동 여부에 의존하지 않아야 한다. |

#### 7.1.3 LLM 기반 IFN 계산

| ID | 요구사항 |
|---|---|
| FR-201 | LLM을 사용하는 경우 보유 스킬과 사용자 입력 데이터를 기반으로 스킬별 `mu`, `nu`를 반환해야 한다. MVP v1에서 GitHub 요약 데이터는 사용하지 않는다. |
| FR-202 | `mu + nu <= 1` 조건을 만족하지 않는 LLM 결과는 최대 2회 재요청해야 한다. 최초 요청을 포함해 총 3회 실패하면 `llm_analysis_failed`로 처리해야 한다. |
| FR-203 | LLM 결과는 JSON Schema 등 구조화된 형식으로 검증되어야 한다. |
| FR-204 | IFN이 없는 required skill 또는 입력 정보가 부족한 스킬은 기본 IFN `<mu = 0, nu = 0.7, pi = 0.3>`으로 처리해야 한다. |
| FR-205 | 사용자가 직접 입력한 보유 스킬은 후보군 필터링에는 즉시 반영하되, IFN 점수는 LLM 분석 결과로 보정해야 한다. |
| FR-206 | LLM 결과의 근거 원문 또는 근거 payload는 저장하지 않아야 한다. |

#### 7.1.4 후보군 필터링

| ID | 요구사항 |
|---|---|
| FR-300 | 포지션별 `required_skills`는 기술 스택 버튼 선택 방식으로 1개 이상 선택되어야 하며, 비어 있는 경우 모집글 또는 포지션 저장 단계에서 검증 오류로 처리해야 한다. |
| FR-301 | 각 포지션별로 `required_skills` 중 하나 이상을 가진 사용자를 후보군으로 조회해야 한다. |
| FR-302 | 후보군 필터링은 사용자가 선택한 기술 스택 매핑 데이터와 모집글 작성자가 버튼으로 선택한 required skill을 기준으로 수행해야 한다. |
| FR-303 | 후보군 내 사용자의 `user_skill_ifn`이 없거나 오래된 경우 정보 부족 또는 분석 대기 상태를 표시해야 한다. |
| FR-304 | 후보군이 0명인 포지션은 추천 결과에 `no_candidates` 상태를 표시해야 한다. |
| FR-305 | 후보군이 1명 이상이지만 해당 포지션의 `headcount`보다 적으면 완성된 팀 조합을 만들 수 없으므로 `insufficient_candidates` 상태를 표시해야 한다. |

#### 7.1.5 매칭 실행

| ID | 요구사항 |
|---|---|
| FR-401 | 모집글 작성자가 추천 실행을 요청하면 매칭 작업을 생성해야 한다. |
| FR-402 | 매칭 작업은 포지션, 요구 스킬, 포지션별 핵심 스킬 사전 기반 시스템 자동 스킬 가중치, 후보군, IFN 데이터, 협업 의지 행렬을 입력으로 사용해야 한다. |
| FR-403 | 매칭 작업은 포지션별 `headcount`를 모두 만족하는 팀 조합 후보를 생성해야 한다. |
| FR-404 | 추천 결과는 팀 조합의 `final_team_score` 내림차순으로 정렬되어야 한다. |
| FR-405 | 동일 사용자는 하나의 팀 조합 안에서 최대 한 포지션에만 배정되어야 한다. |
| FR-406 | 추천 결과는 팀 조합 Top 3를 기본으로 반환해야 한다. |
| FR-407 | 사용자에게 표시되는 추천 결과에는 팀 조합 순위, 포지션별 배정 사용자, 주요 스킬 요약, 협업 의지 요약을 포함해야 한다. `final_team_score`, `team_position_match_score`, `communication_efficiency_gamma`는 내부 정렬과 운영 검증에 사용하되 사용자 화면에는 표시하지 않는다. |
| FR-408 | 매칭 timeout 또는 RL-GP 실행 실패 시 옵션 B 방식 또는 단순 점수 기반 baseline으로 fallback하지 않고, 실패 사유와 재실행 가능 여부를 표시해야 한다. |
| FR-409 | 모집글 작성자는 마음에 들지 않는 추천 후보를 제외 목록에 추가하고 해당 후보를 제외한 추천 결과를 새로고침할 수 있어야 한다. |
| FR-410 | 프로젝트 종료 후 사용자는 함께한 팀원에 대해 `다음에도 같이 하고 싶어요` 또는 `다음에는 같이 하고 싶지 않아요`를 평가할 수 있어야 한다. |
| FR-411 | 협업 의지 평가는 `+2`, `-1`, 미응답 만료 시 `0`으로 저장되어야 한다. |
| FR-412 | 두 사용자 간 상호 평가 합계를 기준으로 협업 의지 `r_value`를 `1`, `0`, `-1` 중 하나로 계산해야 한다. |
| FR-413 | 시스템은 `r_value`를 의사소통 행렬에 반영해야 한다. |
| FR-414 | 협업 의지 평가는 프로젝트 종료 후 14일 동안 제출할 수 있어야 한다. 14일이 지나면 미응답 평가는 `0`점으로 처리하며, 만료 처리는 하루 1회 배치로 수행한다. |

#### 7.1.6 추천 결과 저장 및 조회

| ID | 요구사항 |
|---|---|
| FR-501 | 추천 결과는 프로젝트, 팀 조합 순위, 실행 버전 단위로 저장해야 한다. |
| FR-502 | 동일 프로젝트에서 추천을 재실행하면 이전 결과와 새 결과를 구분할 수 있어야 한다. |
| FR-503 | 추천 결과 조회 시 마지막 성공 결과를 기본으로 보여줘야 한다. |
| FR-504 | 팀 조합별 점수 산출에 사용된 주요 입력 버전을 추적해야 한다. |
| FR-505 | 추천 결과 노출만으로 추천 후보에게 자동 알림을 보내지 않아야 한다. |
| FR-506 | 모집글 작성자는 추천 결과에서 선택한 후보에게 알림을 보낼 수 있어야 한다. 알림 발송은 모집글 작성자의 명시적 액션이 있을 때만 수행되어야 한다. |

### 7.2 비기능 요구사항

| ID | 항목 | 요구사항 |
|---|---|---|
| NFR-001 | 성능 | 옵션 A(per-request RL-GP)는 일반 후보군 규모에서 AI 모듈 60초 이내 완료를 목표로 하며, 백엔드 HTTP read timeout은 90초로 둔다. 옵션 B(저장된 tree 기반 추천)는 일반 후보군 규모에서 10초 이내 결과를 반환해야 한다. |
| NFR-002 | 비동기 처리 | IFN 준비, LLM 분석을 사용하는 경우의 분석 작업, RL-GP 학습은 백그라운드 작업으로 처리해야 한다. GitHub 수집은 MVP v1 범위에서 제외한다. |
| NFR-003 | 확장성 | 사용자 수, 모집글 수, 추천 실행 수 증가에 따라 작업 큐를 수평 확장할 수 있어야 한다. |
| NFR-004 | 신뢰성 | 외부 API 실패 시 재시도, 부분 실패, 장애 원인 기록이 가능해야 한다. |
| NFR-005 | 결과 명확성 | 사용자 화면의 추천 결과에는 팀 조합 순위, 포지션별 배정 사용자, 주요 스킬, 협업 의지 요약이 명확하게 표시되어야 한다. 내부 점수는 사용자 화면에 표시하지 않는다. |
| NFR-006 | 개인정보 | MVP v1에서는 GitHub 공개 데이터 수집을 수행하지 않는다. 사용자 입력 데이터는 추천 목적에 한해 사용해야 한다. |
| NFR-007 | 감사 가능성 | 추천 결과 생성 시점의 모델 버전, tree 버전, 입력 데이터 버전을 기록해야 한다. |
| NFR-008 | 비용 관리 | LLM 호출은 프로필 변경, 주기 갱신, 강제 재분석 등 명확한 이벤트에 한정해야 한다. |

---

## 8. 데이터 요구사항

### 8.1 주요 데이터 엔터티

추천 AI 파트는 기존 서비스 DB의 사용자, 프로젝트, 포지션 정보를 재사용하되, 프로필 분석 작업, IFN 분석 결과, 매칭 실행 이력, 추천 결과, 후보 제외, 알림 발송 이력은 별도 엔터티로 관리한다. 이렇게 분리하면 기존 서비스의 핵심 데이터 구조를 크게 흔들지 않으면서도 추천 실행의 상태, 실패 사유, 재실행 이력, 감사용 버전 정보를 추적할 수 있다.

#### user

| 필드 | 설명 |
|---|---|
| id | 사용자 식별자 |
| nickname | 닉네임 |
| github_url | GitHub URL |
| awards | 수상 이력, 추천 점수에는 미반영 |
| cpu_temperature | 외부 사용자 서비스에서 관리하는 매너온도 참조값. 추천 AI 파트에서는 계산하거나 갱신하지 않음 |
| recommendation_status | 추천 가능 상태 |
| created_at / updated_at | 생성/수정 시각 |

`user`는 추천 후보의 기본 식별 정보와 추천 가능 여부를 판단하는 기준 데이터다. 추천 AI는 MVP v1에서 `nickname`과 사용자가 등록한 스킬을 분석 입력으로 사용하며, `github_url`, `awards`, `cpu_temperature`는 MVP 추천 점수에는 반영하지 않는다. `recommendation_status`는 후보군 필터링에서 사용되며, 탈퇴, 정지, 비공개, 전체 추천 제외 상태의 사용자는 추천 후보에서 제외한다.

#### profile_analysis_job

| 필드 | 설명 |
|---|---|
| id | 프로필 분석 작업 ID |
| user_id | 분석 대상 사용자 ID |
| status | `queued`, `running`, `succeeded`, `failed` |
| github_url | 분석 시점의 GitHub URL. MVP v1 추천 분석에는 사용하지 않으며 v2 이후 GitHub 통합 검토용으로만 보존 가능 |
| analysis_version | 분석 파이프라인 버전 |
| error_code | 실패 오류 코드. 성공 시 `null` |
| error_message | 실패 사유 |
| retry_count | 재시도 횟수 |
| requested_at | 작업 요청 시각 |
| started_at / finished_at | 분석 시작/종료 시각 |

`profile_analysis_job`은 프로필 저장 이후 발생하는 IFN 준비 또는 분석 작업을 추적한다. MVP v1에서는 GitHub 수집과 요약을 수행하지 않으며, 사용자 입력 스킬과 사전 계산 또는 mock IFN 데이터를 기준으로 작업을 처리한다. 사용자가 프로필을 여러 번 수정하면 분석 작업도 여러 번 생성될 수 있으며, 추천에는 성공한 최신 작업의 `analysis_version`과 `analyzed_at` 기준 결과를 우선 사용한다. 작업 실패 시 `error_code`, `error_message`, `retry_count`를 남겨 LLM 실패 또는 IFN 검증 실패를 운영자가 구분할 수 있게 한다.

#### collaboration_review

| 필드 | 설명 |
|---|---|
| id | 협업 의지 평가 ID |
| project_id | 평가가 발생한 프로젝트 ID |
| reviewer_user_id | 평가를 남긴 사용자 ID |
| reviewee_user_id | 평가 대상 사용자 ID |
| score | `+2`, `-1`, 미응답 만료 시 `0` |
| review_started_at | 평가 시작 시각 |
| review_expires_at | 평가 만료 시각 |
| submitted_at | 평가 제출 시각 |

`collaboration_review`는 `unique(project_id, reviewer_user_id, reviewee_user_id)`를 적용한다. 동일 프로젝트에서 한 사용자가 같은 팀원을 여러 번 평가하지 않도록 하며, `reviewer_user_id != reviewee_user_id`를 보장한다. 제출 전에는 수정할 수 있으나 제출 후에는 수정하지 않는다. 만료된 미응답 평가는 배치에서 `score = 0`으로 확정한다.

이 엔터티는 프로젝트 종료 후 팀원 간 협업 의지 데이터를 수집하기 위한 원천 데이터다. 실제 추천 점수 계산에는 개별 평가 row를 직접 쓰지 않고, 배치 또는 계산 작업을 통해 `user_relationship`에 집계된 값을 사용한다. 평가 기간은 프로젝트 종료 후 14일이며, 이 기간 안에 제출되지 않은 평가는 중립값 `0`으로 처리한다.

#### user_relationship

| 필드 | 설명 |
|---|---|
| user_id_a | 사용자 A |
| user_id_b | 사용자 B |
| positive_negative_sum | 두 사용자 간 최신 상호 평가 합계 |
| r_value | 상호 평가 합계 기반 협업 의지, `1`, `0`, `-1` |
| calculated_at | 계산 시각 |

`user_relationship`은 두 사용자 간 협업 의지 행렬을 빠르게 조회하기 위한 집계 테이블이다. `positive_negative_sum`은 두 사용자의 최신 상호 평가 합계이며, 이를 기준으로 `r_value`를 `1`, `0`, `-1` 중 하나로 계산한다. 처음 함께하는 사용자 pair는 평가 이력이 없으므로 기본값 `0`으로 간주한다.

#### user_skill

| 필드 | 설명 |
|---|---|
| user_id | 사용자 ID |
| skill_id | 스킬 ID |
| source | 사용자 입력, 시스템 추론 등 |
| created_at | 생성 시각 |

`user_skill`은 후보군을 빠르게 필터링하기 위한 스킬 보유 목록이다. 포지션의 `required_skills` 중 1개 이상이 `user_skill`에 존재하는 사용자만 1차 후보군에 포함된다. 정밀한 적합도 점수는 `user_skill_ifn`을 사용하지만, 후보군 조회 성능과 단순 조건 검증을 위해 `user_skill`을 별도로 유지한다.

#### user_skill_ifn

| 필드 | 설명 |
|---|---|
| user_id | 사용자 ID |
| skill_id | 스킬 ID |
| mu | 스킬 보유 정도 |
| nu | 스킬 비보유 정도 |
| pi | 불확실성 |
| analysis_version | 분석 파이프라인 버전 |
| analyzed_at | 분석 시각 |

`pi`는 API 입력값으로 받지 않고 서버에서 `1 - mu - nu`로 계산해 저장한다.

`user_skill_ifn`은 사용자별 스킬 보유 확신도(`mu`), 비보유 확신도(`nu`), 불확실성(`pi`)을 저장하는 추천 점수 계산용 데이터다. `analysis_version`은 어떤 분석 파이프라인으로 산출된 값인지 추적하기 위한 필드이며, 추천 결과를 나중에 검토할 때 같은 입력과 버전으로 재현 가능한지 확인하는 기준이 된다. required skill에 대한 IFN이 없으면 추천 계산에서 제외하지 않고 기본값 `<mu = 0, nu = 0.7, pi = 0.3>`을 사용한다.

#### project

| 필드 | 설명 |
|---|---|
| id | 프로젝트 ID |
| owner_user_id | 모집글 작성자 |
| name | 프로젝트명 |
| region | 지역 |
| deadline | 모집 마감일 |
| status | 기존 DB의 `PJ_PROGRESS`와 매핑되는 프로젝트 상태. 추천 가능 여부 판단에 사용 |

`project.status`는 기존 DB의 `PJ_PROGRESS`를 최대한 재사용한다.

| 기존 `PJ_PROGRESS` | 추천 파트 해석 |
|---|---|
| `진행전` | 모집/추천 가능 상태로 간주 |
| `진행중` | 프로젝트 진행 중 상태로 간주하며 신규 추천 실행은 제한 |
| `진행종료` | 프로젝트 종료 상태로 간주하며 신규 추천 실행은 제한, 협업 의지 평가 대상 |

`project`는 추천 실행의 소유권과 실행 가능 상태를 판단하는 기준이다. 추천 실행, 추천 결과 조회, 후보 제외, 알림 발송은 기본적으로 `owner_user_id`가 수행한다. MVP에서는 `PJ_PROGRESS = 진행전` 상태에서만 신규 추천을 실행할 수 있으며, 진행 중 또는 종료 상태의 프로젝트는 기존 추천 결과 조회만 허용한다.

#### project_position

| 필드 | 설명 |
|---|---|
| id | 포지션 ID |
| project_id | 프로젝트 ID |
| name | 포지션명 |
| headcount | 모집 인원 |
| required_skills | 요구 스킬 목록. MVP에서는 1개 이상 필수 |
| skill_weights | `position_skill_weights.md` 기준 포지션-스킬 raw weight. IFPIWA 내부에서 `rho_s`로 정규화 |

`project_position`은 팀 조합 생성의 슬롯 정의다. `headcount`가 2 이상이면 동일 포지션에 여러 슬롯이 생성되며, 결과 저장 시 `position_slot`으로 구분한다. `required_skills`는 후보군 필터링의 최소 조건으로 사용되고, `skill_weights`는 포지션별 핵심 스킬 중요도를 반영해 IFPIWA 계산의 가중치로 사용한다.

#### matching_run

| 필드 | 설명 |
|---|---|
| id | 매칭 실행 ID |
| project_id | 프로젝트 ID |
| parent_matching_run_id | 제외 새로고침 또는 재실행의 기준이 된 이전 매칭 실행 ID. 최초 실행은 `null` |
| trigger_type | `initial`, `exclusion_refresh`, `manual_rerun` |
| status | `queued`, `running`, `succeeded`, `failed` |
| algorithm_mode | `pretrained_tree`, `per_request_rl_gp`, `hybrid` |
| tree_version | 사용된 GP tree 버전 |
| relationship_matrix_version | 사용된 협업 의지 행렬 버전 |
| started_at / finished_at | 실행 시각 |
| error_code | 실패 오류 코드. 성공 시 `null` |
| error_message | 실패 사유 |
| retryable | 재실행 가능 여부 |

`matching_run`은 추천 실행 1회를 나타내는 최상위 이력이다. 최초 추천은 `trigger_type = initial`, 후보 제외 후 새로고침은 `trigger_type = exclusion_refresh`, 사용자가 다시 추천 실행을 누른 경우는 `manual_rerun`으로 구분한다. 후보 제외 새로고침도 기존 run을 수정하지 않고 새 run을 생성하며, `parent_matching_run_id`로 기준 실행을 연결한다. 이 방식은 이전 추천 결과와 새 추천 결과를 모두 보존하므로 디버깅과 감사에 유리하다.

#### matching_team_recommendation

| 필드 | 설명 |
|---|---|
| matching_run_id | 매칭 실행 ID |
| team_rank | 팀 조합 추천 순위 |
| final_team_score | 최종 팀 추천 점수. 내부 정렬/운영 검증용이며 사용자 화면에는 표시하지 않음 |
| team_position_match_score | 팀 내 사용자-포지션 적합도 집계 점수. 내부 정렬/운영 검증용이며 사용자 화면에는 표시하지 않음 |
| communication_efficiency_gamma | 팀 조합의 communication efficiency. 내부 정렬/운영 검증용이며 사용자 화면에는 표시하지 않음 |
| communication_summary | 팀 조합 내 협업 의지 요약 |

`matching_team_recommendation`은 하나의 `matching_run`에서 생성된 팀 조합 단위 결과다. 사용자 화면에는 `team_rank`와 `communication_summary`만 노출하고, `final_team_score`, `team_position_match_score`, `communication_efficiency_gamma`는 정렬, 품질 검증, 운영 분석용으로만 사용한다. 기본 반환 범위는 최종 점수 기준 Top 3 팀 조합이다.

#### matching_team_member

| 필드 | 설명 |
|---|---|
| matching_run_id | 매칭 실행 ID |
| team_rank | 팀 조합 추천 순위 |
| position_id | 배정 포지션 ID |
| position_slot | 동일 포지션 내 슬롯 번호. 예: 백엔드1, 백엔드2 |
| user_id | 배정 사용자 ID |
| position_match_score | 사용자-포지션 적합도 |
| skill_match_summary | 스킬 적합 요약 |

`matching_team_member`는 추천된 팀 조합 안에서 어떤 사용자가 어떤 포지션 슬롯에 배정됐는지 저장한다. 동일 팀 조합 안에서는 같은 사용자가 둘 이상의 포지션에 배정될 수 없다. `skill_match_summary`는 점수를 직접 노출하지 않고도 모집글 작성자가 왜 이 후보가 추천됐는지 이해할 수 있도록 보여주는 요약 문구다.

#### matching_recommendation_exclusion

| 필드 | 설명 |
|---|---|
| project_id | 프로젝트 ID |
| position_id | 포지션 ID |
| user_id | 제외된 추천 후보 ID |
| excluded_by | 제외를 요청한 모집글 작성자 ID |
| matching_run_id | 제외가 발생한 추천 실행 ID |
| reason_code | 선택형 제외 사유 |
| created_at / updated_at | 제외 생성/수정 시각 |

`matching_recommendation_exclusion`은 `unique(project_id, position_id, user_id)`를 적용한다. 같은 프로젝트의 같은 포지션에서 같은 사용자를 다시 제외하면 새 row를 만들지 않고 기존 row의 `reason_code`, `matching_run_id`, `updated_at`을 갱신한다.

이 엔터티는 모집글 작성자가 특정 추천 후보를 더 이상 해당 포지션 추천 결과에 포함하지 않도록 하는 제외 목록이다. 제외는 프로젝트 전체가 아니라 `project_id + position_id + user_id` 단위로 적용한다. 제외가 저장되면 다음 매칭 실행부터 해당 사용자는 해당 포지션 후보군에서 제거된다.

#### recommendation_notification

| 필드 | 설명 |
|---|---|
| id | 알림 발송 ID |
| project_id | 프로젝트 ID |
| matching_run_id | 알림 발송 기준 추천 실행 ID |
| team_rank | 알림 대상 후보가 포함된 팀 조합 순위 |
| sender_user_id | 알림을 발송한 모집글 작성자 ID |
| recipient_user_id | 알림 수신 후보 ID |
| message | 선택형 발송 메시지 |
| status | `queued`, `sent`, `failed` |
| error_code | 발송 실패 오류 코드. 성공 시 `null` |
| created_at / sent_at | 생성/발송 시각 |

`recommendation_notification`은 추천 결과 화면에서 특정 후보 닉네임 옆의 개별 전송 버튼을 눌렀을 때 생성되는 알림 발송 이력이다. MVP에서는 한 번의 API 호출이 한 명의 후보에게만 알림을 보내므로 수신자별 단일 row 구조를 사용한다. 여러 후보에게 일괄 발송하는 기능이 추가되면 요청 단위 테이블을 별도로 도입할 수 있지만, 현재 범위에서는 개별 발송 이력만으로 충분하다.

### 8.2 데이터 보존 정책

- 추천 결과는 최소한 프로젝트 종료 후 일정 기간까지 보존한다.
- IFN 분석 결과는 최신 값을 기본 사용하되, 추천 감사 목적을 위해 버전 정보를 남긴다.
- MVP v1에서는 GitHub raw README, raw code 등 GitHub 원천 데이터를 수집하거나 저장하지 않는다.
- IFN 산출 근거 원문과 근거 payload는 저장하지 않는다.

---

## 9. 시스템 흐름

### 9.1 프로필 분석 흐름

```text
사용자 프로필 등록/수정
  -> user 저장
  -> user_skill 저장
  -> profile_analysis_job 생성
  -> 사용자 입력 스킬 기반 IFN 준비 또는 mock IFN 로드
  -> 스킬별 IFN 계산 또는 검증
  -> user_skill_ifn 저장
  -> 분석 상태 갱신
```

### 9.2 모집글 후보군 필터링 흐름

```text
project 저장(PJ_PROGRESS: 진행전)
  -> project_position 저장
  -> required_skills 조회
  -> user_skill 기준 후보군 조회
  -> 지역 정보는 표시용으로만 유지
  -> 제외 정책 적용
  -> position별 후보군 확정
```

### 9.3 매칭 실행 흐름

```text
추천 실행 요청
  -> matching_run 생성
  -> position별 후보군 로드
  -> user_skill_ifn 로드
  -> 사용자 간 협업 의지 행렬 로드
  -> 포지션별 핵심 스킬 사전 기반 skill_weights 자동 계산 및 적용
  -> RL-GP 또는 저장된 GP tree 기반 내부 점수 및 communication efficiency 계산
  -> 포지션별 headcount를 만족하는 팀 조합 생성
  -> final_team_score 기준 팀 조합 Top 3 선정
  -> matching_team_recommendation 및 matching_team_member 저장
  -> 점수는 제외하고 팀 조합 순위와 포지션별 배정 후보 중심으로 추천 결과 화면 표시
```

### 9.4 추천 후보 제외 및 새로고침 흐름

```text
모집글 작성자가 추천 후보 제외
  -> matching_recommendation_exclusion 저장
  -> 해당 project/position 후보군에서 제외 사용자 제거
  -> 동일 matching 설정으로 추천 새로고침
  -> parent_matching_run_id를 이전 실행으로 연결한 새 matching_run 저장
  -> 갱신된 팀 조합 추천 결과 표시
```

### 9.5 추천 후보 알림 발송 흐름

```text
모집글 작성자가 추천 결과에서 후보 알림 보내기 선택
  -> 발송 대상 후보가 해당 추천 결과에 포함되어 있는지 검증
  -> 요청자가 프로젝트 작성자인지 검증
  -> recommendation_notification 생성
  -> 알림 발송
  -> 발송 상태 갱신
```

---

## 10. 화면 설계서

본 화면 설계는 추천 파트에 필요한 화면만 정의한다.

### 10.1 추천 실행 진입 영역

화면 위치: 모집글 상세 또는 모집글 관리 화면 내 추천 탭

#### 목적

모집글 작성자가 포지션별 후보 분석 상태를 확인하고 추천 실행을 시작한다.

#### 주요 구성

| 영역 | 표시 요소 |
|---|---|
| 프로젝트 요약 | 프로젝트명, 지역, 마감일, 모집 상태 |
| 포지션 요약 | 포지션명, 모집 인원, 요구 스킬 |
| 후보군 상태 | 포지션별 후보 수, 분석 완료 후보 수, 분석 대기 후보 수 |
| 추천 실행 버튼 | 추천 실행, 재실행 |
| 상태 배너 | 추천 가능, 후보 부족, 분석 진행 중, 추천 실패 |

#### 와이어프레임

```text
┌────────────────────────────────────────────────────────────┐
│ 프로젝트 추천                                              │
├────────────────────────────────────────────────────────────┤
│ 프로젝트: AI 스터디 매칭 앱                                │
│ 지역: 서울/온라인   마감일: 2026-06-01   상태: 모집중       │
├────────────────────────────────────────────────────────────┤
│ 포지션                  후보군        분석 상태             │
│ Backend Developer        18명          15명 완료 / 3명 대기  │
│ Frontend Developer       12명          12명 완료             │
│ ML Engineer               4명           3명 완료 / 1명 대기  │
├────────────────────────────────────────────────────────────┤
│ [추천 실행] [이전 추천 결과 보기]                          │
└────────────────────────────────────────────────────────────┘
```

#### 상태별 동작

| 상태 | 동작 |
|---|---|
| 후보군 있음 | 추천 실행 가능 |
| 일부 후보 분석 대기 | 추천 실행 가능, 단 정보 부족 안내 |
| 후보군 없음 | 해당 포지션 추천 불가 표시 |
| 추천 실행 중 | 버튼 비활성화, 진행 상태 표시 |
| 추천 실패 | 실패 사유와 재실행 버튼 표시 |

### 10.2 추천 진행 화면

#### 목적

매칭 작업이 비동기로 실행되는 동안 사용자에게 현재 상태를 제공한다.

#### 주요 구성

| 영역 | 표시 요소 |
|---|---|
| 진행 상태 | 후보군 로드, 내부 점수 계산, 팀 조합 산출, 저장 |
| 예상 안내 | “추천 결과를 준비 중입니다.” |
| 오류 표시 | 실패 단계, 재실행 가능 여부 |

#### 와이어프레임

```text
┌────────────────────────────────────────────────────────────┐
│ 추천 실행 중                                               │
├────────────────────────────────────────────────────────────┤
│ Backend Developer    후보군 분석 완료                      │
│ Frontend Developer   내부 점수 계산 중                     │
│ ML Engineer          대기 중                               │
├────────────────────────────────────────────────────────────┤
│ 추천 결과가 준비되면 자동으로 표시됩니다.                  │
└────────────────────────────────────────────────────────────┘
```

### 10.3 팀 조합 추천 결과 화면

#### 목적

모집글 작성자가 포지션별 모집 인원을 만족하는 팀 조합 Top 3를 비교한다.

#### 주요 구성

| 영역 | 표시 요소 |
|---|---|
| 팀 조합 순위표 | 순위, 포지션별 배정 닉네임 |
| 주요 스킬 요약 | 팀 조합 내 포지션별 주요 매칭 스킬 |
| 액션 | 팀 조합 상세 보기, 프로필 보기, 후보 제외, 후보 알림 보내기, 추천 새로고침 |

#### 와이어프레임

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ 추천 결과                                                                            │
├────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│ 구분   │ 프론트   │ 백엔드1  │ 백엔드2  │ DB       │ AI1      │ AI2      │ 디자인   │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 1위    │ dev_fe   │ api_neo  │ server_j │ data_kim │ ml_lee   │ ai_park  │ ux_min   │
│        │ React    │ Spring   │ Docker   │ MySQL    │ PyTorch  │ FastAPI  │ Figma    │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 2위    │ web_jin  │ api_neo  │ back_cho │ db_han   │ ml_lee   │ vision_y │ ui_song  │
│        │ React    │ Spring   │ Java     │ MySQL    │ PyTorch  │ CV       │ Figma    │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 3위    │ react_k  │ spring_l │ server_j │ data_kim │ nlp_cho  │ ai_park  │ ux_min   │
│        │ React    │ Spring   │ Docker   │ MySQL    │ NLP      │ FastAPI  │ Figma    │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [팀 조합 상세 보기] [후보 알림 보내기] [추천 새로고침]                               │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 팀 조합 상세 패널

#### 목적

선택한 팀 조합의 포지션별 배정 사용자, 주요 스킬, 협업 의지 요약을 확인한다.

#### 주요 구성

| 영역 | 표시 요소 |
|---|---|
| 포지션별 배정 | 포지션명, 슬롯, 닉네임, 주요 스킬 |
| 협업 의지 | 팀 조합 내 사용자 쌍의 `r_value` 요약 |

#### 와이어프레임

```text
┌────────────────────────────────────────────────────────────┐
│ 1위 팀 조합 상세                                           │
├────────────────────────────────────────────────────────────┤
│ 포지션       닉네임      주요 스킬                         │
│ 프론트       dev_fe      React, TypeScript                  │
│ 백엔드1      api_neo     Java, Spring, MySQL                │
│ 백엔드2      server_j    Java, Docker, Redis                │
│ DB           data_kim    MySQL, PostgreSQL                  │
│ AI1          ml_lee      PyTorch, MLOps                     │
│ AI2          ai_park     Python, FastAPI                    │
│ 디자인       ux_min      Figma, UX Research                 │
├────────────────────────────────────────────────────────────┤
│ 협업 의지 요약                                             │
│ 긍정 8건, 중립 12건, 부정 1건                              │
└────────────────────────────────────────────────────────────┘
```

### 10.5 추천 불가 상태 화면

#### 목적

후보군 부족 또는 분석 실패로 추천 결과를 만들 수 없는 경우 명확한 사유를 제공한다.

#### 와이어프레임

```text
┌────────────────────────────────────────────────────────────┐
│ 추천 결과를 만들 수 없습니다                               │
├────────────────────────────────────────────────────────────┤
│ ML Engineer 포지션의 요구 스킬을 가진 후보가 없습니다.      │
│ 요구 스킬: PyTorch, MLOps, FastAPI                         │
├────────────────────────────────────────────────────────────┤
│ 해결 방법                                                  │
│ - 요구 스킬 범위를 넓히기                                  │
│ - 요구 스킬 범위를 조정하기                                │
│ - 모집글 노출 후 다시 추천 실행하기                        │
└────────────────────────────────────────────────────────────┘
```

---

## 11. API 수준 기능 명세

실제 엔드포인트명은 구현 단계에서 변경될 수 있다. 본 절은 기능 계약 수준의 명세다.

모든 Command/Query는 인증 컨텍스트의 `requester_user_id`를 사용한다. `requester_user_id`는 요청 body로 받지 않는다.

API body에 요청자 ID를 직접 받지 않는 이유는 클라이언트가 다른 사용자의 ID를 임의로 넣어 권한을 우회하는 상황을 막기 위해서다. 서버는 로그인 세션, JWT, access token 등 인증 정보에서 요청자를 식별하고, 각 API의 권한 조건을 서버 측에서 검증한다.

공통 응답 형식은 다음을 원칙으로 한다.

```text
Output:
  success
  data optional
  error optional:
    code
    message
    retryable
```

`success = false`일 때는 `error.code`를 13장의 오류 코드와 맞춘다. 프론트엔드는 `retryable`을 기준으로 재시도 버튼 노출 여부를 판단하고, `message`는 사용자 표시 또는 운영 로그에 활용한다. 비동기 작업을 시작하는 API는 실제 작업 완료를 기다리지 않고 `queued` 또는 `running` 상태를 반환할 수 있다.

### 11.1 프로필 분석 작업 생성

```text
Event: UserProfileSaved
Input:
  user_id
  nickname
  github_url
  skills[]
  awards[]

Output:
  profile_analysis_job_id
  status = queued
```

이 이벤트는 사용자가 프로필 또는 보유 스킬을 저장하거나 수정했을 때 발생한다. 서버는 사용자 프로필과 스킬 목록을 먼저 저장한 뒤 `profile_analysis_job`을 생성하고, MVP v1에서는 GitHub 수집 없이 IFN 준비 또는 검증 작업을 비동기로 처리한다. 같은 사용자가 짧은 시간 안에 프로필을 다시 수정할 수 있으므로, 추천 계산에는 완료된 작업 중 최신 `analysis_version`과 `finished_at`을 가진 결과를 사용한다.

### 11.2 IFN 분석 결과 저장

```text
Command: SaveUserSkillIFN
Input:
  user_id
  analysis_version
  skills[]:
    skill_id
    mu
    nu

Validation:
  0 <= mu <= 1
  0 <= nu <= 1
  0 <= mu + nu <= 1
  pi is calculated by server as 1 - mu - nu
```

이 Command는 프로필 분석 파이프라인이 스킬별 IFN 값을 계산한 뒤 결과를 저장할 때 사용한다. 입력으로는 `mu`, `nu`만 받고 `pi`는 서버에서 계산한다. 이렇게 하면 `mu + nu + pi = 1` 관계가 깨지는 것을 방지할 수 있다. 저장 시 기존 `user_id + skill_id` 결과가 있으면 같은 스킬의 최신 분석 결과로 갱신하고, `analysis_version`과 `analyzed_at`을 함께 남긴다.

### 11.3 후보군 조회

```text
Query: GetPositionCandidates
Input:
  project_position_id
  required_skills[] // 1개 이상 필수

Output:
  candidates[]:
    user_id
    matched_skills[]
    ifn_status
    relationship_status
```

이 Query는 특정 포지션에 대해 매칭 실행 전에 후보군이 충분한지 확인하거나, 운영자가 후보 부족 원인을 진단할 때 사용한다. 기본 후보군은 저장된 `project_position.required_skills`와 `user_skill`을 기준으로 조회한다. `ifn_status`는 IFN 값이 최신인지, 누락되어 기본값을 사용할지, 분석 대기 상태인지를 표시한다. `relationship_status`는 협업 의지 데이터가 있는지 또는 처음 만나는 사용자 관계인지 표시하는 용도다.

### 11.4 매칭 실행

```text
Command: RunMatching
Input:
  project_id
  algorithm_mode
  relationship_matrix_version optional

Validation:
  requester must be project owner or admin
  project.status must be 진행전

Output:
  matching_run_id
  status
  error_code optional
  retryable optional
```

이 Command는 모집글 작성자가 추천 실행 버튼을 눌렀을 때 호출된다. 서버는 프로젝트 소유자 또는 운영자 권한을 확인하고, 프로젝트가 추천 가능한 `진행전` 상태인지 검증한다. 호출 결과는 추천 결과 자체가 아니라 `matching_run_id`와 실행 상태다. 매칭이 오래 걸릴 수 있으므로 프론트엔드는 이 ID로 `GetMatchingRecommendations`를 polling하거나 상태 화면을 갱신한다.

### 11.5 추천 후보 제외 및 새로고침

```text
Command: ExcludeRecommendationAndRefresh
Input:
  project_id
  position_id
  user_id
  matching_run_id
  reason_code optional

Validation:
  requester must be project owner
  user_id must be included in the selected recommendation result
  exclusion is unique by project_id, position_id, user_id

Output:
  matching_run_id
  status
```

이 Command는 추천 결과 화면에서 모집글 작성자가 특정 후보를 제외할 때 사용한다. 제외 대상은 반드시 해당 `matching_run_id`의 추천 결과에 포함되어 있어야 한다. 제외 정보가 저장되면 서버는 기존 결과를 수정하지 않고, 제외 목록을 반영한 새 `matching_run`을 생성한다. Output의 `matching_run_id`는 새로 생성된 실행 ID이며, 프론트엔드는 이 ID 기준으로 갱신된 추천 결과를 조회한다.

### 11.6 협업 의지 평가 저장

```text
Command: SaveCollaborationReview
Input:
  project_id
  reviewee_user_id
  score // +2 or -1

Validation:
  reviewer is requester from auth context
  reviewer must be a project member
  reviewee_user_id must be a project member
  reviewer_user_id must not equal reviewee_user_id
  review must not already be submitted

Output:
  collaboration_review_id
  status
```

이 Command는 프로젝트 종료 후 팀원이 함께한 다른 팀원을 평가할 때 사용한다. 평가자는 request body가 아니라 인증 컨텍스트의 requester로 결정된다. 평가 대상은 같은 프로젝트의 참여자여야 하며, 자기 자신을 평가할 수 없다. 이미 제출된 평가는 다시 제출할 수 없고, 미응답 평가는 만료 배치에서 `score = 0`으로 확정된다.

### 11.7 추천 결과 조회

```text
Query: GetMatchingRecommendations
Input:
  project_id
  matching_run_id optional

Validation:
  requester must be project owner or admin
  if matching_run_id is omitted, return the latest succeeded matching_run for the project

Output:
  matching_run:
    id
    status
    error_code optional
    retryable optional
  teams[]:
    team_rank
    communication_summary
    members[]:
      position_id
      position_name
      position_slot
      user_id
      nickname
      skill_match_summary
```

이 Query는 추천 진행 화면, 추천 완료 화면, 추천 실패 화면에서 공통으로 사용한다. `matching_run_id`가 있으면 해당 실행의 상태와 결과를 반환하고, 없으면 프로젝트의 최신 성공 실행 결과를 반환한다. 아직 실행 중이면 `matching_run.status = running`과 빈 `teams[]`를 반환할 수 있다. 실패한 실행이면 `error_code`, `retryable`을 함께 내려 프론트가 실패 사유와 재시도 가능 여부를 표시한다.

### 11.8 추천 후보 알림 발송

```text
Command: SendRecommendationNotification
Input:
  project_id
  matching_run_id
  team_rank optional
  recipient_user_id
  message optional

Validation:
  requester must be project owner
  recipient_user_id must be included in the selected recommendation result

Output:
  notification_id
  status
```

이 Command는 추천 결과에서 후보 닉네임 옆의 개별 알림 전송 버튼을 눌렀을 때 호출된다. MVP에서는 한 번에 한 명에게만 발송하므로 `recipient_user_id` 단일 입력을 사용한다. 서버는 요청자가 프로젝트 작성자인지 확인하고, 수신 후보가 해당 추천 결과에 실제로 포함되어 있는지 검증한다. 발송 실패 시 `recommendation_notification.error_code`에 실패 사유를 남기고, 필요하면 같은 후보에게 다시 발송할 수 있다.

---

## 12. 품질 및 검증 기준

### 12.1 기능 검증

| 항목 | 검증 기준 |
|---|---|
| 프로필 분석 | 프로필 저장 후 분석 작업이 생성된다. |
| IFN 제약 | 모든 저장 결과가 `mu + nu <= 1`을 만족한다. |
| 포지션 요구 스킬 | 포지션별 `required_skills`가 비어 있으면 저장 또는 추천 실행 전에 검증 오류가 발생한다. |
| 후보군 필터링 | 요구 스킬 중 1개 이상 보유한 사용자만 후보에 포함된다. |
| 후보 부족 상태 | 후보군 0명은 `no_candidates`, 후보군 1명 이상이지만 `headcount` 미만이면 `insufficient_candidates`로 구분된다. |
| 누락 IFN 기본값 | required skill에 대한 `user_skill_ifn`이 없으면 `<mu = 0, nu = 0.7, pi = 0.3>`으로 점수 계산에 포함된다. |
| 추천 결과 | 포지션별 `headcount`를 만족하는 팀 조합 Top 3가 내부 `final_team_score` 내림차순으로 선정되며, 사용자 화면에는 점수 없이 순위와 포지션별 배정 후보가 표시된다. |
| 중복 배정 방지 | 동일 사용자는 하나의 팀 조합 안에서 둘 이상의 포지션에 배정되지 않는다. |
| 협업 의지 | 프로젝트 종료 후 평가 결과를 기반으로 사용자 간 협업 의지 값이 계산된다. 처음 협업하는 사용자 간 값은 `0`으로 유지되며, 상호 긍정 평가 합계가 `4`일 때만 `r_value = 1`이 된다. |
| 추천 제외 | 모집글 작성자가 제외한 후보는 새로고침된 추천 결과에서 제외된다. |
| 실패 처리 | 후보군 없음, LLM 실패, IFN 검증 실패, 매칭 실패가 구분된다. 옵션 A timeout 또는 RL-GP 실행 실패는 fallback 없이 추천 실패 상태로 표시된다. GitHub 실패는 MVP v1에서 발생하지 않는다. |

### 12.2 추천 품질 검증

초기에는 정답 데이터가 부족하므로 다음 지표를 함께 본다.

- 모집글 작성자의 후보 클릭률
- 팀 조합 상세 조회율
- 추천 후보 프로필 클릭 이후 적합/부적합 피드백 비율
- 추천 재실행 비율
- 추천 제외 또는 부적합 피드백 비율
- 포지션별 후보 부족 발생률

### 12.3 운영 모니터링

| 지표 | 목적 |
|---|---|
| LLM 분석 성공률 | 프로필 분석 안정성 확인 |
| IFN 준비 실패율 | IFN 입력 데이터 준비 안정성 확인 |
| 평균 추천 실행 시간 | UX 성능 확인 |
| 후보군 평균 크기 | 필터링 정책 적절성 확인 |
| IFN stale 비율 | 데이터 최신성 확인 |
| 협업 의지 평가 응답률 | 의사소통 행렬 데이터 품질 확인 |
| 추천 결과 생성 실패율 | 매칭 파이프라인 안정성 확인 |

---

## 13. 예외 및 오류 상태

| 오류 코드 | 상황 | 사용자 표시 |
|---|---|---|
| `llm_analysis_failed` | LLM 분석 실패 | 일부 후보의 분석 정보가 부족할 수 있다는 안내 |
| `ifn_validation_failed` | IFN 값 제약 위반 | 내부 오류로 재분석 필요 |
| `invalid_required_skills` | 포지션의 요구 스킬이 비어 있음 | 요구 스킬을 1개 이상 입력하라는 안내 |
| `no_candidates` | 후보군 없음 | 요구 스킬을 조정하라는 안내 |
| `insufficient_candidates` | 특정 포지션 후보군이 1명 이상이지만 `headcount`보다 적음 | 모집 인원 또는 요구 스킬을 조정하라는 안내 |
| `matching_timeout` | 매칭 실행 시간 초과 | 재실행 또는 나중에 다시 시도 안내 |
| `tree_version_missing` | 사용할 GP tree 없음 | 기본 휴리스틱 또는 재학습 필요 |

---

## 14. 보안 및 개인정보 요구사항

- MVP v1에서는 GitHub 공개 정보와 private repository 정보를 수집하지 않는다.
- LLM 입력에는 추천에 필요하지 않은 개인정보를 포함하지 않는다.
- IFN 원값과 IFN 산출 근거 데이터는 사용자 화면에 노출하지 않는다.
- 추천 결과는 모집글 작성자와 권한 있는 운영자만 조회할 수 있다.
- 후보자가 전체 추천 제외를 선택할 수 있는 정책과 모집글 작성자가 특정 추천 후보를 제외하는 정책을 구분해야 한다.

---

## 15. Open Questions

본 절은 아직 정책 또는 실험 결과가 확정되지 않은 사항만 정리한다. 2026-05-14 기준 MVP v1 운영 방식, timeout, GitHub 통합 범위, IFPIWA, gamma 계산 방식은 결정 완료 상태다.

### 결정 완료 로그

- 2026-05-14 OQ-07: MVP v1은 RL-GP per-request 옵션 A로 확정한다. 옵션 B 및 옵션 A/B/baseline 비교 실험은 v2 또는 졸업 보고서 항목으로 보류한다.
- 2026-05-14 OQ-08: 매칭 타임아웃은 AI 모듈 60초, 백엔드 HTTP read timeout 90초로 통일한다.
- 2026-05-14 OQ-09: MVP v1에서는 GitHub API 통합을 하지 않는다. GitHub 수집, repository 분석, GitHub 기반 IFN 갱신, 월 1회 재수집은 v2 이후 검토한다.
- 2026-05-14 OQ-10: `position_match_score`는 IFPIWA 기반으로 통일한다. 정확한 수식과 구현 기준은 `ai_module_prd_srs.md` 4.3.2를 권위로 따른다. 본 문서 6.3은 제품 관점 원칙과 `position_skill_weights.md` raw weight 사용 정책만 유지한다.
- 2026-05-14 OQ-11: `communication_efficiency_gamma(team)`는 pair factor 평균으로 계산하고 MVP v1에서는 `0.80 <= γ <= 1.10` 범위로 clamp한다. 논문식 `γ ∈ [1,2]`는 v2 또는 보고서 비교 실험 항목으로 보류한다.
- 2026-05-14 OQ-12: 협업 의지 변수명은 `r_ii'`(논문 표기)와 `r_value`(구현 변수명)를 동치로 본다. 본 문서에서는 구현 변수명 `r_value`를 사용한다.

---

## 16. MVP 권장 결정안

초기 제품에서는 다음 정책을 권장한다.

| 항목 | 권장 결정 |
|---|---|
| RL-GP 운영 | MVP v1은 per-request 옵션 A 확정 |
| 옵션 B 활용 | v2 또는 졸업 보고서에서 사전 학습 tree 방식의 응답 속도와 품질 저하 여부를 실험으로 검증 |
| 비교 실험 | 옵션 A/B/baseline 비교 실험은 v2 또는 졸업 보고서 항목으로 보류 |
| 스킬 가중치 | 모집글 작성자가 직접 입력하지 않음. `position_skill_weights.md` 기준 raw weight를 사용하고 IFPIWA 내부에서 정규화 |
| GitHub 통합 | MVP v1에서는 GitHub API 통합을 하지 않음. GitHub 수집, repository 분석, 월 1회 재수집은 v2 이후 검토 |
| 분석 재시도 | 최대 2회 재시도. 1차 1분 후, 2차 5분 후 |
| LLM 검증 실패 | 최대 2회 재요청. 총 3회 실패 시 `llm_analysis_failed` |
| repository 처리 | MVP v1 범위에서 제외 |
| 협업 평가 유효 시간 | 프로젝트 종료 후 14일. 만료 배치는 하루 1회 |
| 추천 결과 단위 | 포지션별 후보 랭킹이 아니라 팀 조합 Top 3 추천 |
| 중복 배정 | 하나의 팀 조합 안에서 동일 사용자는 최대 한 포지션에만 배정 |
| `headcount` 처리 | 각 포지션의 `headcount`만큼 팀 조합 내 슬롯 생성 |
| GitHub 연동 여부 | MVP v1 추천 대상 포함 여부와 점수 계산에 미사용 |
| 지역 조건 | 평가 미반영, 참고용 표시 |
| IFN 공개 | 비공개 |
| 수상 이력 | 추천 요소 미사용, 프로필 참고용 표시 |
| CPU온도 | 추천 AI 파트에서는 계산/갱신하지 않음. 외부 사용자 서비스 지표를 필요한 경우 조회만 하며 추천 결과와 협업 의지 계산에는 미사용 |
| 최초 협업 관계 | `r = 0` 그대로 사용 |
| 후보 제외 새로고침 | 모집글 작성자가 제외한 후보를 빼고 추천 새로고침 |
| 추천 알림 | 추천 결과 노출만으로는 자동 알림 없음. 모집글 작성자가 명시적으로 선택한 후보에게 알림 발송 가능 |

---

## 17. 참고 자료

- arXiv: *A Reinforcement Learning-assisted Genetic Programming Algorithm for Team Formation Problem Considering Person-Job Matching*, arXiv:2304.04022
- ScienceDirect: *A reinforcement learning-assisted genetic programming algorithm for team formation problem considering person-job matching*, Neurocomputing, Volume 650, 2025, 130917
