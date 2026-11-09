import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const name of ['0001_media.sql','0002_bunny_stream.sql','0003_media_members.sql','0004_viewer_accounts.sql','0005_viewer_sessions.sql'])db.exec(await fs.readFile('media-worker/migrations/'+name,'utf8'));
db.exec(`INSERT INTO users VALUES ('legacy-user','legacy-verified-sub','admin',1);
INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,state,publish_at,updated_at,mutation_id) VALUES ('legacy-video','{"ru":"Local","en":"Local","de":"Keep DE"}','{"ru":"","en":"","de":"Keep description"}','sermon',2026,'youtube','abcdefghijk','free','published','2026-01-01','2026-01-01','local');
INSERT INTO purchases VALUES ('legacy-purchase','legacy-user','legacy-video',NULL,'paid',100,'EUR');
INSERT INTO entitlements VALUES ('legacy-grant','legacy-user','legacy-video','legacy-purchase',NULL,NULL);
INSERT INTO audit_log VALUES ('legacy-audit','legacy-user','legacy-video','test','2026-01-01');
INSERT INTO collections VALUES ('legacy-collection','{}','{}','published','2026-01-01');
INSERT INTO collection_videos VALUES ('legacy-collection','legacy-video',1);
INSERT INTO manual_grants VALUES ('legacy-manual','legacy-user','legacy-video','2027-01-01',NULL,'legacy-user','local test','2026-01-01');
INSERT INTO media_covers VALUES ('legacy-video','image/png',X'89504E47');
INSERT INTO bunny_leases VALUES ('legacy-video','test-lease',1);
INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at) VALUES ('viewer','fixture@example.invalid','existing-encoded-password',1,'active','ru',1,1);
INSERT INTO viewer_sessions VALUES ('viewer','existing-token-hash',1,1,1,9999999999,9999999999);`);
const tables=['users','videos','purchases','entitlements','audit_log','collections','collection_videos','manual_grants','media_covers','bunny_leases','viewer_accounts','viewer_sessions'],before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
for(const name of ['0006_viewer_profile.sql','0007_participant_platform.sql']){db.exec('BEGIN');try{db.exec(await fs.readFile('media-worker/migrations/'+name,'utf8'));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
let checks=0;for(const t of tables){const after=db.prepare('SELECT * FROM '+t).all();for(const [i,row] of before[t].entries())for(const [key,v] of Object.entries(row)){assert.deepEqual(after[i][key],v,t+'.'+key);checks++}}
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_staff').get().n,0);assert.deepEqual(db.prepare('SELECT number FROM school_streams ORDER BY number').all().map(x=>x.number),[3,4,5,6]);checks+=3;
console.log(JSON.stringify({checks,migrations:['0006','0007'],preserved:tables,ownerAutomaticallyCreated:false,foreignKeyViolations:0,remoteWrites:0}));db.close();
