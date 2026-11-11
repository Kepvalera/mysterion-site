-- Additive. Keep the existing account/session/order foreign keys unchanged.
ALTER TABLE viewer_accounts ADD COLUMN telegram_only INTEGER NOT NULL DEFAULT 0 CHECK(telegram_only IN(0,1));
CREATE TABLE telegram_login_attempts (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, browser_hash TEXT NOT NULL UNIQUE,
 display_code TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN('ru','en')),
 video_id TEXT REFERENCES videos(id), expires_at INTEGER NOT NULL,
 telegram_id TEXT, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
 approved_at INTEGER, rejected_at INTEGER, consumed_at INTEGER, consume_nonce TEXT
);
CREATE INDEX telegram_login_expiry ON telegram_login_attempts(expires_at);
