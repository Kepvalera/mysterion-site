// Check the deployable Worker without relying on default-on Node compatibility.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),toolkit=path.resolve('tools/release-build');
const {build}=require(require.resolve('esbuild',{paths:[toolkit]}));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[toolkit]}));
const directory=path.resolve(process.argv[2]||'output/pages-production','_worker.js');
const code=await fs.readFile(path.join(directory,'index.js'),'utf8');
assert.ok(!code.includes('node:'),'Worker must not import Node builtins');
assert.ok(!code.includes('unenv'),'Worker must not contain Node polyfills');
assert.ok(!/\bstatic\s*\{/.test(code),'Worker class static blocks must be lowered');
const wasm=(await fs.readdir(directory)).filter(name=>name.endsWith('.wasm'));assert.equal(wasm.length,2);
// Pages re-bundles advanced-mode workers. Exercise another bundle pass too.
const rebundled=await build({stdin:{contents:code,resolveDir:directory,sourcefile:'index.js'},bundle:true,platform:'browser',format:'esm',target:'es2020',keepNames:true,external:['*.wasm'],write:false});
assert.deepEqual(rebundled.warnings,[]);
const results=[];
for(const [variant,contents] of [['artifact',code],['rebundled',rebundled.outputFiles[0].text]]){
 for(const date of ['2024-01-01','2026-08-03','2026-11-08']){
  const modules=[{type:'ESModule',path:path.join(directory,'index.js'),contents},...await Promise.all(wasm.map(async name=>({type:'CompiledWasm',path:path.join(directory,name),contents:await fs.readFile(path.join(directory,name))})))];
  const mf=new Miniflare(convertV4MiniflareOptions({modules,compatibilityDate:date,compatibilityFlags:['no_nodejs_compat','no_nodejs_compat_v2']}));
  try{
   const response=await mf.dispatchFetch('https://local.invalid/api/viewer/session');
   assert.equal(response.status,503);assert.equal((await response.json()).error,'viewer_auth_disabled');
   results.push({variant,date,nodeCompatibility:false,startup:true,unconfiguredAuthFailsClosed:true});
  }finally{await mf.dispose()}
 }
}
console.log(JSON.stringify({checks:results.length,results,remoteCalls:0}));
