// Run against Cloudflare workerd, not Node's Request/fetch implementation.
// All upstream calls are intercepted in the isolate. No real keys, D1 or videos.
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),paths=[path.resolve('output/audit-tools/wrangler')];
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths}));
const {build}=require(require.resolve('esbuild',{paths}));
const harness=`
import {bunnyRequest,thumbnail} from './media-worker/src/bunny.mjs';
export default {async fetch(){
 const env={BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'803179',BUNNY_API_KEY:'LOCAL_API_KEY_ONLY',BUNNY_TOKEN_KEY:'LOCAL_EMBED_KEY_ONLY',BUNNY_CDN_TOKEN_KEY:'LOCAL_CDN_KEY_ONLY',BUNNY_CDN_HOST:'vz-local.b-cdn.net',MEDIA_PUBLIC_ORIGIN:'https://local.invalid'};
 let checks=0,calls=0,mode='success';
 const check=(condition,message)=>{if(!condition)throw Error(message);checks++};
 let previousRejected=false;try{new Request('https://video.bunnycdn.com/library/803179/videos',{redirect:'error'})}catch(error){previousRejected=error.name==='TypeError'}
 check(previousRejected,'Baseline: workerd must reject redirect error');
 globalThis.fetch=async(input,options)=>{
  const request=new Request(input,options); // Native workerd validation is essential.
  calls++;check(request.redirect==='manual','Redirect policy');
  if(new URL(request.url).hostname==='vz-local.b-cdn.net'){
   check(!request.headers.has('AccessKey'),'No library key on CDN request');
   return mode==='cdn-redirect'?new Response(null,{status:302,headers:{Location:'https://other.invalid/secret'}}):new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});
  }
  check(request.url==='https://video.bunnycdn.com/library/803179/videos','Exact Bunny create endpoint');
  check(request.method==='POST','Create method');check(request.headers.get('AccessKey')===env.BUNNY_API_KEY,'Library key binding');
  check((await request.json()).title==='LOCAL_ONLY','Create payload');
  if(mode==='redirect')return new Response(null,{status:307,headers:{Location:'https://other.invalid/secret'}});
  if(mode==='auth')return new Response('PRIVATE_PROVIDER_BODY',{status:401});
  if(mode==='forbidden')return new Response('PRIVATE_PROVIDER_BODY',{status:403});
  if(mode==='network')throw new TypeError('PRIVATE_PROVIDER_BODY');
  if(mode==='timeout')throw new DOMException('PRIVATE_PROVIDER_BODY','TimeoutError');
  if(mode==='json')return new Response('PRIVATE_PROVIDER_BODY',{status:200});
  return Response.json({guid:'00000000-0000-4000-8000-000000000001',videoLibraryId:803179});
 };
 const created=await bunnyRequest(env,'','POST',{title:'LOCAL_ONLY'});check(created.videoLibraryId===803179,'Create succeeds in workerd');
 for(const [scenario,expected] of [['redirect','bunny_redirect_blocked'],['auth','bunny_auth_failed'],['forbidden','bunny_forbidden'],['network','bunny_network_error'],['timeout','bunny_timeout'],['json','bunny_response_invalid']]){
  mode=scenario;const before=calls;let caught;try{await bunnyRequest(env,'','POST',{title:'LOCAL_ONLY'})}catch(error){caught=error}
  check(caught?.message===expected,'Separate error: '+scenario);check(calls===before+1,'No redirect following or automatic create retry');check(!JSON.stringify(caught).includes('PRIVATE_PROVIDER_BODY'),'No provider body leak');
 }
 const row={source_type:'bunny',source_ref:created.guid,bunny_library_id:'803179',bunny_thumbnail:'thumbnail.jpg'};
 mode='success';check((await thumbnail(env,row)).status===200,'CDN thumbnail works in workerd');
 mode='cdn-redirect';let caught;try{await thumbnail(env,row)}catch(error){caught=error}check(caught?.message==='bunny_redirect_blocked','CDN redirect blocked');
 return Response.json({checks,calls,runtime:'Cloudflare workerd',oldRedirectRejected:previousRejected,realUpstreamCalls:0,productionWrites:0});
}};
`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd(),sourcefile:'bunny-runtime-fixture.mjs'},bundle:true,format:'esm',platform:'browser',write:false});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-11-08',script:bundle.outputFiles[0].text}));
try{const response=await mf.dispatchFetch('http://localhost/');assert.equal(response.status,200,await response.clone().text());console.log(await response.text())}finally{await mf.dispose()}
