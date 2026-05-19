import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { getDb } from '../db/client';
import { adminAuth } from '../middleware/adminAuth';
import { chainReader } from '../services/chainReader';

const UPLOAD_DIR = path.resolve(process.env['UPLOAD_DIR'] || './uploads');

// ── Multer 설정 ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP images are allowed'));
    }
  },
});

// addCandidate() 함수 셀렉터 (인자 없음)
const ADD_CANDIDATE_DATA = new ethers.Interface([
  'function addCandidate()',
]).encodeFunctionData('addCandidate');

const router = Router();

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface CandidateRow {
  id: number;
  name: string;
  photo_path: string;
  status: string;
  is_active: number;
  created_at: string;
}

interface ContractRow {
  address: string;
}

function photoUrl(req: Request, filename: string): string {
  return `${req.protocol}://${req.get('host')}/api/uploads/${filename}`;
}

// ── POST /api/candidates — 후보자 등록 (Admin) ───────────────────────────────
router.post(
  '/',
  adminAuth,
  (req: Request, res: Response): void => {
    upload.single('photo')(req, res, (multerErr: unknown) => {
      if (multerErr) {
        res.status(400).json({ error: (multerErr as Error).message });
        return;
      }

      const name = (req.body as { name?: string }).name?.trim();
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'photo is required' });
        return;
      }

      const db = getDb();
      const result = db
        .prepare('INSERT INTO candidates (name, photo_path) VALUES (?, ?)')
        .run(name, req.file.filename);

      const pendingId = Number(result.lastInsertRowid);
      res.status(201).json({
        id: pendingId,
        name,
        photoUrl: photoUrl(req, req.file.filename),
        status: 'pending',
        txData: ADD_CANDIDATE_DATA,
      });
    });
  }
);

// ── GET /api/candidates — 후보자 목록 (Public, confirmed+active만) ─────────
router.get('/', (req: Request, res: Response): void => {
  const rows = getDb()
    .prepare(
      `SELECT * FROM candidates
       WHERE status = 'confirmed' AND is_active = 1
       ORDER BY id ASC`
    )
    .all() as unknown as CandidateRow[];

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      photoUrl: photoUrl(req, r.photo_path),
      isActive: r.is_active === 1,
    }))
  );
});

// ── GET /api/candidates/:id — 단일 조회 (Public) ────────────────────────────
router.get('/:id', (req: Request, res: Response): void => {
  const id = Number(req.params['id']);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const row = getDb()
    .prepare(`SELECT * FROM candidates WHERE id = ? AND status != 'deleted'`)
    .get(id) as CandidateRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  res.json({
    id: row.id,
    name: row.name,
    photoUrl: photoUrl(req, row.photo_path),
    isActive: row.is_active === 1,
    status: row.status,
  });
});

// ── PATCH /api/candidates/:id — pending→confirmed 확정 (Admin) ───────────────
// URL :id = onChainId (컨트랙트에서 발급된 ID)
// body.pendingId = POST 응답으로 받은 백엔드 임시 rowid
router.patch(
  '/:id',
  adminAuth,
  (req: Request, res: Response): void => {
    const onChainId = Number(req.params['id']);
    const { pendingId } = req.body as { pendingId?: number };

    if (isNaN(onChainId) || pendingId === undefined || isNaN(Number(pendingId))) {
      res
        .status(400)
        .json({ error: 'onChainId (URL) and pendingId (body) are required numbers' });
      return;
    }

    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM candidates WHERE id = ? AND status = 'pending'`)
      .get(Number(pendingId)) as CandidateRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Pending candidate not found' });
      return;
    }

    // PRIMARY KEY를 onChainId로 갱신 (SQLite는 INTEGER PRIMARY KEY 업데이트 허용)
    db.prepare(
      `UPDATE candidates SET id = ?, status = 'confirmed' WHERE id = ?`
    ).run(onChainId, Number(pendingId));

    res.json({ id: onChainId, name: row.name, status: 'confirmed' });
  }
);

// ── DELETE /api/candidates/:id — 후보자 삭제 (Admin, IDLE 상태에서만) ────────
router.delete(
  '/:id',
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params['id']);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    const db = getDb();
    const row = db
      .prepare(
        `SELECT * FROM candidates
         WHERE id = ? AND status = 'confirmed' AND is_active = 1`
      )
      .get(id) as CandidateRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Candidate not found or already deleted' });
      return;
    }

    // 컨트랙트 상태 확인 — IDLE이어야만 삭제 가능
    const currentContract = db
      .prepare('SELECT address FROM contract_deployments WHERE is_current = 1')
      .get() as ContractRow | undefined;

    if (currentContract) {
      try {
        const state = await chainReader.getState(currentContract.address);
        if (state !== 'IDLE') {
          res
            .status(403)
            .json({ error: `Cannot delete candidate: contract state is ${state}` });
          return;
        }
      } catch {
        res.status(500).json({ error: 'Failed to check contract state via RPC' });
        return;
      }
    }

    // 소프트 삭제
    db.prepare(
      `UPDATE candidates SET is_active = 0, status = 'deleted' WHERE id = ?`
    ).run(id);

    // 사진 파일 삭제
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, row.photo_path));
    } catch {
      // 파일이 없어도 계속 진행
    }

    res.json({ id, deleted: true });
  }
);

// ── pending 후보자 정리 (서버 시작 시 + 5분마다 호출) ───────────────────────
export function cleanupPendingCandidates(): void {
  try {
    const db = getDb();
    const stale = db
      .prepare(
        `SELECT id, photo_path FROM candidates
         WHERE status = 'pending'
           AND datetime(created_at) < datetime('now', '-5 minutes')`
      )
      .all() as { id: number; photo_path: string }[];

    for (const row of stale) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, row.photo_path));
      } catch {
        // 파일 없으면 무시
      }
      db.prepare('DELETE FROM candidates WHERE id = ?').run(row.id);
    }

    if (stale.length > 0) {
      console.log(`[pending cleanup] Deleted ${stale.length} stale pending candidate(s)`);
    }
  } catch (err) {
    console.error('[pending cleanup] Error:', err);
  }
}

export default router;
