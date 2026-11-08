CREATE TABLE viewer_sessions (
 account_id TEXT PRIMARY KEY REFERENCES viewer_accounts(id), token_hash TEXT NOT NULL UNIQUE,
 credential_version INTEGER NOT NULL, created_at INTEGER NOT NULL,
 last_seen_at INTEGER NOT NULL, idle_expires_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE viewer_email_tokens (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES viewer_accounts(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 credential_version INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 consumed_at INTEGER, consumption_id TEXT
);
CREATE INDEX viewer_email_token_account ON viewer_email_tokens(account_id,purpose,expires_at);
CREATE TABLE viewer_rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX viewer_rate_expiry ON viewer_rate_limits(expires_at);
CREATE TABLE viewer_auth_events (
 id TEXT PRIMARY KEY, account_id TEXT REFERENCES viewer_accounts(id),
 action TEXT NOT NULL, created_at INTEGER NOT NULL
);
