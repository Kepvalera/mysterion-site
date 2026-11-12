-- Additive only. Public sales require an explicit owner action after rollout.
-- activated_at is retained on pause so late paid webhooks remain fulfillable.
CREATE TABLE digital_public_sales (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER, updated_by TEXT,
 activated_at INTEGER,
 CHECK(enabled=0 OR activated_at IS NOT NULL)
);
INSERT INTO digital_public_sales(id) VALUES(1);
