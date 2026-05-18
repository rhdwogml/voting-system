import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'voting.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  database.exec(schema);
  console.log('Database initialized:', DB_PATH);
}
