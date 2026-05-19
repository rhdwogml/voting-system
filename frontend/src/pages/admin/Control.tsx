import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import { useVoting } from '../../context/VotingContext';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../components/common/Toast';
import { localInputToUnix, getMinDatetimeLocal, formatKST } from '../../lib/time';
import { parseContractError } from '../../lib/errors';
import VotingArtifact from '../../contracts/Voting.json' assert { type: 'json' };
import styles from './Control.module.css';

const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const SEPOLIA_ETHERSCAN = 'https://sepolia.etherscan.io';

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  IDLE:    { label: 'IDLE — 투표 시작 전',   cls: styles.badgeIdle },
  ACTIVE:  { label: 'ACTIVE — 진행 중',       cls: styles.badgeActive },
  ENDED:   { label: 'ENDED — 종료됨',         cls: styles.badgeEnded },
  NONE:    { label: '미배포',                  cls: styles.badgeNone },
  UNKNOWN: { label: '확인 중',                cls: styles.badgeNone },
};

export default function Control() {
  const { state, contractAddress, candidateCount, endTime, refresh } = useVoting();
  const { provider } = useWallet();
  const navigate = useNavigate();
  const { showToast, dismissToast } = useToast();

  const [endDatetime, setEndDatetime] = useState('');
  const [startBusy, setStartBusy] = useState(false);
  const [endBusy, setEndBusy] = useState(false);

  const { label: stateLabel, cls: stateCls } = STATE_BADGE[state] ?? STATE_BADGE['UNKNOWN'];
  const shortAddr = contractAddress
    ? `${contractAddress.slice(0, 10)}…${contractAddress.slice(-6)}`
    : '—';

  // ── 투표 시작 ──────────────────────────────────────────────────────────────
  async function handleStart() {
    if (!endDatetime || !provider || !contractAddress) return;
    const unixEnd = localInputToUnix(endDatetime);
    if (unixEnd <= Math.floor(Date.now() / 1000) + 4 * 60) {
      showToast('error', '종료 시각은 현재 시각 기준 최소 5분 이후여야 합니다.');
      return;
    }

    setStartBusy(true);
    const toastId = showToast('loading', '투표 시작 처리 중…', 0);
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);
      const tx = await (contract.startVoting as (t: number) => Promise<ethers.TransactionResponse>)(unixEnd);
      await tx.wait();
      await refresh();
      dismissToast(toastId);
      showToast('success', '투표가 시작되었습니다!');
      navigate('/admin');
    } catch (err) {
      dismissToast(toastId);
      showToast('error', parseContractError(err));
    } finally {
      setStartBusy(false);
    }
  }

  // ── 투표 강제 종료 ─────────────────────────────────────────────────────────
  async function handleEnd() {
    if (!confirm('투표를 지금 종료하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!provider || !contractAddress) return;

    setEndBusy(true);
    const toastId = showToast('loading', '투표 종료 처리 중…', 0);
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);
      const tx = await (contract.endVoting as () => Promise<ethers.TransactionResponse>)();
      await tx.wait();
      await refresh();
      dismissToast(toastId);
      showToast('success', '투표가 종료되었습니다.');
      navigate('/');
    } catch (err) {
      dismissToast(toastId);
      showToast('error', parseContractError(err));
    } finally {
      setEndBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>투표 제어</h1>
        <p className={styles.sub}>투표 시작 및 강제 종료</p>
      </div>

      {/* 현재 상태 정보 */}
      <div className={styles.card}>
        <div className={styles.statusRow}>
          <span className={styles.label}>현재 상태</span>
          <span className={`${styles.badge} ${stateCls}`}>{stateLabel}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>컨트랙트</span>
          {contractAddress ? (
            <a
              href={`${SEPOLIA_ETHERSCAN}/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer"
              className={styles.ethLink}
            >
              {shortAddr} ↗
            </a>
          ) : <span style={{ color: '#666' }}>없음</span>}
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>등록된 후보</span>
          <span>
            {candidateCount}명
            {state === 'IDLE' && candidateCount < 2 && (
              <span style={{ color: '#ffa726', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                △ 최소 2명 필요
              </span>
            )}
          </span>
        </div>
        {state === 'ACTIVE' && endTime && (
          <div className={styles.statusRow}>
            <span className={styles.label}>종료 예정</span>
            <span style={{ color: '#ffe082' }}>{formatKST(endTime)} (KST)</span>
          </div>
        )}
      </div>

      {/* ENDED — 비활성 안내 */}
      {state === 'ENDED' && (
        <div className={styles.card}>
          <div className={styles.endedMsg}>✅ 투표가 종료되었습니다. 더 이상 제어할 수 없습니다.</div>
        </div>
      )}

      {/* IDLE — 투표 시작 폼 */}
      {state === 'IDLE' && (
        <div className={styles.card}>
          <p className={styles.sectionTitle}>투표 시작</p>

          {candidateCount < 2 && (
            <div className={styles.candidateWarn}>
              ⚠ 후보자가 {candidateCount}명입니다. 투표를 시작하려면 최소 2명 이상 등록해야 합니다.
            </div>
          )}

          <label htmlFor="end-datetime">종료 일시 *</label>
          <input
            id="end-datetime"
            type="datetime-local"
            className={styles.dateInput}
            min={getMinDatetimeLocal()}
            value={endDatetime}
            onChange={(e) => setEndDatetime(e.target.value)}
            disabled={startBusy || candidateCount < 2}
          />
          <p className={styles.hint}>※ 현재 시각 기준 최소 5분 이후 선택 가능</p>

          <button
            className={styles.startBtn}
            disabled={!endDatetime || startBusy || candidateCount < 2 || !provider}
            onClick={() => void handleStart()}
          >
            {startBusy ? <><span className={styles.spinner} />처리 중…</> : '▶ 투표 시작하기 (MetaMask 서명)'}
          </button>
        </div>
      )}

      {/* ACTIVE — 강제 종료 */}
      {state === 'ACTIVE' && (
        <div className={styles.card}>
          <p className={styles.sectionTitle}>투표 강제 종료</p>
          <button
            className={styles.endBtn}
            disabled={endBusy || !provider}
            onClick={() => void handleEnd()}
          >
            {endBusy ? <><span className={styles.spinner} />처리 중…</> : '⏹ 투표 지금 종료하기 (수동 종료)'}
          </button>
          <p className={styles.warnText}>⚠ 종료 후에는 되돌릴 수 없습니다.</p>
        </div>
      )}

      {/* NONE — 컨트랙트 없음 */}
      {(state === 'NONE' || state === 'UNKNOWN') && (
        <div className={styles.card}>
          <div className={styles.endedMsg}>컨트랙트가 배포되지 않았습니다.</div>
        </div>
      )}
    </div>
  );
}
