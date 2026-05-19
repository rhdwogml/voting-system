import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import { useVoting } from '../context/VotingContext';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/common/Toast';
import { fetchCandidates, type Candidate } from '../lib/api';
import { parseContractError } from '../lib/errors';
import { formatKST } from '../lib/time';
import VotingArtifact from '../contracts/Voting.json' assert { type: 'json' };
import styles from './Vote.module.css';

const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';
const PLACEHOLDER =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><rect width='72' height='72' fill='%231a3a7a'/><text x='36' y='48' font-size='36' text-anchor='middle' fill='%2390caf9'>👤</text></svg>";

type VotePhase = 'loading' | 'selecting' | 'signing' | 'mining' | 'done' | 'error';

interface VoteReceipt {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  candidateName: string;
  candidateId: number;
}

// 카운트다운 hook (Home.tsx와 동일 패턴)
function useCountdown(endTimeUnix: number | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endTimeUnix) return;
    const update = () => setRemaining(Math.max(0, endTimeUnix - Math.floor(Date.now() / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endTimeUnix]);
  return remaining;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function Vote() {
  const { state, contractAddress, endTime } = useVoting();
  const { address: walletAddress, provider } = useWallet();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phase, setPhase] = useState<VotePhase>('loading');
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);

  const remaining = useCountdown(endTime);

  const checkAndLoad = useCallback(async () => {
    if (!contractAddress || !provider || !walletAddress) {
      setPhase('selecting');
      return;
    }
    try {
      const [cands] = await Promise.all([fetchCandidates()]);
      setCandidates(cands);

      // hasVoted 체크
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);
      const [hasVoted] = (await contract.getMyVote()) as [boolean, bigint];

      if (hasVoted || state !== 'ACTIVE') {
        navigate('/', { replace: true });
        return;
      }
    } catch {
      // 조회 실패 시 그냥 선택 화면 표시
    }
    setPhase('selecting');
  }, [contractAddress, provider, walletAddress, state, navigate]);

  useEffect(() => {
    void checkAndLoad();
  }, [checkAndLoad]);

  // ── 투표 실행 ──────────────────────────────────────────────────────────────
  async function handleVote() {
    if (selectedId === null || !provider || !contractAddress || !walletAddress) return;

    // Step 1: 서명 대기
    setPhase('signing');
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);

      const tx = await (contract.vote as (id: number) => Promise<ethers.TransactionResponse>)(selectedId);

      // Step 2: 채굴 대기
      setPhase('mining');
      const txReceipt = await tx.wait();

      // Step 3: 완료
      const blockNumber = txReceipt?.blockNumber ?? 0;
      const timestamp = Math.floor(Date.now() / 1000);
      const txHash = txReceipt?.hash ?? tx.hash;
      const candidateName = candidates.find((c) => c.id === selectedId)?.name ?? `후보 ${selectedId}`;

      // localStorage에 저장 (Me 페이지에서 사용)
      if (contractAddress) {
        localStorage.setItem(`voteTx_${contractAddress}`, JSON.stringify({ txHash, candidateId: selectedId }));
      }

      setReceipt({ txHash, blockNumber, timestamp, candidateName, candidateId: selectedId });
      setPhase('done');
    } catch (err) {
      setPhase('selecting');
      const errMsg = parseContractError(err);
      showToast('error', errMsg);
      // VotingClosed → 결과 화면으로 이동
      if (errMsg.includes('종료')) {
        setTimeout(() => navigate('/'), 1500);
      }
    }
  }

  // ── 로딩 화면 ─────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className={styles.loading}>
        <div className={styles.bigSpinner} />
        투표 정보 로딩 중…
      </div>
    );
  }

  // ── S6: 투표 완료 화면 ────────────────────────────────────────────────────
  if (phase === 'done' && receipt) {
    return (
      <div className={styles.donePage}>
        <div className={styles.doneIcon}>✅</div>
        <h1 className={styles.doneTitle}>투표가 완료되었습니다</h1>
        <p className={styles.doneSub}>{receipt.candidateName} 후보에게 투표하셨습니다.</p>

        <div className={styles.receiptCard}>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>📋 Tx Hash</span>
            <span>
              <span className={styles.receiptValue}>
                {receipt.txHash.slice(0, 12)}…{receipt.txHash.slice(-8)}
              </span>{' '}
              <a
                href={`${SEPOLIA_ETHERSCAN}/tx/${receipt.txHash}`}
                target="_blank"
                rel="noreferrer"
                className={styles.ethLink}
              >
                [Etherscan ↗]
              </a>
            </span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>📦 블록</span>
            <span className={styles.receiptValue}>{receipt.blockNumber.toLocaleString()}</span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>⏱ 시각</span>
            <span className={styles.receiptValue}>{formatKST(receipt.timestamp)}</span>
          </div>
        </div>

        <button className={styles.homeBtn} onClick={() => navigate('/')}>
          📊 실시간 결과 보러가기
        </button>
      </div>
    );
  }

  // ── S5: 후보자 선택 화면 ─────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* 헤더 */}
      <div className={styles.header}>
        <h1 className={styles.title}>투표하기</h1>
        <div>
          <div className={styles.countdownLabel}>남은 시간</div>
          <div className={styles.countdown}>{formatTime(remaining)}</div>
        </div>
      </div>

      <div className={styles.instruction}>
        한 명의 후보자만 선택할 수 있으며, 투표 후에는 변경할 수 없습니다.
      </div>

      {/* 후보자 카드 */}
      <div className={styles.grid}>
        {candidates.map((c) => (
          <div
            key={c.id}
            className={`${styles.candidateCard} ${selectedId === c.id ? styles.selected : ''}`}
            onClick={() => setSelectedId(c.id)}
          >
            <img
              className={styles.photo}
              src={c.photoUrl}
              alt={c.name}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }}
            />
            <span className={styles.candidateName}>{c.name}</span>
            <span className={`${styles.selectionIndicator} ${selectedId === c.id ? styles.active : ''}`}>
              {selectedId === c.id ? '● 선택됨' : '○ 선택'}
            </span>
          </div>
        ))}
      </div>

      {/* 투표 버튼 */}
      <button
        className={styles.voteBtn}
        disabled={selectedId === null}
        onClick={() => void handleVote()}
      >
        🗳 {selectedId !== null
          ? `[${candidates.find((c) => c.id === selectedId)?.name ?? '?'}] 후보에게 투표하기`
          : '후보자를 선택해주세요'}
      </button>
      <p className={styles.voteHint}>* MetaMask에서 서명을 요청합니다. 가스비가 발생합니다.</p>

      {/* 3단계 모달 */}
      {(phase === 'signing' || phase === 'mining') && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalTitle}>🗳 투표 처리 중</div>
            <ol className={styles.steps}>
              <li className={`${styles.step} ${phase === 'signing' ? styles.stepActive : styles.stepDone}`}>
                <span className={styles.stepIcon}>
                  {phase === 'signing' ? <span className={styles.spinner} /> : '✓'}
                </span>
                1. 서명 대기 중
              </li>
              <li className={`${styles.step} ${phase === 'mining' ? styles.stepActive : phase === 'signing' ? '' : styles.stepDone}`}>
                <span className={styles.stepIcon}>
                  {phase === 'mining' ? <span className={styles.spinner} /> : phase === 'signing' ? '○' : '✓'}
                </span>
                2. 채굴 대기 중
              </li>
              <li className={`${styles.step}`}>
                <span className={styles.stepIcon}>○</span>
                3. 완료
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
