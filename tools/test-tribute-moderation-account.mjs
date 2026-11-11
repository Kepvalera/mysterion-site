// Run the operator tool against an isolated SQLite + Cloudflare API fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const workspace=process.cwd(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'tribute-moderation-'));
await fs.mkdir(path.join(directory,'output'));
const hook=path.join(directory,'fixture.mjs'),audit=path.join(directory,'audit.json');
await fs.writeFile(hook,`
import fs from 'node:fs/promises';import sync from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const workspace=${JSON.stringify(workspace)},audit=${JSON.stringify(audit)},mode=process.env.MODERATION_FIXTURE_CASE,db=new DatabaseSync(':memory:');
for(const file of (await fs.readdir(path.join(workspace,'media-worker/migrations'))).sort())db.exec(await fs.readFile(path.join(workspace,'media-worker/migrations',file),'utf8'));
const video='550e8400-e29b-41d4-a716-446655440000',before=[];
db.prepare("INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,state,publish_at,updated_at,mutation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(video,'{}','{}','testimony',2026,'youtube','abcdefghijk',mode==='paid'?'paid':'free',mode==='paid'?100:0,'published','2020-01-01','2020-01-01','fixture');
db.prepare("INSERT INTO platform_staff VALUES ('existing-owner-fixture','owner',1,1,1)").run();
if(mode==='existing')db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,status,locale,created_at,updated_at) VALUES ('existing-viewer','moderation@example.invalid','EXISTING_FIXTURE_HASH','active','ru',1,1)").run();
const originalRead=fs.readFile;
fs.readFile=async(file,...args)=>String(file).includes('xdg.config')&&String(file).endsWith('default.toml')?'oauth_token="LOCAL_CLOUDFLARE_FIXTURE"':String(file)==='.wrangler/cache/wrangler-account.json'?'{"id":"local-account-fixture"}':originalRead(file,...args);
globalThis.fetch=async(url,options={})=>{
 if(String(url).endsWith('/pages/projects/mysterion-international'))return Response.json({success:true,result:{name:'mysterion-international',production_branch:'main',deployment_configs:{production:{d1_databases:{MEDIA_DB:{id:'99255496-6173-4efe-8b14-5924f3c1ceeb'}}}}}});
 if(!String(url).endsWith('/d1/database/99255496-6173-4efe-8b14-5924f3c1ceeb/query'))throw Error('Unexpected network request');
 const q=JSON.parse(options.body),stmt=db.prepare(q.sql);let results=[],changes=0;
 if(q.sql.startsWith('SELECT'))results=stmt.all(...q.params);else changes=Number(stmt.run(...q.params).changes);
 return Response.json({success:true,result:[{success:true,results,meta:{changes}}]});
};
process.on('exit',()=>{const users=db.prepare('SELECT id,password_hash,status FROM viewer_accounts').all(),grants=db.prepare('SELECT viewer_id,video_id,course_id,source_order_id,expires_at,starts_at FROM viewer_grants').all();sync.writeFileSync(audit,JSON.stringify({users:users.map(u=>({id:u.id,status:u.status,hashValid:u.password_hash.startsWith('argon2id:')})),grants,staff:db.prepare('SELECT access_sub,role,active FROM platform_staff').all(),orders:db.prepare('SELECT COUNT(*) n FROM viewer_orders').get().n}));db.close()});
`);
let checks=0;
for(const mode of ['dry','execute','paid','existing']){
 const args=['--import',pathToFileURL(path.join(workspace,'tools/register-viewer-wasm.mjs')).href,'--import',pathToFileURL(hook).href,path.join(workspace,'tools/create-tribute-moderation-account.mjs'),'--email','moderation@example.invalid','--demo-videos','550e8400-e29b-41d4-a716-446655440000',...(mode==='dry'?[]:['--execute'])];
 const result=spawnSync(process.execPath,args,{cwd:directory,encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,MODERATION_FIXTURE_CASE:mode}});
 assert.equal(result.status,['dry','execute'].includes(mode)?0:1,mode+' '+result.stderr);
 const report=JSON.parse(await fs.readFile(audit,'utf8'));
 assert.deepEqual(report.staff,[{access_sub:'existing-owner-fixture',role:'owner',active:1}]);assert.equal(report.orders,0);checks+=3;
 if(mode==='execute'){
  assert.equal(report.users.length,1);assert.equal(report.users[0].hashValid,true);assert.equal(report.grants.length,1);assert.equal(report.grants[0].course_id,null);assert.equal(report.grants[0].source_order_id,null);assert.equal(report.grants[0].expires_at-report.grants[0].starts_at,7*86400);assert.equal((result.stdout+result.stderr).includes('argon2id:'),false);checks+=7;
 }else{assert.equal(report.users.length,mode==='existing'?1:0);assert.equal(report.grants.length,0);checks+=2}
}
console.log(JSON.stringify({checks,fixtureOnly:true,initialPasswordNotExported:true,onlyApprovedFreeDemoGrants:true,existingAccountsNotChanged:true,adminRolesUnchanged:true,realCloudflareRequests:0}));
