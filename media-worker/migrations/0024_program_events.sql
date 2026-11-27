-- Additive only. No existing program, order, grant, video or price is rewritten.
CREATE TABLE program_events (
 course_id TEXT PRIMARY KEY REFERENCES platform_courses(id),
 starts_at INTEGER NOT NULL, timezone TEXT NOT NULL,
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
 speaker TEXT NOT NULL DEFAULT '', speaker_photo TEXT NOT NULL DEFAULT '',
 capacity INTEGER CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 100000),
 registration_open INTEGER NOT NULL DEFAULT 0 CHECK(registration_open IN(0,1)),
 show_home INTEGER NOT NULL DEFAULT 0 CHECK(show_home IN(0,1)),
 lifecycle TEXT NOT NULL DEFAULT 'scheduled' CHECK(lifecycle IN('scheduled','completed')),
 zoom_opens_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE program_event_secrets (
 course_id TEXT PRIMARY KEY REFERENCES program_events(course_id),
 zoom_url TEXT NOT NULL, zoom_password TEXT NOT NULL DEFAULT ''
);
CREATE TABLE program_event_registrations (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES program_events(course_id),
 viewer_id TEXT NOT NULL REFERENCES viewer_accounts(id),
 registered_at INTEGER NOT NULL, order_id TEXT UNIQUE REFERENCES viewer_orders(id),
 seat_held INTEGER NOT NULL DEFAULT 1 CHECK(seat_held IN(0,1)),
 UNIQUE(course_id,viewer_id)
);
CREATE INDEX event_seats ON program_event_registrations(course_id,seat_held);
CREATE TRIGGER event_capacity_insert BEFORE INSERT ON program_event_registrations
WHEN NOT EXISTS(SELECT 1 FROM program_event_registrations WHERE course_id=NEW.course_id AND viewer_id=NEW.viewer_id)
AND EXISTS(SELECT 1 FROM program_events e WHERE e.course_id=NEW.course_id AND e.capacity IS NOT NULL AND
 (SELECT COUNT(*) FROM program_event_registrations r WHERE r.course_id=e.course_id AND r.seat_held=1)>=e.capacity)
BEGIN SELECT RAISE(ABORT,'event_capacity_full'); END;
CREATE TRIGGER event_capacity_update BEFORE UPDATE OF capacity ON program_events
WHEN NEW.capacity IS NOT NULL AND NEW.capacity<(SELECT COUNT(*) FROM program_event_registrations WHERE course_id=NEW.course_id AND seat_held=1)
BEGIN SELECT RAISE(ABORT,'event_capacity_below_reserved'); END;
-- Reservation and order binding run INSIDE the existing atomic order transaction.
-- A failed/uncertain payment never releases a seat on a local timeout.
CREATE TRIGGER event_order_reserve BEFORE INSERT ON viewer_orders
WHEN EXISTS(SELECT 1 FROM program_events WHERE course_id=NEW.course_id)
BEGIN
 SELECT RAISE(ABORT,'event_registration_closed') WHERE NOT EXISTS(
 SELECT 1 FROM program_events e JOIN platform_courses c ON c.id=e.course_id
 WHERE e.course_id=NEW.course_id AND e.registration_open=1 AND e.lifecycle='scheduled'
 AND e.starts_at>unixepoch() AND c.state='published' AND c.access='paid');
 SELECT RAISE(ABORT,'event_order_exists') WHERE EXISTS(SELECT 1 FROM program_event_registrations WHERE course_id=NEW.course_id AND viewer_id=NEW.viewer_id AND order_id IS NOT NULL);
 INSERT INTO program_event_registrations(id,course_id,viewer_id,registered_at)
 VALUES(NEW.id,NEW.course_id,NEW.viewer_id,NEW.created_at)
 ON CONFLICT(course_id,viewer_id) DO NOTHING;
END;
CREATE TRIGGER event_order_bind AFTER INSERT ON viewer_orders
WHEN EXISTS(SELECT 1 FROM program_events WHERE course_id=NEW.course_id)
BEGIN UPDATE program_event_registrations SET order_id=NEW.id WHERE course_id=NEW.course_id AND viewer_id=NEW.viewer_id AND order_id IS NULL; END;
-- Keep refunded seats reserved too: late notifications cannot oversell the event.
-- Releasing seats requires a future provider-confirmed cancellation workflow.
CREATE TABLE program_event_images (
 course_id TEXT PRIMARY KEY REFERENCES program_events(course_id),
 mime TEXT NOT NULL, bytes BLOB NOT NULL
);
-- For live participation, any confirmed monetary refund removes ONLY that
-- order's Zoom entitlement. Independent recording/manual grants are untouched.
CREATE TRIGGER event_refund_scope AFTER INSERT ON getplatinum_refunds
WHEN NEW.status=4 AND NEW.reason IS NULL AND NEW.amount_minor>0
BEGIN UPDATE viewer_grants SET revoked_at=unixepoch(),sales_revision=sales_revision+1
 WHERE source_order_id=NEW.order_id AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM program_events e WHERE e.course_id=viewer_grants.course_id); END;
CREATE TRIGGER event_refund_before_grant AFTER INSERT ON viewer_grants
WHEN NEW.source_order_id IS NOT NULL AND EXISTS(SELECT 1 FROM program_events WHERE course_id=NEW.course_id)
AND EXISTS(SELECT 1 FROM getplatinum_refunds WHERE order_id=NEW.source_order_id AND status=4 AND reason IS NULL AND amount_minor>0)
BEGIN UPDATE viewer_grants SET revoked_at=unixepoch(),sales_revision=sales_revision+1 WHERE id=NEW.id; END;

CREATE TRIGGER event_refund_confirmed_update AFTER UPDATE OF status ON getplatinum_refunds
WHEN OLD.status!=4 AND NEW.status=4 AND NEW.reason IS NULL AND NEW.amount_minor>0
BEGIN UPDATE viewer_grants SET revoked_at=unixepoch(),sales_revision=sales_revision+1
 WHERE source_order_id=NEW.order_id AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM program_events e WHERE e.course_id=viewer_grants.course_id); END;
