import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import { useVoting } from '../context/VotingContext';
import { useWallet } from '../context/WalletContext';
import { usePolling } from '../hooks/usePolling';
import {
  API_BASE,
  fetchCandidates,
  fetchVotingHistory,
  fetchPrecheck,
  type Candidate,
  type VotingHistory,
} from '../lib/api';
import VotingArtifact from '../contracts/Voting.json' assert { type: 'json' };
import BarChart, { type BarEntry } from '../components/charts/BarChart';
import DonutChart, { type DonutEntry } from '../components/charts/DonutChart';
import styles from './Home.module.css';

const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const RPC_URL = import.meta.env['VITE_RPC_URL'] as string | undefined;
const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(endTimeUnix: number | null): number {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endTimeUnix) { setRemaining(0); return; }
    const update = () =>
      setRemaining(Math.max(0, endTimeUnix - Math.floor(Date.now() / 1000)));
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

// ── Candidate photo fallback ──────────────────────────────────────────────────

const PLACEHOLDER = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><rect width='60' height='60' fill='%231a3a7a'/><text x='30' y='40' font-size='28' text-anchor='middle' fill='%2390caf9'>👤</text></svg>`;

function handlePhotoError(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
}

// ── S1-NONE ───────────────────────────────────────────────────────────────────

function HomeNone() {
  const { isOwner } = useVoting();
  const [history, setHistory] = useState<VotingHistory[]>([]);
  const [canDeploy, setCanDeploy] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchVotingHistory().then((h) => setHistory(h.slice(0, 3))).catch(() => {});
    if (isOwner) {
      fetchPrecheck().then((r) => setCanDeploy(r.canDeploy)).catch(() => setCanDeploy(false));
    }
  }, [isOwner]);

  return (
    <div className={styles.page}>
      <div className={`${styles.section} ${styles.noneHero}`}>
        <div className={styles.noneIcon}>🗳️</div>
        <h2 className={styles.noneTitle}>현재 진행 중인 투표가 없습니다</h2>
        <p className={styles.noneSubtitle}>새로운 투표를 시작하려면 아래 버튼을 누르세요.</p>
        {isOwner && (
          <button
            className={styles.primaryBtn}
            disabled={canDeploy === false}
            onClick={() => navigate('/new')}
          >
            + 새 투표 만들기
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>과거 투표 목록 (최근 3건)</p>
          <ul className={styles.historyList}>
            {history.map((v, i) => (
              <li key={i} className={styles.historyItem}>
                <div>
                  <div className={styles.historyTitle}>{v.title}</div>
                  <div className={styles.historyMeta}>
                    {v.winnerName ? `${v.totalVotes}표 / ${v.winnerName} 당선` : `${v.totalVotes}표`}
                    {v.endedAt && ` · ${v.endedAt.slice(0, 10)}`}
                  </div>
                </div>
                <a
                  href={`${SEPOLIA_ETHERSCAN}/address/${v.contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.etherscanLink}
                >
                  상세 ↗
                </a>
              </li>
            ))}
          </ul>
          <Link to="/history" className={styles.viewAll}>전체 보기 ➡</Link>
        </div>
      )}
    </div>
  );
}

// ── S1-IDLE ───────────────────────────────────────────────────────────────────

function HomeIdle() {
  const { contractAddress } = useVoting();
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    fetchCandidates().then(setCandidates).catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      <div className={`${styles.section} ${styles.idleHero}`}>
        <div className={styles.idleIcon}>⏳</div>
        <h2 className={styles.idleTitle}>투표가 아직 시작되지 않았습니다</h2>
        <p className={styles.idleSub}>관리자가 투표를 게시할 때까지 기다려주세요.</p>
      </div>

      {candidates.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>현재 등록된 후보자 ({candidates.length}명)</p>
          <div className={styles.candidateGrid}>
            {candidates.map((c) => (
              <div key={c.id} className={styles.candidateCard}>
                <img
                  className={styles.candidatePhoto}
                  src={c.photoUrl}
                  alt={c.name}
                  onError={handlePhotoError}
                />
                <span className={styles.candidateName}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {contractAddress && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>컨트랙트 정보</p>
          <a
            href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}`}
            target="_blank"
            rel="noreferrer"
            className={styles.etherscanLink}
          >
            📜 {contractAddress.slice(0, 10)}…{contractAddress.slice(-6)} [Etherscan ↗]
          </a>
        </div>
      )}
    </div>
  );
}

// ── S1-ACTIVE ─────────────────────────────────────────────────────────────────

interface CandidateVote extends Candidate {
  votes: number;
}

function HomeActive() {
  const { contractAddress, endTime } = useVoting();
  const { address: walletAddress, provider, isSepolia } = useWallet();
  const navigate = useNavigate();
  const remaining = useCountdown(endTime);

  const [data, setData] = useState<CandidateVote[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const getProvider = useCallback(() => {
    if (provider) return provider;
    if (RPC_URL) return new ethers.JsonRpcProvider(RPC_URL);
    return null;
  }, [provider]);

  const fetchVoteData = useCallback(async () => {
    if (!contractAddress || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const p = getProvider();
      if (!p) return;

      const [candidates, contract] = await Promise.all([
        fetchCandidates(),
        Promise.resolve(new ethers.Contract(contractAddress, VOTING_ABI, p)),
      ]);

      const [ids, votes] = (await contract.getResults()) as [bigint[], bigint[]];
      const voteMap = new Map(ids.map((id, i) => [Number(id), Number(votes[i])]));

      const merged: CandidateVote[] = candidates.map((c) => ({
        ...c,
        votes: voteMap.get(c.id) ?? 0,
      }));
      setData(merged);

      // hasVoted 체크 (연결된 지갑이 있을 때)
      if (walletAddress && provider && isSepolia) {
        try {
          const signer = await provider.getSigner();
          const myContract = new ethers.Contract(contractAddress, VOTING_ABI, signer);
          const [voted] = (await myContract.getMyVote()) as [boolean, bigint];
          setHasVoted(voted);
        } catch {
          // getMyVote 실패 시 무시
        }
      }
    } catch {
      // 에러 시 현재 상태 유지
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [contractAddress, getProvider, walletAddress, provider, isSepolia]);

  useEffect(() => { void fetchVoteData(); }, [fetchVoteData]);
  usePolling(fetchVoteData, 5000);

  const totalVotes = data.reduce((s, c) => s + c.votes, 0);

  const barData: BarEntry[] = data.map((c) => ({ id: c.id, name: c.name, photoUrl: c.photoUrl, votes: c.votes }));
  const donutData: DonutEntry[] = data.map((c) => ({ name: c.name, votes: c.votes }));

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          데이터 로딩 중…
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Live 상태 바 */}
      <div className={styles.section}>
        <div className={styles.liveBar}>
          <div className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            📺 LIVE — 투표 진행 중
          </div>
          <div>
            <div className={styles.countdownLabel}>남은 시간</div>
            <div className={styles.countdown}>{formatTime(remaining)}</div>
          </div>
        </div>
      </div>

      {/* 총 투표 수 */}
      <div className={styles.section} style={{ textAlign: 'center' }}>
        <p className={styles.sectionTitle}>총 투표 수</p>
        <div className={styles.totalCounter}>
          {totalVotes}
          <span className={styles.totalCounterUnit}> 표</span>
        </div>
      </div>

      {/* 차트 */}
      <div className={styles.section}>
        <div className={styles.chartGrid}>
          <BarChart data={barData} totalVotes={totalVotes} />
          <DonutChart data={donutData} size={200} />
        </div>
      </div>

      {/* 투표 CTA */}
      <div className={styles.section}>
        <button
          className={styles.voteBtn}
          disabled={hasVoted}
          onClick={() => navigate('/vote')}
        >
          {hasVoted ? '✓ 이미 투표하셨습니다' : '🗳 투표하러 가기'}
        </button>
      </div>
    </div>
  );
}

// ── S8 ENDED (Phase 7 기본 구현, Phase 10에서 컨페티 추가) ────────────────────

function HomeEnded() {
  const { contractAddress } = useVoting();
  const [data, setData] = useState<CandidateVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const candidates = await fetchCandidates();

        if (contractAddress) {
          const p = RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null;
          if (p) {
            const contract = new ethers.Contract(contractAddress, VOTING_ABI, p);
            const [ids, votes] = (await contract.getResults()) as [bigint[], bigint[]];
            const voteMap = new Map(ids.map((id, i) => [Number(id), Number(votes[i])]));
            setData(candidates.map((c) => ({ ...c, votes: voteMap.get(c.id) ?? 0 })));
          } else {
            setData(candidates.map((c) => ({ ...c, votes: 0 })));
          }
        }

        // DB에서 결과 메타데이터 조회
        const res = await fetch(`${API_BASE}/votings`);
        if (res.ok) {
          const history = (await res.json()) as VotingHistory[];
          const latest = history[0];
          if (latest) {
            setEndedAt(latest.endedAt);
            setEndReason(latest.endReason);
          }
        }
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [contractAddress]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><div className={styles.spinner} />결과 집계 중…</div>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.votes - a.votes || a.id - b.id);
  const winner = sorted[0];
  const total = data.reduce((s, c) => s + c.votes, 0);

  return (
    <div className={styles.page}>
      <div className={`${styles.section} ${styles.endedHero}`}>
        <div className={styles.trophyIcon}>🏆</div>
        <h2 className={styles.endedTitle}>최종 결과 발표</h2>
        {winner && (
          <div className={styles.winnerCard}>
            <span className={styles.winnerBadge}>🎉 당선</span>
            <img
              className={styles.winnerPhoto}
              src={winner.photoUrl}
              alt={winner.name}
              onError={handlePhotoError}
            />
            <span className={styles.winnerName}>{winner.name}</span>
            <span className={styles.winnerVotes}>
              {winner.votes}표 ({total > 0 ? ((winner.votes / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
        )}
      </div>

      {/* 최종 순위표 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>최종 득표 순위</p>
        <table className={styles.endedTable}>
          <thead>
            <tr>
              <th>순위</th>
              <th>이름</th>
              <th>득표수</th>
              <th>비율</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c.id}>
                <td>{i + 1}위</td>
                <td>{c.name}</td>
                <td>{c.votes}표</td>
                <td>{total > 0 ? ((c.votes / total) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <DonutChart data={sorted.map((c) => ({ name: c.name, votes: c.votes }))} size={180} />
      </div>

      {/* 메타 정보 */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>투표 정보</p>
        <p className={styles.endedMeta}>
          총 {total}표 집계됨
          {endedAt && ` · 종료: ${endedAt.slice(0, 16).replace('T', ' ')} UTC`}
          {endReason && ` · ${endReason === 'timeup' ? '⏰ 시간 만료 (자동 종료)' : '🛑 관리자 수동 종료'}`}
        </p>
        {contractAddress && (
          <div className={styles.etherscanRow}>
            <a
              href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer"
              className={styles.etherscanLink}
            >
              컨트랙트 보기 ↗
            </a>
            <a
              href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}#events`}
              target="_blank"
              rel="noreferrer"
              className={styles.etherscanLink}
            >
              Voted 이벤트 전체 보기 ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Home — 상태 분기 ──────────────────────────────────────────────────────────

export default function Home() {
  const { state } = useVoting();

  if (state === 'NONE')    return <HomeNone />;
  if (state === 'IDLE')    return <HomeIdle />;
  if (state === 'ACTIVE')  return <HomeActive />;
  if (state === 'ENDED')   return <HomeEnded />;

  // UNKNOWN or loading
  return (
    <div className={styles.page}>
      <div className={styles.loading}>
        <div className={styles.spinner} />
        상태 확인 중…
      </div>
    </div>
  );
}
