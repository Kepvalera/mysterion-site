-- Visibility only: preserve video state, paid rights and all financial history.
CREATE TABLE video_archives (
 video_id TEXT PRIMARY KEY REFERENCES videos(id),
 archived_at INTEGER NOT NULL,
 archived_by TEXT NOT NULL
);
-- Protect BOTH administrative deletion APIs atomically, including concurrent links.
CREATE TRIGGER protect_linked_video_delete BEFORE UPDATE OF state,bunny_delete_pending ON videos
WHEN (NEW.state='deleted' OR NEW.bunny_delete_pending=1) AND (
 EXISTS(SELECT 1 FROM viewer_orders WHERE video_id=OLD.id) OR
 EXISTS(SELECT 1 FROM viewer_grants WHERE video_id=OLD.id) OR
 EXISTS(SELECT 1 FROM platform_lessons WHERE video_id=OLD.id))
BEGIN SELECT RAISE(ABORT,'video_has_dependencies'); END;
CREATE TRIGGER prevent_deleted_lesson_insert BEFORE INSERT ON platform_lessons
WHEN NEW.video_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM videos WHERE id=NEW.video_id AND state!='deleted' AND bunny_delete_pending=0)
BEGIN SELECT RAISE(ABORT,'video_not_available'); END;
CREATE TRIGGER prevent_deleted_lesson_update BEFORE UPDATE OF video_id ON platform_lessons
WHEN NEW.video_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM videos WHERE id=NEW.video_id AND state!='deleted' AND bunny_delete_pending=0)
BEGIN SELECT RAISE(ABORT,'video_not_available'); END;

CREATE TRIGGER prevent_deleted_order_insert BEFORE INSERT ON viewer_orders
WHEN NEW.video_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM videos WHERE id=NEW.video_id AND state!='deleted' AND bunny_delete_pending=0)
BEGIN SELECT RAISE(ABORT,'video_not_available'); END;
CREATE TRIGGER prevent_deleted_grant_insert BEFORE INSERT ON viewer_grants
WHEN NEW.video_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM videos WHERE id=NEW.video_id AND state!='deleted' AND bunny_delete_pending=0)
BEGIN SELECT RAISE(ABORT,'video_not_available'); END;
