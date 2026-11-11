-- Additive only. No existing users, payments, orders, grants or rates changed.
CREATE TABLE telegram_account_links (
 telegram_id TEXT PRIMARY KEY, viewer_id TEXT NOT NULL UNIQUE REFERENCES viewer_accounts(id),
 linked_at INTEGER NOT NULL
);
CREATE TABLE telegram_link_attempts (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 viewer_id TEXT NOT NULL REFERENCES viewer_accounts(id), session_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, telegram_id TEXT, consumed_at INTEGER
);
CREATE TABLE digital_product_mappings (
 product_id INTEGER PRIMARY KEY CHECK(product_id>0), video_id TEXT NOT NULL REFERENCES videos(id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL CHECK(currency='RUB'),
 days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 3660), active INTEGER NOT NULL DEFAULT 0 CHECK(active IN(0,1)),
 payment_url TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE digital_integration_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL DEFAULT 'off' CHECK(mode IN('off','test','live')),
 test_viewer_id TEXT REFERENCES viewer_accounts(id), revision INTEGER NOT NULL DEFAULT 1,
 CHECK(mode!='test' OR test_viewer_id IS NOT NULL)
);
INSERT INTO digital_integration_settings(id) VALUES(1);
CREATE TABLE digital_purchase_receipts (
 purchase_id TEXT PRIMARY KEY, product_id INTEGER NOT NULL, transaction_id TEXT NOT NULL,
 telegram_id TEXT, currency TEXT NOT NULL,
 amount_minor INTEGER, purchased_at INTEGER, purchase_hash TEXT,
 refund_amount_minor INTEGER, refunded_at INTEGER, refund_hash TEXT,
 viewer_id TEXT REFERENCES viewer_accounts(id), video_id TEXT REFERENCES videos(id),
 mapping_revision INTEGER, days INTEGER, expected_amount_minor INTEGER,
 order_id TEXT UNIQUE REFERENCES sales_orders(order_id),
 reason TEXT NOT NULL DEFAULT 'pending', received_at INTEGER NOT NULL
);
CREATE INDEX digital_receipts_review ON digital_purchase_receipts(received_at DESC);
