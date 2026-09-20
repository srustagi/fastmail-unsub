CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  jmap_email_id TEXT NOT NULL,
  message_id TEXT,
  sender_address TEXT NOT NULL,
  subject TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_email, jmap_email_id),
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX IF NOT EXISTS messages_user_received
  ON messages(user_email, received_at DESC);

CREATE INDEX IF NOT EXISTS messages_subscription_received
  ON messages(subscription_id, received_at DESC);
