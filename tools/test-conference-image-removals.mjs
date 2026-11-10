// Local artifact, Cloudflare asset runtime and Chrome. No external services.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[path.resolve('output/audit-tools/wrangler')]}));
const puppeteer=require(require.resolve('puppeteer-core',{paths:[path.resolve('output/audit-tools/lighthouse')]}));
const manifest=JSON.parse((await fs.readFile('docs/conference-image-removals-2026-11-11.json','utf8')).replace(/^\uFEFF/,''));
const number=n=>String(n).padStart(3,'0');
// Exact owner-approved removals independently enumerated from WIP 1f1e3e7.
const originalDeleted=[...[27,29,32,33].map(n=>`assets/conference-2024/photo-${number(n)}.webp`),...Array.from({length:22},(_,n)=>`assets/conference-2024/video-${number(n)}.webp`),'assets/conference-2025/photo-029.webp',...Array.from({length:13},(_,n)=>`assets/conference-2025/video-${number(n)}.webp`)];
assert.deepEqual([...manifest.files].sort(),originalDeleted.sort());assert.equal(originalDeleted.length,40);
const approvedCopies=['assets/conference-2024/photo-026.webp','assets/conference-2024/photo-028.webp','assets/conference-2024/photo-031.webp','assets/conference-2025/photo-028.webp'];
assert.deepEqual(manifest.additionalApprovedFiles,approvedCopies);
const deleted=[...originalDeleted,...approvedCopies];assert.equal(deleted.length,44);
const target=(await fs.readFile('output/site-release/latest-package.txt','utf8')).trim();
const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();
const packageFiles=(await walk(target)).map(file=>path.relative(target,file).replaceAll('\\','/'));
assert.ok(packageFiles.every(file=>! /^(dist|output|docs|tools|media-worker|functions)\//.test(file)&&! /wrangler|\.env|\.dev\.vars/.test(file)));
for(const file of deleted){await assert.rejects(fs.access(file));assert.ok(!packageFiles.includes(file));assert.ok(!packageFiles.includes('dist/'+file))}
const textFiles=packageFiles.filter(file=>/\.(?:html|js|css)$/.test(file));
for(const file of textFiles){const text=await fs.readFile(path.join(target,file),'utf8');for(const gone of deleted)assert.ok(!text.includes(gone),`${file} references ${gone}`)}
const counts={};
for(const year of [2024,2025]){
 const name=`conference-${year}-data.js`,key=`MYSTERION_${year}`,current={window:{}};
 vm.runInNewContext(await fs.readFile(name,'utf8'),current);
 const indices=year===2024?Array.from({length:30},(_,n)=>n+22):Array.from({length:38},(_,n)=>n).filter(n=>n!==14);
 const expected=indices.map(n=>({type:'photo',src:`assets/conference-${year}/photo-${number(n)}.webp`})).filter(item=>!deleted.includes(item.src));
 assert.deepEqual(JSON.parse(JSON.stringify(current.window[key])),JSON.parse(JSON.stringify(expected)));
 counts[year]=expected.length;for(const item of expected){assert.equal(item.type,'photo');await fs.access(item.src)}
}
const bundle=path.join(target,'_worker.js'),names=await fs.readdir(bundle);
const modules=[{type:'ESModule',path:path.join(bundle,'index.js'),contents:await fs.readFile(path.join(bundle,'index.js'),'utf8')},...await Promise.all(names.filter(n=>n.endsWith('.wasm')).map(async name=>({type:'CompiledWasm',path:path.join(bundle,name),contents:await fs.readFile(path.join(bundle,name))})))];
const mf=new Miniflare(convertV4MiniflareOptions({modules,compatibilityDate:'2026-11-08',assets:{directory:target,binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true},assetConfig:{not_found_handling:'404-page'}},bindings:{MEDIA_PUBLIC_ORIGIN:'https://local.invalid',MEDIA_ENABLED:'true',VIEWER_PLATFORM_ENABLED:'true'}}));
let server,browser,chrome;let routeChecks=0;const errors=[],missing=[],states=[];
try{
 for(const origin of ['https://mysterion-international.com','https://mysterion-international.pages.dev'])for(const file of deleted){
  for(const suffix of ['', '?v=old']){const response=await mf.dispatchFetch(origin+'/'+file+suffix);assert.equal(response.status,404,file+' '+(response.status===500?await response.text():''));assert.ok(!response.headers.get('Content-Type')?.startsWith('image/'));routeChecks++}
  const legacy=await mf.dispatchFetch(origin+'/dist/'+file);assert.equal(legacy.status,404);routeChecks++;
 }
 for(const route of ['/admin-media.html','/api/platform/admin/me']){const response=await mf.dispatchFetch('https://local.invalid'+route);assert.ok(response.status>=400);routeChecks++}
 server=http.createServer(async(req,res)=>{try{
  const response=await mf.dispatchFetch('http://127.0.0.1'+req.url,{headers:req.headers});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'mysterion-conferences-'));
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await new Promise(r=>setTimeout(r,100))}}
 assert.ok(port,'Chrome unavailable');browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()===404)missing.push(r.url())});
 await page.setRequestInterception(true);page.on('request',request=>{
  if(request.url().includes('/api/media/session')||request.url().includes('/api/viewer/session'))return request.respond({status:200,contentType:'application/json',body:'{"authenticated":false}'});
  if(!request.url().startsWith(origin))return request.abort();return request.continue();
 });
 for(const year of [2024,2025])for(const width of [320,390,1440]){
  await page.setViewport({width,height:960,isMobile:width<500});
  await page.goto(origin+`/conference-${year}.html`,{waitUntil:'networkidle0'});
  await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('#archive-grid img')].map(image=>{image.loading='eager';return image.decode()}))});
  for(const requested of ['ru','en','de']){
   await page.evaluate(lang=>window.setLanguage(lang),requested);
   const state=await page.evaluate(()=>({lang:document.documentElement.lang,count:document.querySelectorAll('.archive-item').length,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),overflow:document.documentElement.scrollWidth>innerWidth+1,languages:[...document.querySelectorAll('[data-lang]')].map(n=>n.dataset.lang)}));
   assert.equal(state.lang,requested==='de'?'ru':requested);assert.equal(state.count,counts[year]);assert.deepEqual(state.broken,[]);assert.equal(state.overflow,false);assert.deepEqual(state.languages,['ru','en']);
   for(const index of [0,Math.floor(counts[year]/2),counts[year]-1]){
    await page.$eval(`.archive-item:nth-child(${index+1})`,n=>n.click());
    const full=await page.$eval('#viewer-content img',async image=>{await image.decode();return {src:image.getAttribute('src'),loaded:image.naturalWidth>0}});
    assert.equal(full.loaded,true);assert.ok(!deleted.includes(full.src));
    await page.$eval('.viewer-close',n=>n.click());await page.waitForFunction(()=>!document.querySelector('#viewer-content img'));
   }
   states.push({year,width,requested,effective:state.lang,photos:state.count});
  }
  // Existing saved German preference must safely fall back on reload too.
  await page.evaluate(()=>localStorage.setItem('mysterion-language','de'));await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('html',n=>n.lang),'ru');
 }
 for(const file of ['index.html','photos.html']){
  await page.goto(origin+'/'+file,{waitUntil:'networkidle0'});
  await page.evaluate(async()=>{await Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(image=>{image.loading='eager';return image.decode()}))});
  for(const requested of ['ru','en','de']){await page.evaluate(lang=>window.setLanguage(lang),requested);assert.equal(await page.$eval('html',n=>n.lang),requested==='de'?'ru':requested)}
 }
 // The real missing-asset response also loads scripts/styles without relative-path errors.
 const notFound=await page.goto(origin+'/'+deleted[0],{waitUntil:'networkidle0'});assert.equal(notFound.status(),404);
 assert.equal(missing.length,1);assert.equal(missing[0],origin+'/'+deleted[0]);missing.length=0;
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 const result={deleted:44,photosDeleted:9,coversDeleted:35,remaining:counts,routeChecks,states,errors,missing,allRemainingImagesDecoded:true,german:'existing RU fallback; no German selector added',runtime:'local Cloudflare assets + existing Pages Functions + Chrome',remoteWrites:0};
 await fs.mkdir('output/conference-removal-check',{recursive:true});await fs.writeFile('output/conference-removal-check/results.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,states:states.length}));
}finally{if(browser)await browser.close();if(chrome)chrome.kill();if(server)await new Promise(r=>server.close(r));await mf.dispose()}
