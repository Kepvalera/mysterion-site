-- Additive only. Existing single meetings retain their original schedule and room.
CREATE TABLE program_event_sessions (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL REFERENCES program_events(course_id),
 title TEXT NOT NULL,
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 10000),
 starts_at INTEGER NOT NULL CHECK(starts_at>0),
 timezone TEXT NOT NULL,
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
 speaker TEXT NOT NULL DEFAULT '',
 zoom_opens_at INTEGER NOT NULL CHECK(zoom_opens_at>0 AND zoom_opens_at<=starts_at+duration_minutes*60),
 room_mode TEXT NOT NULL DEFAULT 'common' CHECK(room_mode IN('common','own')),
 lifecycle TEXT NOT NULL DEFAULT 'scheduled' CHECK(lifecycle IN('scheduled','cancelled','completed')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX program_event_sessions_schedule ON program_event_sessions(course_id,position,starts_at,id);
CREATE TABLE program_event_session_secrets (
 session_id TEXT PRIMARY KEY REFERENCES program_event_sessions(id),
 zoom_url TEXT NOT NULL,
 zoom_password TEXT NOT NULL DEFAULT ''
);
-- A schedule edit can race a signed payment callback. Normalize only the newly
-- issued participation grant; do not rewrite the immutable order policy/history.
CREATE TRIGGER event_session_grant_end AFTER INSERT ON viewer_grants
WHEN NEW.course_id IS NOT NULL AND NEW.granted_by='getplatinum' AND NEW.source_order_id IS NOT NULL
BEGIN
 UPDATE viewer_grants SET sales_revision=sales_revision+1,expires_at=MAX(expires_at,COALESCE((SELECT MAX(s.starts_at+s.duration_minutes*60) FROM program_event_sessions s WHERE s.course_id=NEW.course_id AND s.lifecycle!='cancelled'),expires_at))
 WHERE id=NEW.id AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM viewer_orders o WHERE o.id=NEW.source_order_id AND o.status='paid')
 AND NOT EXISTS(SELECT 1 FROM getplatinum_refunds r WHERE r.order_id=NEW.source_order_id AND r.status=4)
 AND NOT EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=NEW.viewer_id AND b.kind='course' AND b.product_id=NEW.course_id);
END;

-- Schedule-only audit. No Zoom URL/password columns or request-body snapshots.
CREATE TABLE program_event_session_history (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES program_events(course_id),
 session_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 before_schedule TEXT, after_schedule TEXT, before_end INTEGER, after_end INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX event_session_history_course ON program_event_session_history(course_id,created_at);
