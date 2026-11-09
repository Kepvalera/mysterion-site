import assert from 'node:assert/strict';import {platformFixture} from './platform-local-fixture.mjs';import {handle} from '../media-worker/src/worker.mjs';
const f=await platformFixture(),{db}=f,env={...f.env,MEDIA_ACCESS_ISSUER:undefined,MEDIA_ACCESS_AUD:undefined},oldWarn=console.warn;console.warn=()=>{};let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
const free=crypto.randomUUID(),paid=crypto.randomUUID(),draft=crypto.randomUUID(),provider=crypto.randomUUID(),now=new Date().toISOString();
for(const [id,source,ref,access,state] of [[free,'youtube','abcdefghijk','free','published'],[paid,'bunny',provider,'paid','published'],[draft,'youtube','abcdefghijk','free','draft']])db.prepare('INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,state,publish_at,updated_at,mutation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'{"ru":"Local fixture","en":"Local fixture"}','{"ru":"","en":""}','sermon',2026,source,ref,access,access==='paid'?100:0,state,now,now,crypto.randomUUID());
const call=(path,method='GET',overrides={})=>handle(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/media/'+path,{method,headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest'}}),{...env,...overrides});
try{
 const catalog=await call('videos');equal(catalog.status,200);const serialized=await catalog.text();equal(JSON.parse(serialized).items.length,2);equal(serialized.includes(provider),false);equal(serialized.includes('source_ref'),false);
 const play=await call('videos/'+free+'/play');equal(play.status,200);equal((await play.json()).type,'youtube');equal((await call('videos/'+draft+'/play')).status,404);equal((await call('videos/'+paid+'/play')).status,402);equal((await call('videos/'+paid+'/stream')).status,402);equal((await call('view/play/'+paid,'POST')).status,503);
 equal((await call('collections')).status,200);equal((await call('session')).status,200);equal((await (await call('session')).json()).authenticated,false);
 for(const route of ['admin/me','admin/videos','admin/members','admin/grants','view/account'])equal((await call(route)).status,503);
 equal((await call('videos','GET',{MEDIA_ENABLED:'false'})).status,503);equal((await call('videos','GET',{VIEWER_PLATFORM_ENABLED:'false'})).status,503);equal((await call('videos','GET',{MEDIA_PUBLIC_ORIGIN:'https://another.invalid'})).status,421);
 console.log(JSON.stringify({checks,publicReadsWithoutStaffSetup:true,adminStillClosed:true,paidStillClosed:true,legacyModeUnchanged:true,remoteWrites:0}));
}finally{console.warn=oldWarn;f.close()}
