import {viewerRuntimeOptions} from './viewer-runtime-build.mjs';
import {createRequire} from 'node:module';import path from 'node:path';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),paths=[path.resolve('output/audit-tools/wrangler')],{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths}));
const harness=`import {reserveViewerPassword} from './media-worker/src/viewer-rate-limit.mjs';
 export default {async fetch(request,bindings){
 const env={...bindings,VIEWER_RATE_KEY:'LOCAL_ONLY_RATE_KEY_FOR_RUNTIME_TEST',MEDIA_PUBLIC_ORIGIN:'https://local.invalid'};
 const client=new Request('https://local.invalid/api/viewer/login',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
 try{const ticket=await reserveViewerPassword(client,env,'local@example.invalid');await new Promise(r=>setTimeout(r,500));await ticket.finish(true);return Response.json({admitted:true})}
 catch(error){return Response.json({error:error.status===429?'rate_limited':'failed',scope:error.limitScope},{status:error.status||503})}
 }};`;
const mf=new Miniflare(convertV4MiniflareOptions(await viewerRuntimeOptions(harness,{d1Databases:{MEDIA_DB:'local-rate-runtime'}})));
try{
 const db=await mf.getD1Database('MEDIA_DB');for(const name of ['0004_viewer_accounts.sql','0005_viewer_sessions.sql']){const sql=(await fs.readFile('media-worker/migrations/'+name,'utf8')).replace(/^\s*--.*$/gm,'');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run()}
 const results=await Promise.all(Array.from({length:12},(_,i)=>mf.dispatchFetch('https://local.invalid/attempt/'+i).then(async r=>({status:r.status,data:await r.json()}))));
 assert.equal(results.filter(r=>r.status===200).length,5);assert.equal(results.filter(r=>r.status===429&&r.data.scope==='password_pair').length,7);
 const pending=await db.prepare("SELECT COUNT(*) AS n FROM viewer_rate_limits WHERE bucket GLOB '*:pending:*'").first();assert.equal(pending.n,0);
 const next=await mf.dispatchFetch('https://local.invalid/next');assert.equal(next.status,429);
 console.log(JSON.stringify({runtime:'Cloudflare workerd + local D1',parallelHTTPRequests:12,admitted:5,rejected:7,pendingAfterCompletion:0,subsequentAttemptBlocked:true,remoteWrites:0}));
}finally{await mf.dispose()}
