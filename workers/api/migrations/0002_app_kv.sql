-- Armazenamento geral (substitui writes do Workers KV, que tem cota diária no Free)

CREATE TABLE IF NOT EXISTS app_kv (
  key TEXT PRIMARY KEY,
  value TEXT,
  meta TEXT,
  kind TEXT NOT NULL DEFAULT 'text',
  expires_at INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_kv_chunks (
  key TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, idx)
);
