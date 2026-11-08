-- Read-only schema checks. Does not grant access or enable any site feature.
SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
SELECT name FROM d1_migrations ORDER BY name;
PRAGMA foreign_key_check;
PRAGMA quick_check;
PRAGMA table_info(videos);
SELECT (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM videos) AS videos,
       (SELECT COUNT(*) FROM purchases) AS purchases,
       (SELECT COUNT(*) FROM entitlements) AS entitlements,
       (SELECT COUNT(*) FROM audit_log) AS audit_log,
       (SELECT COUNT(*) FROM bunny_leases) AS bunny_leases;
SELECT COUNT(*) AS leftover_rebuild_tables FROM sqlite_master WHERE type='table' AND name='videos_bunny';
