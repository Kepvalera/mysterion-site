// Portable artifact/runtime test: uses only npm ci --prefix tools/release-build.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {validateMediaRoutes} from './check-media-routes.mjs';
const require=createRequire(import.meta.url),toolkit=path.resolve('tools/release-build');
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[toolkit]}));
const target=path.resolve(process.argv[2]||'output/pages-production');
const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();
const files=(await walk(target)).map(file=>path.relative(target,file).split(path.sep).join('/'));
assert.ok(files.every(file=>! /^(dist|output|docs|tools|media-worker|functions)\//.test(file)&&!file.split('/').some(part=>part.startsWith('.')||/^README/i.test(part)||/\.md$/i.test(part))));
assert.ok(files.includes('assets/fonts/manrope-OFL.txt'));assert.ok(files.includes('assets/fonts/cormorantgaramond-OFL.txt'));
const manifest=JSON.parse(await fs.readFile('docs/conference-image-removals-2026-11-11.json','utf8')),removed=[...manifest.files,...manifest.additionalApprovedFiles];assert.equal(removed.length,44);
for(const file of removed)assert.ok(!files.includes(file));
for(const file of files.filter(f=>/\.(js|html|css)$/.test(f))){const text=await fs.readFile(path.join(target,file),'utf8');for(const gone of removed)assert.ok(!text.includes(gone),file)}
validateMediaRoutes(JSON.parse(await fs.readFile(path.join(target,'_routes.json'),'utf8')));
const workerFiles=files.filter(file=>file.startsWith('_worker.js/')).sort((a,b)=>Number(b.endsWith('/index.js'))-Number(a.endsWith('/index.js')));assert.equal(workerFiles.length,3);
const workerCode=await fs.readFile(path.join(target,'_worker.js/index.js'),'utf8');
assert.ok(!workerCode.includes('node:'),'Unexpected Node builtin import/dependency');
assert.ok(!workerCode.includes('unenv'),'Unexpected Node polyfill');
assert.ok(!/\bstatic\s*\{/.test(workerCode),'Class static blocks must be lowered before Pages re-bundles');
const modules=await Promise.all(workerFiles.map(async file=>({type:file.endsWith('.wasm')?'CompiledWasm':'ESModule',path:path.join(target,file),contents:file.endsWith('.wasm')?await fs.readFile(path.join(target,file)):await fs.readFile(path.join(target,file),'utf8')})));
let mail;const origin='https://local.invalid';
const mf=new Miniflare(convertV4MiniflareOptions({modules,compatibilityDate:'2026-11-08',assets:{directory:target,binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true},assetConfig:{not_found_handling:'404-page'}},d1Databases:{MEDIA_DB:'isolated-local-release-test'},serviceBindings:{VIEWER_MAILER:async request=>{mail=await request.json();return new Response('{}')}},bindings:{MEDIA_PUBLIC_ORIGIN:origin,MEDIA_ENABLED:'true',VIEWER_AUTH_ENABLED:'true',VIEWER_PLATFORM_ENABLED:'true',MEDIA_PAID_ENABLED:'false',VIEWER_RATE_KEY:'LOCAL_RELEASE_TEST_RATE_KEY_NOT_A_SECRET',MEDIA_ACCESS_ISSUER:'https://local.cloudflareaccess.com',MEDIA_ACCESS_AUD:'LOCAL_RELEASE_TEST_AUD'}}));
let routeChecks=0;
try{
 const db=await mf.getD1Database('MEDIA_DB');
 for(const file of (await fs.readdir('media-worker/migrations')).filter(f=>/^\d{4}_/.test(f)).sort()){
  const sql=(await fs.readFile('media-worker/migrations/'+file,'utf8')).replace(/^\s*--.*$/gm,'');await db.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
 }
 for(const host of ['https://mysterion-international.com','https://mysterion-international.pages.dev'])for(const file of removed){const response=await mf.dispatchFetch(host+'/'+file);assert.equal(response.status,404);routeChecks++}
 for(const route of ['/admin-media','/admin-media.html','/admin-media/','/media-login.html','/api/platform/admin/me','/api/media/admin/me']){const response=await mf.dispatchFetch(origin+route);assert.ok([401,403,404,409].includes(response.status),route+' '+response.status);const text=await response.text();assert.ok(!text.includes('LOCAL_RELEASE_TEST_AUD'));assert.ok(!text.includes('id="platform-editor"'));routeChecks++}
 const privateId='00000000-0000-4000-8000-000000000011',now=new Date().toISOString();
 await db.prepare("INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,updated_at,mutation_id,bunny_status) VALUES (?,?,?,'sermon',2026,'bunny',?,'paid',100,'EUR','published',?,?,?,4)").bind(privateId,'{"ru":"Local fixture","en":"Local fixture"}','{}','00000000-0000-4000-8000-000000000012',now,now,'local-fixture').run();
 const protectedPlay=await mf.dispatchFetch(origin+'/api/platform/play/'+privateId);assert.equal(protectedPlay.status,401);assert.ok(!JSON.stringify(await protectedPlay.json()).includes('mediadelivery'));routeChecks++;
 const call=(route,body,cookie)=>mf.dispatchFetch(origin+'/api/viewer/'+route,{method:body?'POST':'GET',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('register',{email:'local-release@example.invalid',password:'Local8!?'})).status,202);
 for(let i=0;!mail&&i<100;i++)await new Promise(r=>setTimeout(r,10));assert.ok(mail);
 const token=new URLSearchParams(new URL(mail.text.split('\n\n').at(-1)).hash.slice(1)).get('token');assert.ok(token);
 assert.equal((await call('verify-email',{token})).status,200);
 const login=await call('login',{email:'local-release@example.invalid',password:'Local8!?'});assert.equal(login.status,200);
 const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.equal((await (await call('session',undefined,cookie)).json()).authenticated,true);
 const badOrigin=await mf.dispatchFetch(origin+'/api/viewer/login',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:'{}'});assert.equal(badOrigin.status,403);
 assert.equal((await call('logout',{},cookie)).status,200);assert.equal((await (await call('session',undefined,cookie)).json()).authenticated,false);
 console.log(JSON.stringify({files:files.length,removedPathsAbsent:44,routeChecks,adminWithoutAccessDenied:true,privatePlaybackWithoutSessionDenied:true,registration:true,emailVerification:true,loginSessionLogout:true,csrf:true,localD1Only:true,remoteProviderCalls:0,ignoredToolDependenciesRequired:false}));
}finally{await mf.dispose()}
