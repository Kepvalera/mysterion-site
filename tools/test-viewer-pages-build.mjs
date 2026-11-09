import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),paths=[path.resolve('output/audit-tools/wrangler')];
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths}));
const root=path.resolve('output/viewer-pages-build');
const built=spawnSync(process.execPath,[path.resolve('output/audit-tools/wrangler/node_modules/wrangler/bin/wrangler.js'),'pages','functions','build','--outdir',root,'--compatibility-date','2026-11-08'],{encoding:'utf8',timeout:60000,windowsHide:true,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.resolve('output/viewer-pages-build.log')}});
if(built.status!==0)throw Error('Local Pages Functions build failed: '+(built.stderr||built.error?.code||'').slice(-1000));
const files=await fs.readdir(root),wasm=files.filter(f=>f.endsWith('.wasm'));assert.equal(wasm.length,2);
const code=await fs.readFile(path.join(root,'index.js'),'utf8');assert.ok(!code.includes('WebAssembly.compile('));
const modules=[{type:'ESModule',path:path.join(root,'index.js'),contents:code},...await Promise.all(wasm.map(async f=>({type:'CompiledWasm',path:path.join(root,f),contents:await fs.readFile(path.join(root,f))})))];
const mf=new Miniflare(convertV4MiniflareOptions({modules,compatibilityDate:'2026-11-08',d1Databases:{MEDIA_DB:'local-pages-build-test'},bindings:{VIEWER_AUTH_ENABLED:'true',VIEWER_RATE_KEY:'LOCAL_ONLY_RATE_KEY_FOR_PAGES_BUILD',MEDIA_PUBLIC_ORIGIN:'https://local.invalid',MEDIA_PAID_ENABLED:'false'}}));
try{
 const db=await mf.getD1Database('MEDIA_DB');
 for(const name of ['0004_viewer_accounts.sql','0005_viewer_sessions.sql']){
  const sql=(await fs.readFile('media-worker/migrations/'+name,'utf8')).replace(/^\s*--.*$/gm,'');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 const session=await mf.dispatchFetch('https://local.invalid/api/viewer/session');assert.equal(session.status,200);
 const login=await mf.dispatchFetch('https://local.invalid/api/viewer/login',{method:'POST',headers:{Origin:'https://local.invalid','X-Requested-With':'XMLHttpRequest','Content-Type':'application/json'},body:JSON.stringify({email:'local-build@example.invalid',password:'Local8!?'})});
 assert.equal(login.status,401,await login.clone().text());assert.equal((await login.json()).error,'invalid_credentials');
 console.log(JSON.stringify({pagesFunctionsBuild:true,staticWasmModules:wasm.length,runtimeCompile:false,bundleBytes:Buffer.byteLength(code),localD1Session:true,actualBundledWasmLogin:true,remoteWrites:0}));
}finally{await mf.dispose()}
