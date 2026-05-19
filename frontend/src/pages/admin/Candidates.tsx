import { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import { useVoting } from '../../context/VotingContext';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../components/common/Toast';
import { buildAdminHeaders } from '../../lib/adminAuth';
import { API_BASE, fetchCandidates, type Candidate } from '../../lib/api';
import VotingArtifact from '../../contracts/Voting.json' assert { type: 'json' };
import styles from './Candidates.module.css';

const VOTING_ABI = (VotingArtifact as { abi: InterfaceAbi }).abi;
const PLACEHOLDER =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='%231a3a7a'/><text x='24' y='32' font-size='22' text-anchor='middle' fill='%2390caf9'>👤</text></svg>";

function handleImgErr(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
}

export default function Candidates() {
  const { state, contractAddress } = useVoting();
  const { address: walletAddress, provider } = useWallet();
  const { showToast, dismissToast } = useToast();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // 등록 폼 state
  const [name, setName] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 수정 폼 state
  const [editName, setEditName] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const isFormDisabled = state === 'ACTIVE' || state === 'ENDED';
  const isIdleState = state === 'IDLE' || state === 'NONE';

  const loadCandidates = useCallback(() => {
    setLoading(true);
    fetchCandidates()
      .then(setCandidates)
      .catch(() => showToast('error', '후보자 목록 조회 실패'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // ── 사진 선택 핸들러 ────────────────────────────────────────────────────────
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>, isEdit = false) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (isEdit) { setEditFile(file); setEditPreview(url); }
    else { setPhotoFile(file); setPreview(url); }
  }

  // ── 등록 ────────────────────────────────────────────────────────────────────
  async function handleRegister() {
    if (!name.trim() || !photoFile || !walletAddress || !provider || !contractAddress) return;
    setRegistering(true);
    const toastId = showToast('loading', '후보자 등록 중…', 0);

    try {
      const signer = await provider.getSigner();

      // 1. POST /candidates (multipart + admin headers)
      const adminHeaders = await buildAdminHeaders(walletAddress, signer);
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('photo', photoFile);

      const res = await fetch(`${API_BASE}/candidates`, {
        method: 'POST',
        headers: adminHeaders,
        body: formData,
      });

      if (!res.ok) {
        const err = (await res.json() as { error: string }).error;
        throw new Error(err);
      }

      const { id: pendingId } = (await res.json()) as { id: number };

      // 2. addCandidate() 트랜잭션
      const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);
      const tx = await (contract.addCandidate as () => Promise<ethers.TransactionResponse>)();
      const receipt = await tx.wait();

      // 3. CandidateAdded 이벤트에서 onChainId 추출
      const iface = new ethers.Interface(VOTING_ABI);
      let onChainId: number | null = null;
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = iface.parseLog({ topics: Array.from(log.topics as string[]), data: log.data });
          if (parsed?.name === 'CandidateAdded') {
            onChainId = Number(parsed.args[0]);
            break;
          }
        } catch { /* skip */ }
      }

      if (onChainId === null) throw new Error('onChainId 파싱 실패');

      // 4. PATCH /candidates/:onChainId (confirmed)
      const patchHeaders = await buildAdminHeaders(walletAddress, signer);
      const patchRes = await fetch(`${API_BASE}/candidates/${onChainId}`, {
        method: 'PATCH',
        headers: { ...patchHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId }),
      });

      if (!patchRes.ok) throw new Error('confirmed 처리 실패');

      dismissToast(toastId);
      showToast('success', `${name.trim()} 등록 완료 (ID: ${onChainId})`);
      setName(''); setPhotoFile(null); setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadCandidates();
    } catch (err) {
      dismissToast(toastId);
      showToast('error', `등록 실패: ${(err as Error).message}`);
    } finally {
      setRegistering(false);
    }
  }

  // ── 수정 (백엔드만) ────────────────────────────────────────────────────────
  async function handleEdit(id: number) {
    if (!walletAddress || !provider) return;
    const toastId = showToast('loading', '수정 중…', 0);
    try {
      const signer = await provider.getSigner();
      const adminHeaders = await buildAdminHeaders(walletAddress, signer);
      const formData = new FormData();
      if (editName.trim()) formData.append('name', editName.trim());
      if (editFile) formData.append('photo', editFile);

      const res = await fetch(`${API_BASE}/candidates/${id}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: formData,
      });

      if (!res.ok) throw new Error((await res.json() as { error: string }).error);

      dismissToast(toastId);
      showToast('success', '수정 완료');
      setEditingId(null); setEditName(''); setEditFile(null); setEditPreview(null);
      if (editFileRef.current) editFileRef.current.value = '';
      loadCandidates();
    } catch (err) {
      dismissToast(toastId);
      showToast('error', `수정 실패: ${(err as Error).message}`);
    }
  }

  // ── 삭제 (컨트랙트 + 백엔드) ────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!confirm(`후보자 ID ${id}를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    if (!walletAddress || !provider || !contractAddress) return;
    setDeletingId(id);
    const toastId = showToast('loading', '삭제 중…', 0);

    try {
      const signer = await provider.getSigner();

      // 1. removeCandidate() 트랜잭션
      const contract = new ethers.Contract(contractAddress, VOTING_ABI, signer);
      const tx = await (contract.removeCandidate as (id: number) => Promise<ethers.TransactionResponse>)(id);
      await tx.wait();

      // 2. DELETE /candidates/:id
      const adminHeaders = await buildAdminHeaders(walletAddress, signer);
      const res = await fetch(`${API_BASE}/candidates/${id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });

      if (!res.ok) throw new Error((await res.json() as { error: string }).error);

      dismissToast(toastId);
      showToast('success', '삭제 완료');
      loadCandidates();
    } catch (err) {
      dismissToast(toastId);
      showToast('error', `삭제 실패: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>후보자 관리</h1>
        <p className={styles.sub}>후보자 등록·수정·삭제 (IDLE 상태에서만 가능)</p>
      </div>

      {/* 등록 폼 */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>+ 새 후보자 등록</p>

        {isFormDisabled ? (
          <div className={styles.guardMsg}>
            ⚠ 투표가 {state === 'ACTIVE' ? '진행' : '종료'}된 상태에서는 후보자를 추가·삭제할 수 없습니다.
          </div>
        ) : (
          <>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>이름 *</label>
                <input
                  className={styles.input}
                  placeholder="후보자 이름"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={registering}
                />
              </div>
              <div className={styles.formGroup}>
                <label>사진 * (≤2MB, JPG/PNG/WebP)</label>
                <div className={styles.photoArea}>
                  <button
                    className={styles.photoBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={registering}
                    type="button"
                  >
                    📎 파일 선택
                  </button>
                  <input
                    ref={fileInputRef}
                    className={styles.fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handlePhotoChange(e)}
                  />
                  {preview && (
                    <img
                      className={styles.preview}
                      src={preview}
                      alt="미리보기"
                      onError={handleImgErr}
                    />
                  )}
                </div>
              </div>
            </div>

            <button
              className={styles.submitBtn}
              disabled={!name.trim() || !photoFile || registering || !contractAddress}
              onClick={() => void handleRegister()}
            >
              {registering ? (
                <><span className={styles.spinner} /> 등록 중…</>
              ) : (
                '등록하기 (Tx 서명 필요)'
              )}
            </button>
          </>
        )}
      </div>

      {/* 후보자 목록 */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>등록된 후보 ({candidates.length}명)</p>

        {loading ? (
          <p className={styles.emptyMsg}><span className={styles.spinner} /></p>
        ) : candidates.length === 0 ? (
          <p className={styles.emptyMsg}>등록된 후보자가 없습니다.</p>
        ) : (
          <ul className={styles.list}>
            {candidates.map((c) => (
              <li key={c.id} className={styles.item}>
                <img
                  className={styles.itemPhoto}
                  src={c.photoUrl}
                  alt={c.name}
                  onError={handleImgErr}
                />

                {editingId === c.id ? (
                  /* 인라인 수정 폼 */
                  <div className={styles.editRow}>
                    <input
                      className={styles.editInput}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={c.name}
                    />
                    <button
                      className={styles.photoBtn}
                      onClick={() => editFileRef.current?.click()}
                      type="button"
                    >
                      📎
                    </button>
                    <input
                      ref={editFileRef}
                      className={styles.fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handlePhotoChange(e, true)}
                    />
                    {editPreview && (
                      <img className={styles.preview} src={editPreview} alt="미리보기" onError={handleImgErr} />
                    )}
                    <button className={styles.saveBtn} onClick={() => void handleEdit(c.id)}>저장</button>
                    <button className={styles.cancelBtn} onClick={() => {
                      setEditingId(null); setEditName(''); setEditFile(null); setEditPreview(null);
                    }}>취소</button>
                  </div>
                ) : (
                  <>
                    <div className={styles.itemInfo}>
                      <div className={styles.itemId}>ID: {c.id}</div>
                      <div className={styles.itemName}>{c.name}</div>
                    </div>
                    <div className={styles.actions}>
                      <button
                        className={styles.editBtn}
                        disabled={isFormDisabled}
                        onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                      >
                        수정
                      </button>
                      <button
                        className={styles.deleteBtn}
                        disabled={!isIdleState || deletingId === c.id || !contractAddress}
                        onClick={() => void handleDelete(c.id)}
                      >
                        {deletingId === c.id ? <span className={styles.spinner} /> : '삭제'}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {candidates.length > 0 && state === 'IDLE' && (
          <p style={{ color: '#ffa726', fontSize: '0.8rem', marginTop: '0.75rem' }}>
            △ 투표가 시작되면 더 이상 추가·삭제할 수 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
