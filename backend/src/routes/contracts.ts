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

  if (!contract) {
    res.json({ address: null, state: 'NONE' });
    return;
  }

  try {
    const state = await chainReader.getState(contract.address);
    res.json({ address: contract.address, state, title: contract.title });
  } catch {
    // RPC 미설정 또는 오류 시 주소만 반환
    res.json({ address: contract.address, state: 'UNKNOWN', title: contract.title });
  }
});

export default router;
