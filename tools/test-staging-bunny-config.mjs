import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyStagingBunnyPlan,readStagingConfig} from './verify-staging-bunny-config.mjs';
import {prepareStagingBunnyConfig} from './prepare-staging-bunny-config.mjs';
const vars={BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'803179',BUNNY_CDN_HOST:'vz-b41e67d9-d06.b-cdn.net',MEDIA_PAID_ENABLED:'false',MEDIA_MEMBERS_ENABLED:'false',MEDIA_PUBLIC_ORIGIN:'https://mysterion-viewer-staging.pages.dev',MEDIA_ENABLED:'true',VIEWER_PLATFORM_ENABLED:'true',VIEWER_AUTH_ENABLED:'true'};
const config={name:'mysterion-viewer-staging',env:{production:{vars,d1_databases:[{binding:'MEDIA_DB',database_id:'99255496-6173-4efe-8b14-5924f3c1ceeb'}]}}};
let checks=0;
assert.equal(verifyStagingBunnyPlan(config).valid,true);checks++;
for(const mutate of [c=>c.name='production',c=>c.env.production.name='production',c=>delete c.env.production,c=>c.env.production.d1_databases=[],c=>c.env.production.d1_databases[0].database_id='other-db',c=>c.env.other={d1_databases:[{database_id:'production-db'}]},c=>c.env.production.vars.MEDIA_PUBLIC_ORIGIN='https://mysterion-international.com',c=>c.env.production.vars.BUNNY_SECURITY_CONFIRMED='false',c=>c.env.production.vars.MEDIA_ALLOWED_ORIGINS='https://mysterion-international.pages.dev',c=>c.routes=['example.com/*'],c=>c.env.production.vars.MEDIA_PAID_ENABLED='true']){
 const copy=structuredClone(config);mutate(copy);assert.equal(verifyStagingBunnyPlan(copy).valid,false);checks++;
}
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mysterion-config-check-'));
try{
 const file=path.join(dir,'wrangler.json');await fs.writeFile(file,JSON.stringify(config));assert.deepEqual(readStagingConfig(file),config);checks++;
 const toml=path.join(dir,'wrangler.toml');await fs.writeFile(toml,'name = "mysterion-viewer-staging"\n[env.production.vars]\n'+Object.entries(vars).map(([k,v])=>k+' = '+JSON.stringify(v)).join('\n')+'\n[[env.production.d1_databases]]\nbinding = "MEDIA_DB"\ndatabase_id = "99255496-6173-4efe-8b14-5924f3c1ceeb"\n');assert.equal(verifyStagingBunnyPlan(readStagingConfig(toml)).valid,true);checks++;
 const target=prepareStagingBunnyConfig(file,path.join(dir,'copy'));assert.equal(await fs.readFile(target,'utf8'),await fs.readFile(file,'utf8'));checks++;
 assert.throws(()=>prepareStagingBunnyConfig(file,path.join(dir,'copy')));checks++;
 for(const args of [[],[file]]){if(args.length)await fs.writeFile(file,JSON.stringify({name:'PRIVATE_CONFIG_SENTINEL'}));const run=spawnSync(process.execPath,['tools/verify-staging-bunny-config.mjs',...args],{encoding:'utf8'});assert.equal(run.status,1);assert.ok(!(run.stdout+run.stderr).includes('PRIVATE_CONFIG_SENTINEL'));checks++}
 assert.throws(()=>prepareStagingBunnyConfig(file,path.join(dir,'unsafe')));checks++;
 await assert.rejects(fs.stat(path.join(dir,'unsafe')));checks++;
}finally{await fs.rm(dir,{recursive:true,force:true})}
console.log(JSON.stringify({checks,actualFileChecked:true,unsafePlansRejected:true,remoteWrites:0}));
