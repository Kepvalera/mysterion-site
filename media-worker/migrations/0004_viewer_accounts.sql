-- Additive only. Explicit staging approval required before remote application.
CREATE TABLE viewer_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 email_verified_at INTEGER, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','disabled')),
 credential_version INTEGER NOT NULL DEFAULT 1, locale TEXT NOT NULL CHECK(locale IN ('ru','en')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
-- No links to legacy users are created in this phase.
