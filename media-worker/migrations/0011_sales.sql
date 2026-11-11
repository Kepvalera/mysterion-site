-- Additive only. Existing orders, participants and grants are untouched.
CREATE TABLE sales_products (
 kind TEXT NOT NULL CHECK(kind IN ('video','course')), product_id TEXT NOT NULL,
 sale_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sale_enabled IN (0,1)),
 policy TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(kind,product_id)
);
CREATE TABLE sales_orders (
 order_id TEXT PRIMARY KEY REFERENCES viewer_orders(id),
 source TEXT NOT NULL CHECK(source IN ('manual','tribute')),
 state TEXT NOT NULL CHECK(state IN ('pending','partial','paid','granted','cancelled','refunded')),
 policy TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 provider_uuid TEXT UNIQUE, shop_id INTEGER, payment_url TEXT,
 provider_stage TEXT NOT NULL DEFAULT 'new' CHECK(provider_stage IN ('new','creating','ready','uncertain')),
 last_payment_status TEXT
);
CREATE TABLE sales_payments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES sales_orders(order_id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), method TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('received','refunded')),
 created_at INTEGER NOT NULL
);
CREATE INDEX sales_payments_order ON sales_payments(order_id);
CREATE TABLE sales_operations (
 id TEXT PRIMARY KEY, nonce TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 target TEXT NOT NULL, request_hash TEXT NOT NULL, result TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX sales_operations_history ON sales_operations(created_at DESC);
CREATE TABLE sales_managers (
 access_sub TEXT PRIMARY KEY REFERENCES platform_staff(access_sub),
 active INTEGER NOT NULL CHECK(active IN (0,1))
);
CREATE TABLE sales_events (
 event_key TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES sales_orders(order_id),
 name TEXT NOT NULL, body_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
ALTER TABLE viewer_grants ADD COLUMN sales_revision INTEGER NOT NULL DEFAULT 1;
CREATE INDEX sales_video_orders ON viewer_orders(video_id,status);
CREATE INDEX sales_course_orders ON viewer_orders(course_id,status);
CREATE INDEX sales_video_grants ON viewer_grants(video_id,revoked_at,expires_at);
CREATE INDEX sales_course_grants ON viewer_grants(course_id,revoked_at,expires_at);
