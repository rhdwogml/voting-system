import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'voting.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  database.exec(schema);
  console.log('Database initialized:', DB_PATH);
}
