-- One closed control purchase; does not alter existing orders or settings.
CREATE TABLE getplatinum_control (
 id INTEGER PRIMARY KEY CHECK(id=1),
 viewer_id TEXT REFERENCES viewer_accounts(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 armed_until INTEGER NOT NULL DEFAULT 0,
 order_id TEXT UNIQUE REFERENCES getplatinum_orders(order_id),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER, updated_by TEXT
);
INSERT INTO getplatinum_control(id) VALUES(1);
