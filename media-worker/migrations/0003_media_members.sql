-- Apply explicitly to staging first. No automatic production migration.
CREATE TABLE collections (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('draft','published')), created_at TEXT NOT NULL
);
CREATE TABLE collection_videos (
 collection_id TEXT NOT NULL REFERENCES collections(id),
 video_id TEXT NOT NULL REFERENCES videos(id), position INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(collection_id,video_id)
);
-- Manual grants do not fabricate purchases or modify financial records.
CREATE TABLE manual_grants (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 video_id TEXT NOT NULL REFERENCES videos(id), expires_at TEXT NOT NULL,
 revoked_at TEXT, granted_by TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,video_id)
);
CREATE INDEX manual_grants_lookup ON manual_grants(user_id,video_id,revoked_at,expires_at);
CREATE TABLE membership_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
-- Optional custom artwork without provisioning an R2 bucket. Max 512 KiB at API boundary.
CREATE TABLE media_covers (video_id TEXT PRIMARY KEY REFERENCES videos(id), mime TEXT NOT NULL, bytes BLOB NOT NULL);
