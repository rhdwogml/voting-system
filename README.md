# Sepolia Voting DApp

> 이더리움 세폴리아(Sepolia) 테스트넷 기반 수업 실습용 투표 시스템  
> CP-001 · v1.6 · 2026-05-11

## 개요

MetaMask 지갑으로 로그인하고, 스마트 컨트랙트에 투표를 기록하는 블록체인 투표 시스템입니다.

- **관리자**: 컨트랙트 배포 → 후보자 등록 → 투표 시작/종료
- **유권자**: 지갑 연결 → 후보 선택 → 투표 (1지갑 1표)
- **참관인**: 실시간 개표 현황 확인

## 주요 기능

| 기능 | 설명 |
|------|------|
| 컨트랙트 UI 배포 | 웹 앱에서 직접 `Voting.sol` 배포 (Hardhat CLI 불필요) |
| 실시간 개표 | 가로 막대차트 + 도넛차트 + 5초 폴링 |
| 한국 개표방송 스타일 | 다크 네이비 배경, 당선자 컨페티 애니메이션 |
| 무결성 보장 | 모든 투표 Sepolia 블록체인에 영구 기록 |
| 관리자 인증 | MetaMask 서명 + nonce 기반 (replay attack 방지) |

## 기술 스택

| 영역 | 기술 |
|------|------|
| 스마트 컨트랙트 | Solidity 0.8.24, Hardhat 2.22, OpenZeppelin Ownable 패턴 |
| 블록체인 연동 | ethers.js v6 |
| 프론트엔드 | React 18 + TypeScript + Vite, Recharts, canvas-confetti |
| 백엔드 | Node.js 22+ + Express 4 + `node:sqlite` (내장 SQLite) + Multer |
| 네트워크 | Ethereum Sepolia Testnet (Chain ID: 11155111) |

---

## 사전 요구사항

| 항목 | 버전 | 확인 명령 |
|------|------|-----------|
| **Node.js** | **22 LTS 이상** | `node -v` |
| npm | 9 이상 | `npm -v` |
| MetaMask | 최신 (Chrome/Brave) | 브라우저 확장 설치 확인 |
| Sepolia ETH | 0.01 이상 | [Alchemy Faucet](https://sepoliafaucet.com) |
| Infura 또는 Alchemy 계정 | — | RPC URL 발급용 |

> ⚠️ `node:sqlite`는 Node.js 22+에 내장된 SQLite 모듈을 사용합니다. Node.js 20 이하에서는 실행되지 않습니다.

---

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/rhdwogml/voting-system.git
cd voting-system
```

### 2. 의존성 설치

```bash
# 루트에서 전체 워크스페이스 일괄 설치
npm install

# 또는 각 워크스페이스 개별 설치
cd contracts && npm install && cd ..
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. 환경변수 설정

```bash
# 템플릿 복사
cp .env.example backend/.env
cp .env.example frontend/.env
```

**`backend/.env` 작성:**

```env
PORT=4000
UPLOAD_DIR=./uploads
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
OWNER_ADDRESS=0x본인MetaMask지갑주소
```

**`frontend/.env` 작성:**

```env
VITE_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
VITE_API_BASE=http://localhost:4000/api
```

> 💡 `OWNER_ADDRESS`는 최초 컨트랙트 배포 전까지 관리자 판별에 사용됩니다. 배포 후에는 컨트랙트의 `owner()` 주소로 자동 전환됩니다.

### 4. 컨트랙트 컴파일 및 ABI 내보내기

```bash
npm run compile   # Hardhat 컴파일
npm run export    # ABI+bytecode → frontend/src/contracts/Voting.json
```

### 5. 백엔드 시작

```bash
npm run dev:backend   # http://localhost:4000
```

### 6. 프론트엔드 시작

```bash
npm run dev:frontend  # http://localhost:5173
```

---

## 투표 운영 가이드

### 전체 흐름

```
1. 컨트랙트 배포  (/new)
      ↓
2. 후보자 등록    (/admin/candidates)   ← 최소 2명
      ↓
3. 투표 시작      (/admin/control)      ← 종료 일시 입력
      ↓
4. 투표 진행      (/vote)               ← 유권자 지갑 필요
      ↓
5. 결과 확인      (/result)             ← 자동 이동
      ↓
6. 다음 투표      (/new)                ← ENDED 이후 재배포 가능
```

### 관리자 (Admin)

1. 브라우저에서 `http://localhost:5173` 접속
2. MetaMask 연결 (Sepolia 네트워크 자동 전환)
3. `OWNER_ADDRESS`와 동일한 지갑으로 연결 확인
4. **새 투표 만들기** → 제목 입력 → **컨트랙트 배포하기** 클릭
5. MetaMask 팝업 승인 → 약 12~30초 대기 → 배포 완료
6. **후보자 관리** → 이름 + 사진 등록 (1명씩, Tx 서명 필요)
7. **투표 제어** → 종료 일시 선택 → **투표 시작하기** 클릭

### 유권자 (Voter)

1. `http://localhost:5173` 접속
2. MetaMask 연결 (Sepolia 테스트 ETH 필요)
3. 후보자 카드 선택 → **투표하기** 클릭
4. MetaMask 서명 승인 → 트랜잭션 채굴 완료
5. 완료 화면에서 Tx Hash 확인 가능

---

## 아키텍처

```
Browser (Chrome + MetaMask)
├── React SPA (Vite + ethers.js)    ← http://localhost:5173
│   ├── WalletContext  : MetaMask 연결, chainId, isOwner
│   ├── VotingContext  : /contracts/current 5초 폴링, 이벤트 구독
│   └── Routes         : /, /vote, /result, /history, /admin/*, /new
│
└── JSON-RPC (MetaMask)             ← Sepolia Testnet
        │
        ▼
    Voting.sol (Ownable)
    - state: IDLE → ACTIVE → ENDED
    - 1지갑 1표 강제
    - getResults(), getMyVote()

Backend (Express + node:sqlite)     ← http://localhost:4000
├── /api/candidates  : 후보자 메타 (이름, 사진)
├── /api/contracts   : 현재 컨트랙트 주소 + 상태
├── /api/votings     : 투표 이력, precheck, 결과 저장
└── /api/nonce       : 관리자 서명용 nonce
```

---

## 프로젝트 구조

```
voting-system/
├── contracts/               # Hardhat 프로젝트
│   ├── contracts/Voting.sol  # 스마트 컨트랙트
│   ├── test/Voting.test.ts   # 47개 단위 테스트
│   └── scripts/export-artifact.ts
│
├── backend/                 # Node.js / Express
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/          # candidates, contracts, votings
│   │   ├── middleware/      # adminAuth (서명 검증)
│   │   ├── services/        # chainReader (ethers.js RPC)
│   │   └── db/              # schema.sql, client.ts (node:sqlite)
│   └── uploads/             # 후보자 사진 저장소
│
├── frontend/                # React / Vite
│   └── src/
│       ├── context/         # WalletContext, VotingContext
│       ├── pages/           # Home, Vote, Result, History, Admin/*
│       ├── components/      # Navbar, Toast, BarChart, DonutChart
│       ├── lib/             # api.ts, adminAuth.ts, time.ts, errors.ts
│       └── contracts/       # Voting.json (컴파일 후 자동 생성)
│
├── .env.example
└── README.md
```

---

## 테스트

### 스마트 컨트랙트 (필수)

```bash
cd contracts

# 단위 테스트 실행 (47개)
npm test

# 커버리지 측정
npm run coverage
```

**커버리지 목표:**

| 항목 | 목표 | 현재 |
|------|------|------|
| Statements | ≥ 90% | **100%** |
| Branches | ≥ 85% | **100%** |
| Functions | 100% | **100%** |
| Lines | ≥ 90% | **100%** |

### 백엔드 API 검증

```bash
# 서버 실행 후 헬스 체크
curl http://localhost:4000/api/health

# 후보자 목록
curl http://localhost:4000/api/candidates

# 현재 컨트랙트 상태
curl http://localhost:4000/api/contracts/current
```

---

## Acceptance Criteria 검증 결과

| ID | 시나리오 | 구현 위치 | 상태 |
|----|----------|-----------|------|
| AC-01 | 비관리자 `addCandidate()` | `Voting.sol:NotOwner` + `errors.ts` 매핑 | ✅ |
| AC-02 | 후보자 1명으로 `startVoting` | `Control.tsx` 버튼 비활성 + 컨트랙트 revert | ✅ |
| AC-03 | 같은 지갑 2번 투표 | `AlreadyVoted` → "이미 투표하셨습니다" | ✅ |
| AC-04 | 종료 시각 이후 투표 | `VotingClosed` → 토스트 + 결과 화면 이동 | ✅ |
| AC-05 | MetaMask 미연결 `/vote` | `WalletRoute` → `/connect` 리다이렉트 | ✅ |
| AC-06 | 5개 지갑 동시 투표 | Hardhat 테스트 `5개 지갑 투표 후 합계 일치` | ✅ |
| AC-07 | 투표 중 새로고침 | `Vote.tsx` 마운트 시 `getMyVote()` 재확인 | ✅ |
| AC-08 | 투표 종료 후 진입 | `Home.tsx` ENDED → `/result` 자동 이동 | ✅ |
| AC-09 | 비-Sepolia 네트워크 | `Navbar.tsx` 빨간 띠 + 전환 버튼 | ✅ |
| AC-10 | 백엔드 다운 결과 조회 | 사진 `onError` → 👤 placeholder | ✅ |
| AC-11 | ACTIVE 중 `/new` 접근 | `New.tsx` → `/` 리다이렉트 + 토스트 | ✅ |
| AC-12 | ENDED 후 새 배포 | `/new` 4단계 배포 → `/admin/candidates` 이동 | ✅ |
| AC-13 | 다른 관리자 배포 자동 감지 | `VotingContext` 5초 폴링 → 상태 자동 전환 | ✅ |
| AC-14 | `canDeploy=false` 진입 | `New.tsx` precheck → 배포 버튼 비활성 + 사유 | ✅ |

---

## 트러블슈팅

### MetaMask 연결이 안 됩니다

- MetaMask 확장 설치 확인: [metamask.io/download](https://metamask.io/download)
- Chrome 또는 Brave 브라우저 사용 권장

### Sepolia 네트워크로 전환이 안 됩니다

- Navbar 상단의 "세폴리아로 전환" 버튼 클릭
- MetaMask에서 수동으로 Sepolia Testnet 선택

### 가스비가 부족합니다

- Sepolia Faucet에서 테스트 ETH 받기: [sepoliafaucet.com](https://sepoliafaucet.com)
- [Alchemy Sepolia Faucet](https://sepoliafaucet.com) 또는 [Infura Faucet](https://www.infura.io/faucet/sepolia)

### 백엔드가 실행되지 않습니다

```bash
# Node.js 버전 확인 (22+ 필요)
node -v

# 포트 충돌 확인
netstat -an | grep 4000

# 의존성 재설치
cd backend && npm install
```

### SEPOLIA_RPC_URL 설정 후에도 체인 조회가 실패합니다

- Infura/Alchemy 대시보드에서 API key 유효성 확인
- `backend/.env`의 `SEPOLIA_RPC_URL` 값이 올바른지 확인
- RPC URL 형식: `https://sepolia.infura.io/v3/YOUR_KEY`

### 컨트랙트 배포 후 관리자 메뉴가 보이지 않습니다

- `backend/.env`의 `OWNER_ADDRESS`가 현재 연결된 MetaMask 지갑 주소와 동일한지 확인
- 대소문자 구분 없이 비교하므로 형식은 무관

---

## 환경변수 전체 목록

| 키 | 위치 | 필수 | 설명 |
|----|------|------|------|
| `PORT` | backend | — | 기본 4000 |
| `UPLOAD_DIR` | backend | — | 기본 ./uploads |
| `SEPOLIA_RPC_URL` | backend | ✅ | Infura/Alchemy Sepolia RPC |
| `OWNER_ADDRESS` | backend | ✅ | 초기 관리자 지갑 주소 |
| `DEPLOYER_PRIVATE_KEY` | contracts | — | Hardhat 스크립트 전용 (웹 UI 배포 시 불필요) |
| `ETHERSCAN_API_KEY` | contracts | — | Hardhat verify 플러그인 전용 |
| `VITE_RPC_URL` | frontend | — | 읽기 전용 RPC (MetaMask 없는 참관인용) |
| `VITE_API_BASE` | frontend | — | 기본 http://localhost:4000/api |

---

## 라이선스

수업 실습(Class Practice) 목적으로 작성된 코드입니다.
