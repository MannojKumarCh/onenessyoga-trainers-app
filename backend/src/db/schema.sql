CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super_admin', 'sequence_creator', 'trainer')),
  zoom_link TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'Daily Session',
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  session_type TEXT DEFAULT 'BKP',
  assigned_trainer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  zoom_link TEXT,
  notes TEXT,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trainer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  topic TEXT NOT NULL,
  assigned_trainer_id INTEGER NOT NULL REFERENCES users(id),
  google_sheet_link TEXT,
  instructions TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'uploaded')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TEXT,
  notified_trainer_at TEXT,
  notified_team_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('folder', 'link')),
  parent_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  url TEXT,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sessions_trainer ON sessions(assigned_trainer_id);
CREATE INDEX IF NOT EXISTS idx_leaves_trainer ON leaves(trainer_id);
CREATE INDEX IF NOT EXISTS idx_sequences_week ON sequences(week_start_date);
CREATE INDEX IF NOT EXISTS idx_sequences_trainer ON sequences(assigned_trainer_id);
