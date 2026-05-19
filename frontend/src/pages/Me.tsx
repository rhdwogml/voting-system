import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import { useVoting } from '../context/VotingContext';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/common/Toast';
import { API_BASE } from '../lib/api';
import VotingArtifact from '../contracts/Voting.json' assert { type: 'json' };
import styles from './Me.module.css';

const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';
const PLACEHOLDER =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'><rect width='36' height='36' fill='%231a3a7a'/><text x='18' y='26' font-size='18' text-anchor='middle' fill='%2390caf9'>👤</text></svg>";

interface MyVoteInfo {
  hasVoted: boolean;
  candidateId: number;
  candidateName: string | null;
  candidatePhotoUrl: string | null;
  txHash: string | null;
}

export default function Me() {
  const { contractAddress } = useVoting();
  const { address: walletAddress, provider } = useWallet();
  const { showToast } = useToast();

  const [info, setInfo] = useState<MyVoteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!contractAddress || !provider || !walletAddress) {
      setLoading(false);
      return;
    }

    async function loadMyVote() {
      setLoading(true);
      try {
        const signer = await provider!.getSigner();
        const contract = new ethers.Contract(contractAddress!, VOTING_ABI, signer);
        const [hasVoted, votedForBig] = (await contract.getMyVote()) as [boolean, bigint];
        const candidateId = Number(votedForBig);

        let candidateName: string | null = null;
        let candidatePhotoUrl: string | null = null;

        if (hasVoted) {
          // 후보자 이름/사진 조회
          try {
            const res = await fetch(`${API_BASE}/candidates/${candidateId}`);
            if (res.ok) {
              const c = (await res.json()) as { name: string; photoUrl: string };
              candidateName = c.name;
              candidatePhotoUrl = c.photoUrl;
            }
          } catch { /* 백엔드 조회 실패 시 이름 없이 표시 */ }

          // txHash: localStorage → 이벤트 조회 fallback
          let txHash: string | null = null;
          const stored = localStorage.getItem(`voteTx_${contractAddress}`);
          if (stored) {
            try {
              const parsed = JSON.parse(stored) as { txHash: string; candidateId: number };
              if (parsed.candidateId === candidateId) txHash = parsed.txHash;
            } catch { /* ignore */ }
          }

          if (!txHash) {
            // MetaMask provider로 이벤트 조회 시도
            try {
              const roContract = new ethers.Contract(contractAddress!, VOTING_ABI, provider!);
              const filter = roContract.filters['Voted'](walletAddress);
              const events = await roContract.queryFilter(filter);
              if (events.length > 0) {
                txHash = events[0].transactionHash;
              }
            } catch { /* RPC 지원 안 되면 null 유지 */ }
          }

          setInfo({ hasVoted: true, candidateId, candidateName, candidatePhotoUrl, txHash });
        } else {
          setInfo({ hasVoted: false, candidateId: 0, candidateName: null, candidatePhotoUrl: null, txHash: null });
        }
      } catch (err) {
        showToast('error', `투표 이력 조회 실패: ${(err as Error).message}`);
        setInfo(null);
      } finally {
        setLoading(false);
      }
    }

    void loadMyVote();
  }, [contractAddress, provider, walletAddress, showToast]);

  const truncateAddr = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;
  const truncateTx = (tx: string) => `${tx.slice(0, 12)}…${tx.slice(-8)}`;

  async function copyAddress() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          투표 이력 조회 중…
        </div>
      </div>
    );
  }

  if (!contractAddress) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.noContract}>현재 진행 중인 투표가 없습니다.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>내 투표 내역</h1>
        <p className={styles.sub}>현재 투표에 대한 내 참여 기록</p>
      </div>

      <div className={styles.card}>
        {/* 지갑 주소 */}
        <div className={styles.row}>
          <span className={styles.label}>연결된 지갑</span>
          <div className={styles.addressRow}>
            <span className={styles.value} style={{ fontFamily: 'monospace' }}>
              {walletAddress ? truncateAddr(walletAddress) : '—'}
            </span>
            {walletAddress && (
              <button className={styles.copyBtn} onClick={() => void copyAddress()}>
                {copied ? '✓ 복사됨' : '📋 복사'}
              </button>
            )}
          </div>
        </div>

        {/* 투표 여부 */}
        <div className={styles.row}>
          <span className={styles.label}>투표 여부</span>
          <span className={styles.value}>
            {info?.hasVoted ? '✅ 투표 완료' : '⬜ 미투표'}
          </span>
        </div>

        {info?.hasVoted && (
          <>
            {/* 선택한 후보 */}
            <div className={styles.row}>
              <span className={styles.label}>선택 후보</span>
              <div className={styles.candidateRow}>
                <img
                  className={styles.photo}
                  src={info.candidatePhotoUrl ?? PLACEHOLDER}
                  alt={info.candidateName ?? '후보'}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }}
                />
                <span className={styles.value}>
                  {info.candidateName ?? `ID ${info.candidateId}`}
                </span>
              </div>
            </div>

            {/* Tx Hash */}
            <div className={styles.row}>
              <span className={styles.label}>Tx Hash</span>
              <span className={styles.value}>
                {info.txHash ? (
                  <>
                    {truncateTx(info.txHash)}{' '}
                    <a
                      href={`${SEPOLIA_ETHERSCAN}/tx/${info.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.ethLink}
                    >
                      [Etherscan ↗]
                    </a>
                  </>
                ) : (
                  <span style={{ color: '#666' }}>조회 불가</span>
                )}
              </span>
            </div>
          </>
        )}

        {!info?.hasVoted && (
          <div className={styles.notVoted}>
            아직 이번 투표에 참여하지 않으셨습니다.
          </div>
        )}
      </div>
    </div>
  );
}
