CREATE TABLE IF NOT EXISTS candidates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  photo_path  TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contract_deployments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  address      TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  deployed_by  TEXT NOT NULL,
  deployed_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at     TEXT,
  end_reason   TEXT,
  winner_id    INTEGER,
  winner_name  TEXT,
  total_votes  INTEGER DEFAULT 0,
  is_current   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nonces (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nonce      TEXT NOT NULL UNIQUE,
  address    TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  used       INTEGER DEFAULT 0
);
