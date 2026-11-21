-- Additive speaker metadata for conference recordings.
ALTER TABLE videos ADD COLUMN speaker TEXT NOT NULL DEFAULT '';
