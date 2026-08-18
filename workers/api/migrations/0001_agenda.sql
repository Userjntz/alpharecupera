-- Agenda e avisos do painel (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS agenda_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'reuniao',
  color TEXT NOT NULL DEFAULT 'brand',
  date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  lead_id TEXT,
  lead_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  created_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_agenda_events_date ON agenda_events(date);
CREATE INDEX IF NOT EXISTS idx_agenda_events_lead ON agenda_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_agenda_events_created ON agenda_events(created_at);

CREATE TABLE IF NOT EXISTS panel_notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  active INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  created_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_panel_notices_active ON panel_notices(active, pinned);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
