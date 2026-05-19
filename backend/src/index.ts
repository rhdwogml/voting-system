import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { initDb, getDb } from './db/client';
import contractsRouter from './routes/contracts';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

app.use(cors());
app.use(express.json());
app.use('/api/uploads', express.static(UPLOAD_DIR));

// GET /api/health
app.get('/api/health', (_req, res) => {
  try {
    getDb().exec('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// GET /api/nonce?address=0x...
app.get('/api/nonce', (req, res) => {
  const address = req.query['address'] as string | undefined;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ error: 'Valid Ethereum address required (?address=0x...)' });
    return;
  }
  const nonce = uuidv4();
  getDb()
    .prepare('INSERT INTO nonces (nonce, address) VALUES (?, ?)')
    .run(nonce, address.toLowerCase());
  res.json({ nonce });
});

// Routes
app.use('/api/contracts', contractsRouter);

// 만료 nonce 정리 (5분마다)
function startNonceCleaner(): void {
  const FIVE_MINUTES = 5 * 60 * 1000;
  setInterval(() => {
    try {
      const result = getDb()
        .prepare("DELETE FROM nonces WHERE datetime(created_at) < datetime('now', '-5 minutes')")
        .run();
      if (result.changes > 0) {
        console.log(`[nonce cleaner] Deleted ${result.changes} expired nonce(s)`);
      }
    } catch (err) {
      console.error('[nonce cleaner] Error:', err);
    }
  }, FIVE_MINUTES);
}

function bootstrap(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  initDb();
  startNonceCleaner();
  app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
  });
}

bootstrap();
