-- Operator-approved migration only. Wrangler D1 migrations run transactionally.
-- Preserve all existing rows, purchases, entitlements and audit references.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE videos_bunny (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('sermon','testimony','conference','school')),
 year INTEGER NOT NULL, source_type TEXT NOT NULL CHECK(source_type IN ('youtube','r2','bunny')),
 source_ref TEXT NOT NULL, access TEXT NOT NULL CHECK(access IN ('free','paid')),
 price_minor INTEGER NOT NULL DEFAULT 0 CHECK(price_minor >= 0), currency TEXT NOT NULL DEFAULT 'EUR',
 state TEXT NOT NULL CHECK(state IN ('draft','published','deleted')), publish_at TEXT NOT NULL,
 cover_key TEXT, cover_type TEXT, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, mutation_id TEXT NOT NULL,
 bunny_library_id TEXT, bunny_status INTEGER, bunny_progress INTEGER,
 bunny_thumbnail TEXT, bunny_sync_at TEXT, bunny_delete_pending INTEGER NOT NULL DEFAULT 0
);
INSERT INTO videos_bunny(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,cover_key,cover_type,revision,updated_at,mutation_id)
 SELECT id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,cover_key,cover_type,revision,updated_at,mutation_id FROM videos;
DROP TABLE videos;
ALTER TABLE videos_bunny RENAME TO videos;
CREATE INDEX videos_catalog ON videos(state,publish_at DESC);
CREATE UNIQUE INDEX bunny_source_unique ON videos(bunny_library_id,source_ref) WHERE source_type='bunny' AND source_ref!='';
CREATE TABLE bunny_leases(video_id TEXT PRIMARY KEY REFERENCES videos(id), lease_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX entitlements_lookup ON entitlements(user_id,video_id,revoked_at);
PRAGMA defer_foreign_keys = OFF;
