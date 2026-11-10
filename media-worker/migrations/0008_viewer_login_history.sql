CREATE TABLE viewer_login_history (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES viewer_accounts(id) ON DELETE CASCADE,
 logged_in_at INTEGER NOT NULL,
 ip_address TEXT,
 country TEXT,
 device TEXT NOT NULL,
 browser TEXT NOT NULL
);
CREATE INDEX viewer_login_history_account_time ON viewer_login_history(account_id,logged_in_at DESC);
CREATE INDEX viewer_login_history_retention ON viewer_login_history(logged_in_at);
