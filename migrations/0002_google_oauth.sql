CREATE TABLE google_oauth_state (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  next_path TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('it', 'en', 'es')),
  native_challenge TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX google_oauth_state_expiry_idx ON google_oauth_state(expires_at);

ALTER TABLE login_token ADD COLUMN native_challenge TEXT;
