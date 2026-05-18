import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDb, getDb } from './db/client';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

app.use(cors());
app.use(express.json());
app.use('/api/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (_req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

function bootstrap() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  initDb();
  app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
  });
}

bootstrap();
