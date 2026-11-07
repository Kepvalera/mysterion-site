-- Apply to a NEW staging D1 database first. Never applied automatically.
PRAGMA foreign_keys = ON;
CREATE TABLE users (id TEXT PRIMARY KEY, access_sub TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE videos (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('sermon','testimony','conference','school')),
 year INTEGER NOT NULL, source_type TEXT NOT NULL CHECK(source_type IN ('youtube','r2')),
 source_ref TEXT NOT NULL, access TEXT NOT NULL CHECK(access IN ('free','paid')),
 price_minor INTEGER NOT NULL DEFAULT 0 CHECK(price_minor >= 0), currency TEXT NOT NULL DEFAULT 'EUR',
 state TEXT NOT NULL CHECK(state IN ('draft','published','deleted')), publish_at TEXT NOT NULL,
 cover_key TEXT, cover_type TEXT, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, mutation_id TEXT NOT NULL
);
CREATE INDEX videos_catalog ON videos(state, publish_at DESC);
CREATE TABLE purchases (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), video_id TEXT NOT NULL REFERENCES videos(id), provider_reference TEXT UNIQUE, status TEXT NOT NULL CHECK(status IN ('pending','paid','refunded')), amount_minor INTEGER NOT NULL, currency TEXT NOT NULL);
CREATE TABLE entitlements (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), video_id TEXT NOT NULL REFERENCES videos(id), purchase_id TEXT REFERENCES purchases(id), expires_at TEXT, revoked_at TEXT, UNIQUE(user_id,video_id));
CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), video_id TEXT NOT NULL REFERENCES videos(id), action TEXT NOT NULL, created_at TEXT NOT NULL);
