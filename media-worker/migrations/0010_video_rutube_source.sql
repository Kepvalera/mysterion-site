-- Add an optional Rutube source without rewriting existing video records.
ALTER TABLE videos ADD COLUMN rutube_ref TEXT;
