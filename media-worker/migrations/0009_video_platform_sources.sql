-- Add optional public platform links without rewriting legacy source_ref rows.
ALTER TABLE videos ADD COLUMN youtube_ref TEXT;
ALTER TABLE videos ADD COLUMN vk_ref TEXT;
