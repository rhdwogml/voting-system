import { Router } from 'express';
import { getDb } from '../db/client';
import { chainReader } from '../services/chainReader';

const router = Router();

interface ContractRow {
  address: string;
  title: string;
}

// GET /api/contracts/current
router.get('/current', async (_req, res) => {
  const db = getDb();
  const contract = db
    .prepare('SELECT address, title FROM contract_deployments WHERE is_current = 1')
    .get() as ContractRow | undefined;

  // NONE 상태 — 배포 이력 없음
  if (!contract) {
    res.json({
      address: null,
      state: 'NONE',
      ownerAddress: process.env['OWNER_ADDRESS'] ?? null,
    });
    return;
  }

  // 체인에서 상태 + owner 조회
  let state = 'UNKNOWN';
  let ownerAddress: string | null = null;

  try {
    state = await chainReader.getState(contract.address);
    ownerAddress = await chainReader.getOwner(contract.address);
  } catch {
    // RPC 미설정 시 DB 정보만 반환
  }

  res.json({
    address: contract.address,
    state,
    title: contract.title,
    ownerAddress,
  });
});

export default router;
