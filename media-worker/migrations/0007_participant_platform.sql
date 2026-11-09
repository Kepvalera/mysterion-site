-- Requires 0001 through 0006. No owner, participant, purchase or lesson is seeded.
-- Rebuild only the video CHECK constraint; all existing rows/relations are preserved.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE videos_platform (
 id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('sermon','testimony','conference','school')),
 year INTEGER NOT NULL,source_type TEXT NOT NULL CHECK(source_type IN ('youtube','vk','r2','bunny')),
 source_ref TEXT NOT NULL,access TEXT NOT NULL CHECK(access IN ('free','paid')),
 price_minor INTEGER NOT NULL DEFAULT 0 CHECK(price_minor>=0),currency TEXT NOT NULL DEFAULT 'EUR',
 state TEXT NOT NULL CHECK(state IN ('draft','published','deleted')),publish_at TEXT NOT NULL,
 cover_key TEXT,cover_type TEXT,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,mutation_id TEXT NOT NULL,
 bunny_library_id TEXT,bunny_status INTEGER,bunny_progress INTEGER,bunny_thumbnail TEXT,bunny_sync_at TEXT,
 bunny_delete_pending INTEGER NOT NULL DEFAULT 0,created_by TEXT
);
INSERT INTO videos_platform(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,cover_key,cover_type,revision,updated_at,mutation_id,bunny_library_id,bunny_status,bunny_progress,bunny_thumbnail,bunny_sync_at,bunny_delete_pending)
 SELECT id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,cover_key,cover_type,revision,updated_at,mutation_id,bunny_library_id,bunny_status,bunny_progress,bunny_thumbnail,bunny_sync_at,bunny_delete_pending FROM videos;
DROP TABLE videos;
ALTER TABLE videos_platform RENAME TO videos;
CREATE INDEX videos_catalog ON videos(state,publish_at DESC);
CREATE UNIQUE INDEX bunny_source_unique ON videos(bunny_library_id,source_ref) WHERE source_type='bunny' AND source_ref!='';
CREATE TABLE platform_staff(access_sub TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN ('owner','publisher','uploader')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE school_streams(number INTEGER PRIMARY KEY CHECK(number IN (3,4,5,6)));
INSERT INTO school_streams VALUES (3),(4),(5),(6);
CREATE TABLE platform_courses(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('school','conference','seminar','course')),stream INTEGER REFERENCES school_streams(number),access TEXT NOT NULL CHECK(access IN ('free','paid')),price_minor INTEGER NOT NULL CHECK(price_minor>=0),currency TEXT NOT NULL CHECK(currency IN ('EUR','USD','RUB')),state TEXT NOT NULL CHECK(state IN ('draft','published','archived')),revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE platform_lessons(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES platform_courses(id),title TEXT NOT NULL,description TEXT NOT NULL,video_id TEXT REFERENCES videos(id),position INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL CHECK(state IN ('draft','published')),public_preview INTEGER NOT NULL DEFAULT 0 CHECK(public_preview IN (0,1)),revision INTEGER NOT NULL DEFAULT 1);
CREATE INDEX platform_lessons_course ON platform_lessons(course_id,state,position);
CREATE TABLE platform_materials(id TEXT PRIMARY KEY,lesson_id TEXT NOT NULL REFERENCES platform_lessons(id),title TEXT NOT NULL,content TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE viewer_orders(id TEXT PRIMARY KEY,viewer_id TEXT NOT NULL REFERENCES viewer_accounts(id),course_id TEXT REFERENCES platform_courses(id),video_id TEXT REFERENCES videos(id),title TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),currency TEXT NOT NULL CHECK(currency IN ('EUR','USD','RUB')),status TEXT NOT NULL CHECK(status IN ('pending_payment','in_review','paid','rejected')),revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,reviewed_by TEXT,access_expires_at INTEGER,approval_id TEXT UNIQUE,CHECK((course_id IS NOT NULL)+(video_id IS NOT NULL)=1));
CREATE UNIQUE INDEX viewer_order_course_pending ON viewer_orders(viewer_id,course_id) WHERE course_id IS NOT NULL AND status IN ('pending_payment','in_review');
CREATE UNIQUE INDEX viewer_order_video_pending ON viewer_orders(viewer_id,video_id) WHERE video_id IS NOT NULL AND status IN ('pending_payment','in_review');
CREATE TABLE viewer_grants(id TEXT PRIMARY KEY,viewer_id TEXT NOT NULL REFERENCES viewer_accounts(id),course_id TEXT REFERENCES platform_courses(id),video_id TEXT REFERENCES videos(id),starts_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER,granted_by TEXT NOT NULL,source_order_id TEXT UNIQUE REFERENCES viewer_orders(id),created_at INTEGER NOT NULL,CHECK(expires_at>starts_at),CHECK((course_id IS NOT NULL)+(video_id IS NOT NULL)=1));
CREATE INDEX viewer_grants_viewer ON viewer_grants(viewer_id,expires_at,revoked_at);
CREATE TABLE platform_progress(viewer_id TEXT NOT NULL REFERENCES viewer_accounts(id),lesson_id TEXT NOT NULL REFERENCES platform_lessons(id),position_seconds INTEGER NOT NULL DEFAULT 0 CHECK(position_seconds>=0),completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),updated_at INTEGER NOT NULL,PRIMARY KEY(viewer_id,lesson_id));
CREATE TABLE platform_uploads(video_id TEXT PRIMARY KEY REFERENCES videos(id),location TEXT NOT NULL,file_size INTEGER NOT NULL CHECK(file_size>0),fingerprint TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE platform_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created_at INTEGER NOT NULL);
PRAGMA defer_foreign_keys = OFF;
