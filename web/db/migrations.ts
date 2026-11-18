export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS records (owner TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(owner,kind,id))`,
  `CREATE TABLE IF NOT EXISTS jobs (owner TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER NOT NULL DEFAULT 0, error TEXT, PRIMARY KEY(owner,session_id))`,
  `CREATE TABLE IF NOT EXISTS requests (owner TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    key TEXT NOT NULL, fingerprint TEXT NOT NULL, session_id TEXT NOT NULL, PRIMARY KEY(owner,key))`,
  `CREATE INDEX IF NOT EXISTS records_owner_kind ON records(owner,kind,updated_at)`,
];
