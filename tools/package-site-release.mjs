// Local release artifact only. Never deploys or changes infrastructure.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export async function packageSiteRelease(){
 const manifest=JSON.parse((await fs.readFile('docs/conference-image-removals-2026-11-11.json','utf8')).replace(/^\uFEFF/,''));
 const removed=new Set([...manifest.files,...(manifest.additionalApprovedFiles||[])]);
 const listed=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const publicFiles=[...new Set(listed)].filter(file=>file.startsWith('assets/')||(!file.includes('/')&&(/\.(html|js|css|svg|ico|webp|png|jpe?g|avif|txt|xml|webmanifest)$/.test(file)||['_headers','_routes.json'].includes(file))));
 const directory=path.resolve('output/site-release');await fs.mkdir(directory,{recursive:true});
 // Fresh directory: no stale files can survive an earlier package.
 const target=await fs.mkdtemp(path.join(directory,'package-'));let copied=0;
 for(const file of publicFiles){
  if(removed.has(file)){
   try{await fs.access(file);throw Error('Removed asset restored: '+file)}catch(error){if(error.code!=='ENOENT')throw error}
   continue;
  }
  const dest=path.join(target,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(file,dest);copied++;
 }
 // Never produce a static-only package that would bypass existing Functions.
 const bundle=path.resolve('output/viewer-pages-build');await fs.access(path.join(bundle,'index.js'));
 const modules=(await fs.readdir(bundle)).filter(name=>name==='index.js'||name.endsWith('.wasm'));
 if(modules.filter(name=>name.endsWith('.wasm')).length!==2)throw Error('Expected two built WASM modules');
 await fs.mkdir(path.join(target,'_worker.js'));
 for(const name of modules)await fs.copyFile(path.join(bundle,name),path.join(target,'_worker.js',name));
 await fs.writeFile(path.join(directory,'latest-package.txt'),target);
 return {package:target,publicFiles:copied,removedAssetsExcluded:removed.size,functionsIncluded:true,deployment:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){console.log(JSON.stringify(await packageSiteRelease()))}
