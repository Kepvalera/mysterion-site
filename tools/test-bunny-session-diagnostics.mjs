import assert from 'node:assert/strict';
import {uploadDiagnostics} from '../media-worker/src/bunny-upload-diagnostics.mjs';
import {uploadGrant} from '../media-worker/src/bunny.mjs';
const ref=crypto.randomUUID(),video={id:crypto.randomUUID(),state:'draft',source_type:'bunny',source_ref:ref,bunny_library_id:'123'};
let mode='ok',calls=[],checks=0;const original=globalThis.fetch;
const env={BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'123',BUNNY_API_KEY:'LOCAL_ONLY_PROVIDER_TEST_KEY',BUNNY_TOKEN_KEY:'LOCAL_ONLY_PLAYBACK_KEY',MEDIA_DB:{prepare:()=>({bind:()=>({first:async()=>({location:'https://video.bunnycdn.com/tusupload/local-session',file_size:1563823800,updated_at:100})})})}};
globalThis.fetch=async(url,o)=>{calls.push(o.method);assert.ok(['GET','HEAD'].includes(o.method));checks++;assert.equal(o.redirect,'manual');checks++;if(o.method==='GET'){if(mode==='video404')return new Response(null,{status:404});return Response.json({guid:ref,videoLibraryId:123,status:0})}if(mode==='missing')return new Response(null,{status:404});return new Response(null,{status:200,headers:{'Upload-Offset':mode==='bad'?'9999999999':String(169*1024*1024),'Upload-Length':'1563823800'}})};
try{const grant=await uploadGrant(env,video);assert.ok(grant.expires-Date.now()/1000>86395);checks++;
for(const [state,recovery] of [['ok','resume_existing_session'],['missing','session_missing_new_session_requires_confirmation'],['bad','invalid_server_offset']]){mode=state;const r=await uploadDiagnostics(env,video);assert.equal(r.recovery,recovery);checks++;assert.equal(r.video_exists,true);checks++;assert.equal(JSON.stringify(r).includes(env.BUNNY_API_KEY),false);checks++;assert.equal(JSON.stringify(r).includes('https://'),false);checks++}
mode='video404';const r=await uploadDiagnostics(env,video);assert.equal(r.video_exists,false);checks++;assert.equal(calls.at(-1),'GET');checks++;
console.log(JSON.stringify({scenarios:5,checks,providerWrites:0,databaseWrites:0,secretLeak:false}));
}finally{globalThis.fetch=original}
