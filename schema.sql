CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- 'email' или 'sms'
  sender TEXT,
  recipient TEXT,
  subject TEXT,
  body TEXT,
  html TEXT,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_kind ON messages(kind, id);
