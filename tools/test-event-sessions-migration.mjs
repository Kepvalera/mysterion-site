// Backup/restore rehearsal with generated LOCAL data only. No Production access.
import './seminar-offline-guard.mjs';
import {DatabaseSync,backup} from 'node:sqlite';import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {seminarFixture} from './seminar-local-fixture.mjs';
const f=await seminarFixture();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};const folder=path.resolve('output/migration-0025-rehearsal-'+Date.now());await fs.mkdir(folder,{recursive:true});
const snapshot=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+name+'"').all())).digest('hex')]));
try{
 const c=await f.event({free:true}),u=f.user();await f.data(f.call('events/'+c.id+'/register','POST',{request_id:crypto.randomUUID()},u));
 // Recreate the exact pre-migration schema. New tables are empty in this fixture.
 f.db.exec('DROP TRIGGER event_session_grant_end;DROP TABLE program_event_session_history;DROP TABLE program_event_session_secrets;DROP TABLE program_event_sessions;');
 const before=snapshot(f.db),schema=f.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const file=folder+'/before.sqlite';await backup(f.db,file);const read=new DatabaseSync(file,{readOnly:true});eq(snapshot(read),before);eq(read.prepare('PRAGMA integrity_check').get().integrity_check,'ok');read.close();
 const migration=await fs.readFile('media-worker/migrations/0025_program_event_sessions.sql','utf8');f.db.exec('BEGIN');f.db.exec(migration);f.db.exec('COMMIT');
 const after=snapshot(f.db);for(const [table,hash]of Object.entries(before))eq(after[table],hash);eq(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 // Independent restored copy is usable and accepts the migration too.
 await fs.copyFile(file,folder+'/restored.sqlite');const restored=new DatabaseSync(folder+'/restored.sqlite');eq(snapshot(restored),before);restored.exec(migration);eq(snapshot(restored),after);eq(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();
 console.log(JSON.stringify({checks,oldTablesPreserved:Object.keys(before).length,localBackupRestored:true,additive:true,productionBackup:false,productionWrites:0}));
}finally{f.close()}
