-- Additive receipt metadata. Provider data is stored only when supplied;
-- no synthetic receipt number or success status is created here.
CREATE TABLE IF NOT EXISTS payment_receipts (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('getplatinum','tribute','tribute-digital','manual')),
 status TEXT NOT NULL DEFAULT 'pending',
 receipt_number TEXT,
 receipt_url TEXT,
 bank_status TEXT,
 fiscal_status TEXT,
 refund_status TEXT,
 amount_minor INTEGER,
 currency TEXT,
 buyer_email TEXT,
 received_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_receipts_order ON payment_receipts(order_id,received_at DESC);
CREATE INDEX IF NOT EXISTS payment_receipts_provider ON payment_receipts(provider,received_at DESC);
