import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import styles from './Connect.module.css';

export default function Connect() {
  const { connect, isConnected, isSepolia, switchToSepolia, isMetaMask } = useWallet();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      await connect();
    } catch (e) {
      setError((e as Error).message ?? '연결 실패');
    } finally {
      setLoading(false);
    }
  };

  // 이미 연결되고 Sepolia면 홈으로
  if (isConnected && isSepolia) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🗳️</div>
        <h1 className={styles.title}>세폴리아 투표 시스템</h1>
        <p className={styles.subtitle}>Sepolia Testnet Voting DApp</p>

        {/* 네트워크 전환 안내 */}
        {isConnected && !isSepolia && (
          <button className={styles.connectBtn} onClick={() => void switchToSepolia()}>
            ⚠ 세폴리아 네트워크로 전환
          </button>
        )}

        {/* 지갑 연결 */}
        {!isConnected && (
          <button
            className={styles.connectBtn}
            onClick={() => void handleConnect()}
            disabled={loading || !isMetaMask}
          >
            🦊 {loading ? '연결 중…' : '메타마스크 연결하기'}
          </button>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.links}>
          {!isMetaMask && (
            <p className={styles.hint}>
              ⚠ MetaMask가 필요합니다.{' '}
              <a
                href="https://metamask.io/download"
                target="_blank"
                rel="noreferrer"
              >
                설치하러 가기
              </a>
            </p>
          )}
          <p className={styles.hint}>
            △ 네트워크: Sepolia Testnet (Chain ID 11155111)
          </p>
          <p className={styles.hint}>
            ℹ 테스트 ETH가 필요하신가요?{' '}
            <a
              href="https://sepoliafaucet.com"
              target="_blank"
              rel="noreferrer"
            >
              Faucet 바로가기
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
