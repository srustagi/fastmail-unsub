CREATE TABLE IF NOT EXISTS connections (
  user_email TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  account_id TEXT NOT NULL,
  api_url TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  last_scanned_at TEXT,
  last_scan_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  subscription_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  sender_domain TEXT NOT NULL,
  list_id TEXT,
  encrypted_unsubscribe_target TEXT,
  unsubscribe_method TEXT NOT NULL,
  one_click INTEGER NOT NULL DEFAULT 0,
  fastmail_recognized INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  inbox_count INTEGER NOT NULL DEFAULT 0,
  latest_subject TEXT,
  latest_received_at TEXT,
  latest_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_email, subscription_key)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_status
  ON subscriptions(user_email, status, latest_received_at DESC);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  response_status INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX IF NOT EXISTS actions_user_created
  ON actions(user_email, created_at DESC);
