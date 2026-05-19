import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import confetti from 'canvas-confetti';
import { useVoting } from '../context/VotingContext';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/common/Toast';
import { buildAdminHeaders } from '../lib/adminAuth';
import { API_BASE, fetchCandidates, fetchVotingHistory, type Candidate, type VotingHistory } from '../lib/api';
import DonutChart, { type DonutEntry } from '../components/charts/DonutChart';
import VotingArtifact from '../contracts/Voting.json' assert { type: 'json' };
import styles from './Result.module.css';

const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const RPC_URL = import.meta.env['VITE_RPC_URL'] as string | undefined;
const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';

const PLACEHOLDER =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='110' height='110'><rect width='110' height='110' fill='%231a3a7a'/><text x='55' y='72' font-size='56' text-anchor='middle' fill='%2390caf9'>👤</text></svg>";

interface CandidateVote extends Candidate { votes: number }

export default function Result() {
  const { state, contractAddress, isOwner } = useVoting();
  const { address: walletAddress, provider } = useWallet();
  const { showToast, dismissToast } = useToast();

  const [data, setData] = useState<CandidateVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyItem, setHistoryItem] = useState<VotingHistory | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const confettiFired = useRef(false);

  const savedKey = contractAddress ? `resultSaved_${contractAddress}` : null;
  const confettiKey = contractAddress ? `confetti_${contractAddress}` : null;

  // 결과 데이터 로드
  const loadData = useCallback(async () => {
    if (!contractAddress) { setLoading(false); return; }
    setLoading(true);
    try {
      const candidates = await fetchCandidates();

      // 체인에서 득표 조회
      const p = provider ?? (RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null);
      let merged: CandidateVote[] = candidates.map((c) => ({ ...c, votes: 0 }));
      if (p) {
        try {
          const contract = new ethers.Contract(contractAddress, VOTING_ABI, p);
          const [ids, votes] = (await contract.getResults()) as [bigint[], bigint[]];
          const voteMap = new Map(ids.map((id, i) => [Number(id), Number(votes[i])]));
          merged = candidates.map((c) => ({ ...c, votes: voteMap.get(c.id) ?? 0 }));
        } catch { /* RPC 실패 → votes=0 fallback */ }
      }
      setData(merged);

      // DB에서 결과 메타 조회 (종료 사유, 종료 시각)
      try {
        const history = await fetchVotingHistory();
        if (history.length > 0) setHistoryItem(history[0]);
      } catch { /* ignore */ }

      // localStorage에서 저장 여부 확인
      if (savedKey && localStorage.getItem(savedKey)) setResultSaved(true);
    } catch {
      // 에러 시 빈 배열
    } finally {
      setLoading(false);
    }
  }, [contractAddress, provider, savedKey]);

  useEffect(() => { void loadData(); }, [loadData]);

  // 컨페티 — 1회만 (localStorage 플래그)
  useEffect(() => {
    if (!confettiKey || confettiFired.current) return;
    if (localStorage.getItem(confettiKey)) return;
    confettiFired.current = true;
    localStorage.setItem(confettiKey, '1');
    void confetti({ particleCount: 200, spread: 90, origin: { x: 0.5, y: 0.45 } });
  }, [confettiKey]);

  // 결과 저장 (관리자 수동 트리거 or 자동)
  const handleSaveResult = useCallback(async () => {
    if (!walletAddress || !provider || !contractAddress || !savedKey) return;
    setSaveBusy(true);
    const toastId = showToast('loading', '결과 저장 중…', 0);
    try {
      const signer = await provider.getSigner();
      const headers = await buildAdminHeaders(walletAddress, signer);
      const res = await fetch(`${API_BASE}/votings/current/result`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endReason: 'timeup' }),
      });
      if (!res.ok) throw new Error((await res.json() as { error: string }).error);
      localStorage.setItem(savedKey, '1');
      setResultSaved(true);
      dismissToast(toastId);
      showToast('success', '결과가 DB에 저장되었습니다.');
      // history 갱신
      const history = await fetchVotingHistory();
      if (history.length > 0) setHistoryItem(history[0]);
    } catch (err) {
      dismissToast(toastId);
      showToast('error', `저장 실패: ${(err as Error).message}`);
    } finally {
      setSaveBusy(false);
    }
  }, [walletAddress, provider, contractAddress, savedKey, showToast, dismissToast]);

  // ENDED가 아닐 때 → 홈으로
  if (state === 'NONE' || state === 'IDLE' || state === 'ACTIVE') {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><div className={styles.spinner} />결과 집계 중…</div>
      </div>
    );
  }

  if (!contractAddress) {
    return <div className={styles.page}><div className={styles.noVote}>투표 이력이 없습니다.</div></div>;
  }

  const sorted = [...data].sort((a, b) => b.votes - a.votes || a.id - b.id);
  const winner = sorted[0];
  const total = data.reduce((s, c) => s + c.votes, 0);
  const donutData: DonutEntry[] = sorted.map((c) => ({ name: c.name, votes: c.votes }));

  const endReason = historyItem?.endReason ?? null;
  const endedAt = historyItem?.endedAt ?? null;

  return (
    <div className={styles.page}>
      {/* 당선자 히어로 */}
      <div className={styles.hero}>
        <p className={styles.heroTitle}>📺 최종 결과 발표</p>
        <h1 className={styles.mainTitle}>🏆 투표 종료</h1>

        {winner ? (
          <>
            <div className={styles.crownBadge}>👑 당선</div>
            <br />
            <img
              className={styles.winnerPhoto}
              src={winner.photoUrl}
              alt={winner.name}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }}
            />
            <div className={styles.winnerName}>{winner.name}</div>
            <div className={styles.winnerVotes}>
              {winner.votes}표 ({total > 0 ? ((winner.votes / total) * 100).toFixed(1) : 0}%)
            </div>
          </>
        ) : (
          <div style={{ color: '#90caf9' }}>득표 데이터가 없습니다.</div>
        )}
      </div>

      {/* 도넛 차트 + 순위표 */}
      <div className={styles.resultsGrid}>
        <div className={styles.card}>
          <p className={styles.cardTitle}>득표 분포</p>
          <DonutChart data={donutData} size={180} />
          <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#fff', marginTop: '0.75rem' }}>
            총 <strong>{total}</strong>표
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>최종 순위</p>
          <table className={styles.rankTable}>
            <thead>
              <tr>
                <th>순위</th>
                <th>이름</th>
                <th>득표</th>
                <th>비율</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr key={c.id} className={i === 0 ? styles.rankFirst : ''}>
                  <td><span className={styles.rankBadge}>{i + 1}위</span></td>
                  <td>{c.name}</td>
                  <td>{c.votes}표</td>
                  <td>{total > 0 ? ((c.votes / total) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 메타 정보 */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>투표 정보</p>
        <div className={styles.meta}>
          {endedAt && (
            <div>⏱ 종료 시각: {endedAt.slice(0, 16).replace('T', ' ')} UTC</div>
          )}
          {endReason && (
            <div>
              {endReason === 'timeup'
                ? '⏰ 종료 사유: 시간 만료 (자동 종료)'
                : '🛑 종료 사유: 관리자 수동 종료'}
            </div>
          )}
          <div>📋 모든 투표는 세폴리아 블록체인에 영구 기록되어 있습니다.</div>
        </div>
        <div className={styles.ethRow}>
          <a
            href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}`}
            target="_blank"
            rel="noreferrer"
            className={styles.ethLink}
          >
            컨트랙트 보기 ↗
          </a>
          <a
            href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}#events`}
            target="_blank"
            rel="noreferrer"
            className={styles.ethLink}
          >
            Voted 이벤트 전체 보기 ↗
          </a>
        </div>
      </div>

      {/* 관리자 전용 */}
      {isOwner && (
        <div className={styles.adminSection}>
          <span className={styles.adminLabel}>관리자 메뉴</span>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {resultSaved ? (
              <span className={styles.saveDone}>✓ 결과 저장 완료</span>
            ) : (
              <button
                className={styles.saveBtn}
                disabled={saveBusy || !provider}
                onClick={() => void handleSaveResult()}
              >
                {saveBusy ? <><span className={styles.btnSpinner} />저장 중…</> : '💾 결과 DB 저장'}
              </button>
            )}
            <Link to="/new" className={styles.newVoteBtn}>
              🚀 새 투표 만들기 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
