// Isolated UI fixtures only. Actual authorization is covered by test-media.mjs.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';import {mediaTemplates} from '../media-worker/src/page-templates.mjs';
const require=createRequire(import.meta.url),puppeteer=(await import(pathToFileURL(require.resolve('puppeteer-core',{paths:[path.resolve('output/audit-tools/lighthouse')]})))).default;
const out=path.resolve('output/media-members-check');await fs.mkdir(out,{recursive:true});
const uid='00000000-0000-4000-8000-000000000001',vid='00000000-0000-4000-8000-000000000002';
const row={id:vid,title:{ru:'LOCAL TEST',en:'LOCAL TEST',de:'LOCAL TEST'},description:{ru:'TEST ONLY',en:'TEST ONLY',de:'TEST ONLY'},access:'paid',category:'school',year:2026,source_type:'bunny',state:'draft',source_ref:'',price_minor:100,currency:'EUR',publish_at:new Date().toISOString(),revision:1};
let registered=true,grants=[],collections=[],calls=[];
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');let body='';for await(const c of req)body+=c;const data=body?JSON.parse(body):null;calls.push([req.method,u.pathname]);let answer;
 if(u.pathname.startsWith('/api/media/')){
  const p=u.pathname.slice(11);
  if(p==='admin/me')answer={role:'admin',members:true,bunny:true,customCovers:true,paid:false};
  else if(p==='admin/videos')answer={items:[row]};
  else if(p==='admin/members')answer={users:[{id:uid,access_sub:'LOCAL_VIEWER_SUB',role:'viewer',active:1}],grants};
  else if(p==='admin/grants'&&req.method==='POST'){grants=[{...data,id:uid,revoked_at:null}];answer={ok:true}}
  else if(p==='admin/grants/'+uid&&req.method==='DELETE'){grants=[];answer={ok:true}}
  else if(p==='admin/collections'&&req.method==='POST'){collections=[{...data,id:uid}];answer={id:uid}}
  else if(p==='admin/collections')answer={items:collections};
  else if(p==='view/account')answer=registered?{registered:true,items:[{...row,expires_at:new Date(Date.now()+86400000).toISOString()}]}:{registered:false,identity:'LOCAL_VERIFIED_SUB',items:[]};
  else if(p==='view/play/'+vid){res.writeHead(403,{'Content-Type':'application/json'});res.end('{"error":"viewing_right_required"}');return}
  else answer={items:[]};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(answer));return;
 }
 let source,type;if(u.pathname==='/admin-media.html'||u.pathname==='/media-login.html'){source=u.pathname.startsWith('/admin')?mediaTemplates.admin:mediaTemplates.login;type='text/html; charset=utf-8'}else{const target=path.resolve('.'+decodeURIComponent(u.pathname));if(!target.startsWith(process.cwd()+path.sep))throw Error();source=await fs.readFile(target);type={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'}[path.extname(target)]||'application/octet-stream'}res.writeHead(200,{'Content-Type':type});res.end(source);
 }catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'mysterion-members-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await new Promise(r=>setTimeout(r,100))}}
if(!port)throw Error('Chrome unavailable');const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port});let checks=0;const errors=[];
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));const metrics=[];
 await page.evaluateOnNewDocument(()=>{window.memberLongTasks=[];new PerformanceObserver(list=>{window.memberLongTasks.push(...list.getEntries().map(e=>e.duration))}).observe({type:'longtask',buffered:true})});
 for(const file of ['admin-media.html','media-login.html'])for(const width of [375,390,430,1440]){
  await page.setViewport({width,height:900,isMobile:width<500,deviceScaleFactor:1});await page.goto(origin+'/'+file,{waitUntil:'networkidle0'});
  await page.waitForSelector(file.startsWith('admin')?'.media-members .member-form':'#viewer-account .member-material');
  for(const l of ['ru','en']){await page.evaluate(l=>window.setLanguage(l),l);await new Promise(r=>setTimeout(r,100));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.$eval('html',n=>n.lang),l);checks++}
  if([390,1440].includes(width))await page.screenshot({path:path.join(out,file+'-'+width+'.png'),fullPage:true});
  metrics.push({file,width,...await page.evaluate(()=>({longTasks:window.memberLongTasks.length,longestTaskMs:Math.max(0,...window.memberLongTasks),heapBytes:performance.memory?.usedJSHeapSize??null,domElements:document.querySelectorAll('*').length}))});
 }
 await page.goto(origin+'/admin-media.html',{waitUntil:'networkidle0'});await page.waitForSelector('.media-members');
 await page.type('.media-members input[name=expiry]','');
 await page.evaluate(()=>{document.querySelector('input[name=expiry]').value='2030-12-31T12:00';document.querySelector('input[name=reason]').value='LOCAL TEST permission';const form=document.querySelector('input[name=reason]').form;form.requestSubmit()});
 await page.waitForFunction(()=>document.querySelectorAll('.media-members .member-material').length===2);assert.ok(calls.some(([m,p])=>m==='POST'&&p.endsWith('/grants')));checks++;
 page.on('dialog',d=>d.accept());await page.evaluate(()=>{const blocks=document.querySelectorAll('.media-members .member-material');blocks[1].querySelector('button').click()});await page.waitForFunction(()=>document.querySelectorAll('.media-members .member-material').length===1);checks++;
 await page.click('.media-members > button');
 await page.evaluate(()=>{const form=document.querySelector('#collection-editor form');for(const locale of ['ru','en'])for(const key of ['title','description'])form.elements[key+'_'+locale].value='LOCAL COLLECTION';form.querySelector('[type=checkbox]').checked=true;form.requestSubmit()});
 await page.waitForFunction(()=>[...document.querySelectorAll('.media-members > button')].some(b=>b.textContent==='LOCAL COLLECTION'));assert.ok(calls.some(([m,p])=>m==='POST'&&p.endsWith('/collections')));checks++;
 registered=false;await page.goto(origin+'/media-login.html',{waitUntil:'networkidle0'});assert.equal(await page.$eval('#viewer-account code',n=>n.textContent),'LOCAL_VERIFIED_SUB');checks++;
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({checks,errors,metrics,browser:'Chrome',widths:[375,390,430,1440],mode:'Local UI fixtures, not production authentication'},null,2));console.log(JSON.stringify({checks,errors,metrics,screenshots:out}));
}finally{await browser.close();chrome.kill();await new Promise(r=>server.close(r))}
