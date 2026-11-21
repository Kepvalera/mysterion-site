-- Additive provider metadata. Existing CHECK constraints/tables are not rebuilt.
CREATE TABLE payment_provider_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 active_provider TEXT NOT NULL DEFAULT 'tribute' CHECK(active_provider IN('tribute','getplatinum')),
 gp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(gp_enabled IN(0,1)),
 gp_vat TEXT CHECK(gp_vat IN('none','0','5','7','10','22')),
 revision INTEGER NOT NULL DEFAULT 1,
 checked_at INTEGER, check_status TEXT NOT NULL DEFAULT 'unknown',
 updated_at INTEGER, updated_by TEXT
);
INSERT INTO payment_provider_settings(id) VALUES(1);
CREATE TABLE getplatinum_orders (
 order_id TEXT PRIMARY KEY REFERENCES viewer_orders(id),
 policy TEXT NOT NULL, video_revision INTEGER NOT NULL,vat TEXT NOT NULL,provider_revision INTEGER NOT NULL,
 stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN('new','creating','ready','uncertain','paid','failed','refunded','review')),
 payment_url TEXT, md_order INTEGER UNIQUE, paid_at INTEGER, reason TEXT,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE getplatinum_events (
 event_key TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES viewer_orders(id),
 type INTEGER NOT NULL, body_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
 reason TEXT
);
CREATE TABLE getplatinum_payments (
 md_order INTEGER PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES getplatinum_orders(order_id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),currency TEXT NOT NULL CHECK(currency='RUB'),
 confirmed_at INTEGER NOT NULL
);
CREATE TABLE getplatinum_refunds (
 refund_id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES getplatinum_orders(order_id),
 md_order INTEGER NOT NULL,status INTEGER NOT NULL CHECK(status IN(2,4)),
 amount_minor INTEGER,currency TEXT,body_hash TEXT NOT NULL,
 received_at INTEGER NOT NULL, reason TEXT
);
CREATE INDEX getplatinum_order_events ON getplatinum_events(order_id,created_at);
