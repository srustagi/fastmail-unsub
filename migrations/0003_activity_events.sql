CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  subject_id TEXT,
  subject_label TEXT,
  detail TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS activity_events_user_created
  ON activity_events(user_email, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS activity_events_user_correlation
  ON activity_events(user_email, correlation_id);

INSERT OR IGNORE INTO activity_events (
  id, user_email, event_type, status, subject_id, subject_label, detail,
  metadata_json, correlation_id, created_at, completed_at
)
SELECT
  a.id,
  a.user_email,
  CASE WHEN a.method = 'trash' THEN 'trash' ELSE 'unsubscribe' END,
  a.status,
  a.subscription_id,
  s.display_name,
  a.detail,
  json_object('method', a.method, 'responseStatus', a.response_status),
  NULL,
  a.created_at,
  a.completed_at
FROM actions a
LEFT JOIN subscriptions s ON s.id = a.subscription_id;
