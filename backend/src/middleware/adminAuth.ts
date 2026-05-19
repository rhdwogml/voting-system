import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { getDb } from '../db/client';
import { chainReader } from '../services/chainReader';

interface NonceRow {
  nonce: string;
  address: string;
  created_at: string;
  used: number;
}

interface ContractRow {
  address: string;
}

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const walletAddress = req.headers['x-wallet-address'] as string | undefined;
  const signature = req.headers['x-signature'] as string | undefined;
  const message = req.headers['x-message'] as string | undefined;

  if (!walletAddress || !signature || !message) {
    res.status(401).json({ error: 'Missing auth headers (X-Wallet-Address, X-Signature, X-Message)' });
    return;
  }

  // 1. 서명 복원 및 주소 검증
  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(401).json({ error: 'Signature mismatch' });
    return;
  }

  // 2. message에서 nonce 추출 (format: "admin-action:{nonce}:{timestamp}")
  const parts = message.split(':');
  const nonce = parts[1];
  if (!nonce) {
    res.status(401).json({ error: 'Invalid message format' });
    return;
  }

  const db = getDb();

  // 3. nonce 유효성 검증 — TTL 5분 체크를 DB에서 처리
  const nonceRecord = db
    .prepare(
      `SELECT * FROM nonces
       WHERE nonce = ?
         AND used = 0
         AND datetime(created_at) > datetime('now', '-5 minutes')`
    )
    .get(nonce) as NonceRow | undefined;

  if (!nonceRecord) {
    res.status(401).json({ error: 'Invalid, expired, or already used nonce' });
    return;
  }

  // 4. nonce 발급 주소 일치 확인
  if (nonceRecord.address.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(401).json({ error: 'Nonce address mismatch' });
    return;
  }

  // 5. nonce 사용 처리 (replay attack 방지)
  db.prepare('UPDATE nonces SET used = 1 WHERE nonce = ?').run(nonce);

  // 6. owner 검증
  const currentContract = db
    .prepare('SELECT address FROM contract_deployments WHERE is_current = 1')
    .get() as ContractRow | undefined;

  let ownerAddress: string;
  if (currentContract) {
    try {
      ownerAddress = await chainReader.getOwner(currentContract.address);
    } catch {
      res.status(500).json({ error: 'Failed to verify contract owner via RPC' });
      return;
    }
  } else {
    // NONE 상태: 환경변수 OWNER_ADDRESS로 검증
    ownerAddress = process.env.OWNER_ADDRESS ?? '';
    if (!ownerAddress) {
      res.status(500).json({ error: 'OWNER_ADDRESS not configured' });
      return;
    }
  }

  if (ownerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(403).json({ error: 'Not authorized: caller is not the owner' });
    return;
  }

  next();
}
