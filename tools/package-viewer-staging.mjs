// Local packaging only. No deployment and no infrastructure changes.
import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
const git='C:/Program Files/Git/ucrt64/bin/git.exe';
if(execFileSync(git,['branch','--show-current'],{encoding:'utf8'}).trim()!=='viewer-auth')throw Error('viewer-auth required');
const root=path.resolve('output/viewer-staging-site');await fs.mkdir(root,{recursive:true});
// Do not delete an existing package recursively: each run gets a fresh directory.
const target=await fs.mkdtemp(path.join(root,'package-'));
const files=execFileSync(git,['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let copied=0;
for(const name of files){
 const publicFile=name.startsWith('assets/')||(!name.includes('/')&&(/\.(html|js|css|svg|ico|webp|png|jpg|jpeg|avif|txt|xml|webmanifest)$/.test(name)||['_headers','_routes.json'].includes(name)));
 if(!publicFile||name==='AGENTS.md'||name==='CLAUDE.md')continue;
 const dest=path.join(target,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(name,dest);copied++;
}
await fs.mkdir(path.join(target,'_worker.js'));const bundle=path.resolve('output/viewer-pages-build');
for(const name of await fs.readdir(bundle)){if(name==='index.js'||name.endsWith('.wasm'))await fs.copyFile(path.join(bundle,name),path.join(target,'_worker.js',name))}
await fs.writeFile(path.join(root,'latest-package.txt'),target);
console.log(JSON.stringify({package:target,publicFiles:copied,worker:'_worker.js/index.js',secretsOrLocalConfigIncluded:false,deployment:false}));
