// Cross-platform local build only. No upload, login, remote D1 or secret reads.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {packageSiteRelease} from './package-site-release.mjs';
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--outdir'))throw Error('Usage: node tools/build-site-release.mjs [--outdir output/name]');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Use Node 24.22.2 (see release-build/package.json)');
const outputRoot=path.resolve('output'),target=path.resolve(args[1]||'output/pages-production');
if(!target.startsWith(outputRoot+path.sep))throw Error('Build output must be inside output/');
try{await fs.access(target);throw Error('Output already exists; use a fresh checkout or a new --outdir')}catch(error){if(error.code!=='ENOENT')throw error}
await fs.mkdir(outputRoot,{recursive:true});
const bundle=await fs.mkdtemp(path.join(outputRoot,'pages-functions-'));
const cli=path.resolve('tools/release-build/node_modules/wrangler/bin/wrangler.js');
await fs.access(cli); // Only npm ci from the committed lockfile supplies this tool.
// Wrangler defaults to Node compat for this date. The site uses Web APIs only;
// do not inject unenv/Node imports that depend on production runtime flags.
const built=spawnSync(process.execPath,[cli,'pages','functions','build','--outdir',bundle,'--compatibility-date','2026-11-08','--compatibility-flags','no_nodejs_compat','no_nodejs_compat_v2'],{stdio:'inherit',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
if(built.status!==0)throw Error('Local Functions compilation failed');
const require=createRequire(import.meta.url);
const {transform}=require(require.resolve('esbuild',{paths:[path.resolve('tools/release-build')]}));
const entry=path.join(bundle,'index.js');
// Pages re-bundles _worker.js at publication. Lower class static blocks once,
// preserving names, rather than carrying __name(this, ...) into that stage.
const {code}=await transform(await fs.readFile(entry,'utf8'),{target:'es2020',format:'esm',keepNames:true});
if(code.includes('node:')||code.includes('unenv')||/\bstatic\s*\{/.test(code))throw Error('Worker must not depend on Node shims or class static blocks');
await fs.writeFile(entry,code);
const result=await packageSiteRelease({bundleDirectory:bundle});
await fs.mkdir(path.dirname(target),{recursive:true});
await fs.rename(result.package,target);
await fs.writeFile('output/site-release/latest-package.txt',target);
console.log(JSON.stringify({...result,package:target,toolchain:'tools/release-build/package-lock.json',deployment:false}));
