-- Additive. Apply only to a separately approved staging database.
ALTER TABLE viewer_accounts ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE viewer_accounts ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
