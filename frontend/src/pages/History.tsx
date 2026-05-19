import { useEffect, useState } from 'react';
import { fetchVotingHistory, type VotingHistory } from '../lib/api';
import styles from './History.module.css';

const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export default function History() {
  const [history, setHistory] = useState<VotingHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVotingHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          투표 이력 로딩 중…
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>과거 투표 전체 이력</h1>
        <p className={styles.sub}>세폴리아 블록체인에 기록된 모든 투표 결과</p>
      </div>

      {history.length === 0 ? (
        <div className={styles.empty}>아직 종료된 투표가 없습니다.</div>
      ) : (
        <>
          <p className={styles.count}>총 {history.length}건</p>
          <ul className={styles.list}>
            {history.map((v, i) => (
              <li key={i} className={styles.item}>
                <div className={styles.itemLeft}>
                  <div className={styles.itemTitle}>{v.title}</div>
                  <div className={styles.itemMeta}>
                    <div>📅 배포: {formatDate(v.deployedAt)}</div>
                    {v.endedAt && <div>⏱ 종료: {formatDate(v.endedAt)}</div>}
                    {v.endReason && (
                      <div className={styles.endReason}>
                        {v.endReason === 'timeup' ? '⏰ 시간 만료' : '🛑 수동 종료'}
                      </div>
                    )}
                    {v.winnerName ? (
                      <div className={styles.winner}>🏆 {v.winnerName} 당선</div>
                    ) : (
                      <div className={styles.noWinner}>결과 미집계</div>
                    )}
                  </div>
                  <a
                    href={`${SEPOLIA_ETHERSCAN}/address/${v.contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.ethLink}
                  >
                    {v.contractAddress.slice(0, 12)}…{v.contractAddress.slice(-6)} [Etherscan ↗]
                  </a>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div className={styles.totalLabel}>총 득표</div>
                  <div className={styles.totalVotes}>{v.totalVotes}</div>
                  <div className={styles.totalLabel}>표</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
