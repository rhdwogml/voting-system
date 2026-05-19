import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import { useVoting } from '../context/VotingContext';
import { useWallet } from '../context/WalletContext';
import { useToast } from '../components/common/Toast';
import { buildAdminHeaders } from '../lib/adminAuth';
import { API_BASE, fetchPrecheck } from '../lib/api';
import VotingArtifact from '../contracts/Voting.json' assert { type: 'json' };
import styles from './New.module.css';

const { abi, bytecode } = VotingArtifact as {
  abi: InterfaceAbi;
  bytecode: string;
  [k: string]: unknown;
};

type StepStatus = 'pending' | 'loading' | 'done' | 'error';

const STEP_LABELS = [
  '서명 대기 중',
  '트랜잭션 채굴 대기',
  '백엔드 등록',
  '후보자 등록 화면으로 이동',
];

function stepIcon(s: StepStatus) {
  if (s === 'done')    return '✓';
  if (s === 'error')   return '✕';
  if (s === 'loading') return null; // spinner
  return '○';
}

function stepClass(s: StepStatus) {
  if (s === 'done')    return styles.stepDone;
  if (s === 'error')   return styles.stepError;
  if (s === 'loading') return styles.stepLoading;
  return '';
}

export default function New() {
  const { state, refresh } = useVoting();
  const { address: walletAddress, provider } = useWallet();
  const navigate = useNavigate();
  const { showToast, dismissToast } = useToast();

  const [title, setTitle] = useState('');
  const [precheck, setPrecheck] = useState<{ canDeploy: boolean; reason: string } | null>(null);
  const [precheckLoading, setPrecheckLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [steps, setSteps] = useState<StepStatus[]>(['pending', 'pending', 'pending', 'pending']);
  const [orphan, setOrphan] = useState<{ address: string; txHash: string } | null>(null);

  const setStep = (i: number, s: StepStatus) =>
    setSteps((prev) => prev.map((v, idx) => (idx === i ? s : v)));

  // IDLE/ACTIVE 상태이면 / 로 리다이렉트 (AC-11)
  useEffect(() => {
    if (state === 'IDLE' || state === 'ACTIVE') {
      showToast('error', '진행 중인 투표가 있어 새 배포가 불가합니다.');
      navigate('/', { replace: true });
    }
  }, [state, navigate, showToast]);

  // 진입 시 precheck
  useEffect(() => {
    setPrecheckLoading(true);
    fetchPrecheck()
      .then(setPrecheck)
      .catch(() => setPrecheck({ canDeploy: false, reason: 'precheck 요청 실패' }))
      .finally(() => setPrecheckLoading(false));
  }, []);

  const titleTrimmed = title.trim();
  const canDeploy =
    !!precheck?.canDeploy &&
    titleTrimmed.length >= 1 &&
    titleTrimmed.length <= 50 &&
    !deploying &&
    !!provider &&
    !!walletAddress;

  async function handleDeploy() {
    if (!canDeploy || !provider || !walletAddress) return;
    setDeploying(true);
    setSteps(['pending', 'pending', 'pending', 'pending']);
    setOrphan(null);

    const loadingId = showToast('loading', '컨트랙트 배포 중…', 0);

    try {
      // Step 1 — MetaMask 서명 (factory.deploy)
      setStep(0, 'loading');
      let signer: ethers.Signer;
      let deployedContract: ethers.BaseContract;
      try {
        signer = await provider.getSigner();
        const factory = new ethers.ContractFactory(abi, bytecode, signer);
        deployedContract = await factory.deploy();
        setStep(0, 'done');
      } catch (err) {
        setStep(0, 'error');
        showToast('error', `서명 실패: ${(err as Error).message}`);
        return;
      }

      // Step 2 — 채굴 대기
      setStep(1, 'loading');
      let contractAddress: string;
      let txHash: string;
      try {
        await deployedContract.waitForDeployment();
        contractAddress = await deployedContract.getAddress();
        txHash = deployedContract.deploymentTransaction()?.hash ?? '';
        setStep(1, 'done');
      } catch (err) {
        setStep(1, 'error');
        showToast('error', `채굴 실패: ${(err as Error).message}`);
        return;
      }

      // Step 3 — 백엔드 등록
      setStep(2, 'loading');
      try {
        const adminHeaders = await buildAdminHeaders(walletAddress, signer!);
        const res = await fetch(`${API_BASE}/votings`, {
          method: 'POST',
          headers: { ...adminHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: titleTrimmed, contractAddress, txHash }),
        });
        if (!res.ok) throw new Error((await res.json() as { error: string }).error);
        setStep(2, 'done');
      } catch (err) {
        setStep(2, 'error');
        // Race 처리: 컨트랙트는 배포됐지만 백엔드 등록 실패
        setOrphan({ address: contractAddress, txHash });
        showToast('error', `백엔드 등록 실패: ${(err as Error).message}`);
        return;
      }

      // Step 4 — 이동
      setStep(3, 'loading');
      await refresh();
      setStep(3, 'done');
      dismissToast(loadingId);
      showToast('success', '배포 완료! 후보자를 등록해주세요.');
      navigate('/admin/candidates');
    } finally {
      setDeploying(false);
      dismissToast(loadingId);
    }
  }

  const anyStarted = steps.some((s) => s !== 'pending');

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>새 투표 만들기</h1>
        <p className={styles.subtitle}>세폴리아 테스트넷에 새 투표 컨트랙트를 배포합니다.</p>

        <div className={styles.infoBox}>
          ℹ 이 작업은 새로운 스마트 컨트랙트를 세폴리아에 배포합니다.<br />
          배포자가 이 투표의 관리자(owner)가 됩니다.
        </div>

        {walletAddress && (
          <p className={styles.deployer}>배포자: {walletAddress}</p>
        )}

        {/* 제목 입력 */}
        <label htmlFor="vote-title">투표 제목 *</label>
        <input
          id="vote-title"
          className={styles.input}
          placeholder="예: 2026년 5월 학급 임원 선거"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={50}
          disabled={deploying}
        />
        <div className={styles.charCount}>{titleTrimmed.length} / 50</div>

        {/* 사전 점검 */}
        <div className={styles.precheckBox}>
          <div>
            {precheckLoading ? (
              <span style={{ color: '#90caf9' }}>⟳ 사전 점검 중…</span>
            ) : precheck?.canDeploy ? (
              <span className={styles.checkOk}>✅ 활성 투표 없음 — 배포 가능</span>
            ) : (
              <span className={styles.checkFail}>❌ {precheck?.reason}</span>
            )}
          </div>
          <div className={styles.checkOk}>
            {provider ? '✅ MetaMask 연결됨 (Sepolia)' : <span className={styles.checkFail}>❌ MetaMask 미연결</span>}
          </div>
          <div className={styles.checkWarn}>⚠ 약 0.002 ETH 의 가스비가 발생합니다.</div>
        </div>

        {/* 배포 버튼 */}
        <button className={styles.deployBtn} disabled={!canDeploy} onClick={() => void handleDeploy()}>
          🚀 컨트랙트 배포하기 (MetaMask 서명 필요)
        </button>

        {/* 4단계 진행 인디케이터 */}
        {anyStarted && (
          <ol className={styles.steps}>
            {STEP_LABELS.map((label, i) => (
              <li key={i} className={`${styles.step} ${stepClass(steps[i])}`}>
                <span className={styles.stepIcon}>
                  {steps[i] === 'loading' ? (
                    <span className={styles.spinner} />
                  ) : (
                    stepIcon(steps[i])
                  )}
                </span>
                {i + 1}. {label}
              </li>
            ))}
          </ol>
        )}

        {/* Race 처리 — 3단계 실패 시 */}
        {orphan && (
          <div className={styles.raceBox}>
            <p className={styles.raceTitle}>⚠ 백엔드 등록 실패 — 고아 컨트랙트</p>
            <p>컨트랙트는 배포됐지만 백엔드 등록에 실패했습니다. 아래 정보를 기록해두세요.</p>
            <p className={styles.raceMono}>주소: {orphan.address}</p>
            <p className={styles.raceMono}>TxHash: {orphan.txHash}</p>
          </div>
        )}
      </div>
    </div>
  );
}
