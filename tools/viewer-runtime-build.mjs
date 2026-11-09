import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),paths=[path.resolve('output/audit-tools/wrangler')];
const {build}=require(require.resolve('esbuild',{paths}));
export async function viewerRuntimeOptions(harness,extra={}){
 const names=['argon2','blake2b'];
 const result=await build({stdin:{contents:harness,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'compiled-wasm',setup(builder){builder.onResolve({filter:/\.wasm$/},args=>({path:'./'+path.basename(args.path),external:true}))}}]});
 const root=path.resolve('output/viewer-runtime');
 return {compatibilityDate:'2026-11-08',...extra,modules:[{type:'ESModule',path:path.join(root,'worker.mjs'),contents:result.outputFiles[0].text},...await Promise.all(names.map(async name=>({type:'CompiledWasm',path:path.join(root,name+'.wasm'),contents:await fs.readFile(`media-worker/vendor/hash-wasm/${name}.wasm`)})))]};
}
