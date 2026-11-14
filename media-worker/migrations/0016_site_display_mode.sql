-- Additive display/routing state only; all existing records remain untouched.
CREATE TABLE site_display_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 mode TEXT NOT NULL DEFAULT 'main' CHECK(mode IN('main','services')),
 purchases_paused INTEGER NOT NULL DEFAULT 0 CHECK(purchases_paused IN(0,1)),
 content TEXT NOT NULL DEFAULT '{}',
 npd_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(npd_confirmed IN(0,1)),
 npd_confirmed_at INTEGER, npd_confirmed_by TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER, updated_by TEXT,
 CHECK(npd_confirmed=0 OR (npd_confirmed_at IS NOT NULL AND npd_confirmed_by IS NOT NULL))
);
INSERT INTO site_display_settings(id) VALUES(1);
