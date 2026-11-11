-- Additive: existing prices, orders, payments and grants stay untouched.
CREATE TABLE access_blocks (
 viewer_id TEXT NOT NULL REFERENCES viewer_accounts(id),
 kind TEXT NOT NULL CHECK(kind IN ('video','course')), product_id TEXT NOT NULL,
 actor TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(viewer_id,kind,product_id)
);
CREATE TABLE display_currency_rates (
 id INTEGER PRIMARY KEY CHECK(id=1),
 eur_rub REAL, usd_rub REAL, revision INTEGER NOT NULL DEFAULT 1,
 CHECK(eur_rub IS NULL OR eur_rub>0), CHECK(usd_rub IS NULL OR usd_rub>0)
);
INSERT INTO display_currency_rates(id) VALUES(1);
CREATE INDEX access_participant_dates ON viewer_grants(viewer_id,revoked_at,expires_at);
