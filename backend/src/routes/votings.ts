import { Router, Request, Response } from 'express';
import { getDb } from '../db/client';
import { adminAuth } from '../middleware/adminAuth';
import { chainReader } from '../services/chainReader';

const router = Router();

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface ContractDeploymentRow {
  id: number;
  address: string;
  title: string;
  deployed_by: string;
  deployed_at: string;
  ended_at: string | null;
  end_reason: string | null;
  winner_id: number | null;
  winner_name: string | null;
  total_votes: number;
  is_current: number;
}

interface CandidateNameRow {
  name: string;
}

// ── POST /api/votings/precheck — 배포 가능 여부 확인 (공개) ──────────────────
// Admin 전용이지만 서명 불필요 (페이지 진입 시 자동 호출)
router.post('/precheck', async (_req: Request, res: Response): Promise<void> => {
  const db = getDb();
  const current = db
    .prepare('SELECT address FROM contract_deployments WHERE is_current = 1')
    .get() as { address: string } | undefined;

  // 배포 이력 없음 → 배포 가능
  if (!current) {
    res.json({ canDeploy: true, reason: 'No contract deployed yet' });
    return;
  }

  // 체인에서 상태 조회
  try {
    const state = await chainReader.getState(current.address);
    if (state === 'ENDED') {
      res.json({ canDeploy: true, reason: 'Previous voting has ended' });
    } else {
      res.json({
        canDeploy: false,
        reason: `Contract is currently in ${state} state`,
      });
    }
  } catch {
    // RPC 미설정 시: 배포 이력이 있으면 보수적으로 불가 처리
    res.json({ canDeploy: false, reason: 'Cannot verify contract state (RPC unavailable)' });
  }
});

// ── POST /api/votings — 신규 컨트랙트 등록 (Admin) ──────────────────────────
router.post('/', adminAuth, (req: Request, res: Response): void => {
  const { title, contractAddress, txHash } = req.body as {
    title?: string;
    contractAddress?: string;
    txHash?: string;
  };
  const deployedBy = req.headers['x-wallet-address'] as string;

  if (!title?.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    res.status(400).json({ error: 'Valid contractAddress (0x...) is required' });
    return;
  }
  if (!txHash) {
    res.status(400).json({ error: 'txHash is required' });
    return;
  }

  const db = getDb();

  // 기존 is_current=1 레코드를 모두 0으로 변경
  db.prepare('UPDATE contract_deployments SET is_current = 0 WHERE is_current = 1').run();

  // 신규 레코드 삽입
  const result = db
    .prepare(
      `INSERT INTO contract_deployments
         (address, title, deployed_by, is_current)
       VALUES (?, ?, ?, 1)`
    )
    .run(contractAddress, title.trim(), deployedBy);

  const newId = Number(result.lastInsertRowid);

  res.status(201).json({
    id: newId,
    address: contractAddress,
    title: title.trim(),
    deployedBy,
    txHash,
  });
});

// ── GET /api/votings — 과거 투표 이력 (Public, is_current=0) ─────────────────
router.get('/', (_req: Request, res: Response): void => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM contract_deployments
       WHERE is_current = 0
       ORDER BY deployed_at DESC`
    )
    .all() as unknown as ContractDeploymentRow[];

  res.json(
    rows.map((r) => ({
      contractAddress: r.address,
      title: r.title,
      deployedBy: r.deployed_by,
      deployedAt: r.deployed_at,
      endedAt: r.ended_at,
      endReason: r.end_reason,
      winnerId: r.winner_id,
      winnerName: r.winner_name,
      totalVotes: r.total_votes,
    }))
  );
});

// ── PATCH /api/votings/current/result — 종료 결과 기록 (Admin) ──────────────
router.patch('/current/result', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const db = getDb();
  const current = db
    .prepare('SELECT * FROM contract_deployments WHERE is_current = 1')
    .get() as unknown as ContractDeploymentRow | undefined;

  if (!current) {
    res.status(404).json({ error: 'No active contract found' });
    return;
  }

  // 체인에서 결과 조회
  let resultData: { ids: number[]; votes: number[] };
  try {
    resultData = await chainReader.getResults(current.address);
  } catch {
    res.status(502).json({ error: 'Failed to fetch results from chain (check SEPOLIA_RPC_URL)' });
    return;
  }

  const { ids, votes } = resultData;
  const totalVotes = votes.reduce((sum, v) => sum + v, 0);

  // winner 계산: 최다 득표, 동점 시 최소 ID
  let winnerId: number | null = null;
  let winnerName: string | null = null;

  if (ids.length > 0 && totalVotes > 0) {
    let maxVotes = -1;
    for (let i = 0; i < ids.length; i++) {
      if (
        votes[i] > maxVotes ||
        (votes[i] === maxVotes && winnerId !== null && ids[i] < winnerId)
      ) {
        maxVotes = votes[i];
        winnerId = ids[i];
      }
    }

    // winner 이름 DB에서 조회
    if (winnerId !== null) {
      const candidateRow = db
        .prepare(`SELECT name FROM candidates WHERE id = ? AND status = 'confirmed'`)
        .get(winnerId) as CandidateNameRow | undefined;
      winnerName = candidateRow?.name ?? null;
    }
  }

  // end_reason: body에서 받거나 체인 endTime 기반 추론
  const bodyReason = (req.body as { endReason?: string }).endReason;
  let endReason: string;

  if (bodyReason === 'manual' || bodyReason === 'timeup') {
    endReason = bodyReason;
  } else {
    // endTime 조회하여 추론
    try {
      const contractEndTime = await chainReader.getEndTime(current.address);
      const nowSec = Math.floor(Date.now() / 1000);
      endReason = nowSec >= contractEndTime ? 'timeup' : 'manual';
    } catch {
      endReason = 'manual';
    }
  }

  const endedAt = new Date().toISOString();

  db.prepare(
    `UPDATE contract_deployments
     SET ended_at   = ?,
         end_reason = ?,
         winner_id  = ?,
         winner_name = ?,
         total_votes = ?
     WHERE is_current = 1`
  ).run(endedAt, endReason, winnerId, winnerName, totalVotes);

  res.json({
    endedAt,
    endReason,
    winnerId,
    winnerName,
    totalVotes,
  });
});

export default router;
