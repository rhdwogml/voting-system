import { Link } from 'react-router-dom';
import { useVoting } from '../../context/VotingContext';
import styles from './Dashboard.module.css';

const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';

const STATE_LABELS: Record<string, { label: string; cls: string }> = {
  NONE:    { label: '배포 없음', cls: styles.stateNone },
  IDLE:    { label: 'IDLE — 투표 시작 전', cls: styles.stateIdle },
  ACTIVE:  { label: 'ACTIVE — 투표 진행 중', cls: styles.stateActive },
  ENDED:   { label: 'ENDED — 투표 종료', cls: styles.stateEnded },
  UNKNOWN: { label: '확인 중', cls: styles.stateNone },
};

export default function Dashboard() {
  const { state, contractAddress, contractTitle, candidateCount } = useVoting();

  const canDeploy = state === 'NONE' || state === 'ENDED';
  const { label: stateLabel, cls: stateCls } = STATE_LABELS[state] ?? STATE_LABELS['UNKNOWN'];

  const shortAddr = contractAddress
    ? `${contractAddress.slice(0, 10)}…${contractAddress.slice(-6)}`
    : '—';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>관리자 콘솔</h1>
        <p className={styles.sub}>투표 관리 및 후보자 등록</p>
      </div>

      {/* 현재 상태 */}
      <div className={styles.infoCard}>
        <div className={styles.row}>
          <span className={styles.label}>현재 상태</span>
          <span className={`${styles.stateBadge} ${stateCls}`}>{stateLabel}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>투표 제목</span>
          <span>{contractTitle ?? '—'}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>컨트랙트</span>
          {contractAddress ? (
            <a
              href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer"
              className={styles.link}
            >
              {shortAddr} ↗
            </a>
          ) : (
            <span style={{ color: '#666' }}>없음</span>
          )}
        </div>
        <div className={styles.row}>
          <span className={styles.label}>등록된 후보</span>
          <span>
            {candidateCount}명
            {candidateCount < 2 && (
              <span style={{ color: '#ffa726', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                △ 최소 2명 필요
              </span>
            )}
          </span>
        </div>
      </div>

      {/* 네비게이션 카드 */}
      <div className={styles.navGrid}>
        <Link to="/admin/candidates" className={styles.navCard}>
          <div className={styles.navCardIcon}>👥</div>
          <div className={styles.navCardTitle}>후보자 관리</div>
          <div className={styles.navCardSub}>등록 / 수정 / 삭제</div>
        </Link>
        <Link to="/admin/control" className={styles.navCard}>
          <div className={styles.navCardIcon}>⏯</div>
          <div className={styles.navCardTitle}>투표 제어</div>
          <div className={styles.navCardSub}>시작 / 종료</div>
        </Link>
      </div>

      {/* 새 배포 */}
      <div className={styles.deploySection}>
        {canDeploy ? (
          <Link to="/new" className={styles.deployBtn}>
            🚀 새 투표 컨트랙트 배포
          </Link>
        ) : (
          <div className={`${styles.deployBtn} ${styles.disabled}`}>
            🚀 새 투표 컨트랙트 배포
          </div>
        )}
        {!canDeploy && (
          <p className={styles.deployHint}>
            현재 투표 진행 중 — ENDED 상태 이후에 배포 가능합니다.
          </p>
        )}
      </div>
    </div>
  );
}
