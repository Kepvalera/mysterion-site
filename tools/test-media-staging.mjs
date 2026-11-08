// Real LOCAL D1 emulator test. No remote command, provisioning, deployment or seed content.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const configPath='wrangler.staging.jsonc';
const source=await fs.readFile(configPath,'utf8');
const config=JSON.parse(source.replace(/^\s*\/\/.*$/gm,''));
assert.equal(config.d1_databases.length,1);
assert.equal(config.d1_databases[0].database_name,'mysterion-media-staging');
assert.equal(config.d1_databases[0].database_id,'d4966184-ae55-46cf-bf74-4dff1e7debdd');
assert.equal(config.d1_databases[0].binding,'MEDIA_DB');
assert.equal(config.d1_databases[0].migrations_dir,'media-worker/migrations');
assert.equal(config.d1_databases[0].migrations_table,'d1_migrations');
for(const key of ['main','pages_build_output_dir','env'])assert.ok(!(key in config));
for(const key of ['MEDIA_ENABLED','MEDIA_PAID_ENABLED','BUNNY_ENABLED','BUNNY_SECURITY_CONFIRMED'])assert.equal(config.vars[key],'false');

const wrangler=path.resolve('output/audit-tools/wrangler/node_modules/wrangler/bin/wrangler.js');
await fs.access(wrangler);
await fs.mkdir('output',{recursive:true});
const state=await fs.mkdtemp(path.join(root,'output/d1-staging-verification-'));
function run(args,json=false){
  // --local is appended here, not supplied by a caller. No remote option is accepted.
  assert.ok(!args.includes('--remote'));
  const result=spawnSync(process.execPath,[wrangler,'d1',...args,'--local','--config',configPath,'--persist-to',state,...(json?['--json']:[])],{
    cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,
    env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(state,'wrangler.log')}
  });
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Local Wrangler failed: '+result.stdout+'\n'+result.stderr);
  return json?JSON.parse(result.stdout):result.stdout;
}
const database='mysterion-media-staging';
run(['migrations','apply',database]);
const query=['execute',database,'--file','tools/check-media-staging.sql'];
const checks=run(query,true);
assert.equal(checks.length,7);
assert.ok(checks.every(check=>check.success));
const tables=checks[0].results.map(row=>row.name);
const expected=['audit_log','bunny_leases','entitlements','purchases','users','videos'];
for(const table of [...expected,'d1_migrations'])assert.ok(tables.includes(table));
assert.ok(!tables.includes('videos_bunny'));
assert.deepEqual(checks[1].results.map(row=>row.name),['0001_media.sql','0002_bunny_stream.sql']);
assert.deepEqual(checks[2].results,[]);
assert.equal(checks[3].results[0].quick_check,'ok');
const columns=checks[4].results.map(row=>row.name);
for(const column of ['source_type','bunny_library_id','bunny_status','bunny_progress','bunny_thumbnail','bunny_sync_at','bunny_delete_pending'])assert.ok(columns.includes(column));
assert.deepEqual(Object.keys(checks[5].results[0]).sort(),expected);
assert.ok(Object.values(checks[5].results[0]).every(count=>count===0));
assert.equal(checks[6].results[0].leftover_rebuild_tables,0);

run(['migrations','apply',database]);
const repeated=run(query,true);
assert.deepEqual(repeated[1].results,checks[1].results);
assert.ok(Object.values(repeated[5].results[0]).every(count=>count===0));
const report={mode:'LOCAL Cloudflare D1 emulator',database,databaseId:config.d1_databases[0].database_id,migrations:checks[1].results.map(row=>row.name),applicationTables:expected,empty:true,foreignKeyErrors:0,quickCheck:'ok',repeatedApply:'no duplicate migration',remoteCommands:0,productionChanges:0};
await fs.writeFile(path.join(state,'results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,report:path.join(state,'results.json')}));
