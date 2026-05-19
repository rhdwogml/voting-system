import { Link } from 'react-router-dom';
import { useWallet } from '../../context/WalletContext';
import { useVoting } from '../../context/VotingContext';
import styles from './Navbar.module.css';

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    NONE:    { label: '대기중',   cls: styles.badgeNone },
    IDLE:    { label: '준비중',   cls: styles.badgeIdle },
    ACTIVE:  { label: 'LIVE',     cls: styles.badgeActive },
    ENDED:   { label: '종료',     cls: styles.badgeEnded },
    UNKNOWN: { label: '확인중',   cls: styles.badgeUnknown },
  };
  const { label, cls } = map[state] ?? map['UNKNOWN'];
  return (
    <span className={`${styles.badge} ${cls}`}>
      {state === 'ACTIVE' && <span className={styles.liveDot} />}
      {label}
    </span>
  );
}

export default function Navbar() {
  const { address, isConnected, isSepolia, switchToSepolia } = useWallet();
  const { contractTitle, state, isOwner } = useVoting();

  return (
    <div className={styles.wrapper}>
      {/* 네트워크 불일치 빨간 띠 */}
      {isConnected && !isSepolia && (
        <div className={styles.networkBanner}>
          ⚠ Sepolia 네트워크가 아닙니다.
          <button className={styles.switchBtn} onClick={() => void switchToSepolia()}>
            세폴리아로 전환
          </button>
        </div>
      )}

      <nav className={styles.bar}>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}>
          <span className={styles.title}>
            🗳 {contractTitle ?? 'Sepolia Vote'}
          </span>
        </Link>

        <StateBadge state={state} />

        <div className={styles.right}>
          {isConnected && address && (
            <>
              {isOwner && <span className={styles.adminTag}>관리자</span>}
              <span className={styles.address}>{truncate(address)}</span>
            </>
          )}
          {!isConnected && (
            <Link to="/connect" style={{ color: '#90caf9', fontSize: '0.85rem' }}>
              지갑 연결
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
