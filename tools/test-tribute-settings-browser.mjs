// Local browser fixtures only. No Cloudflare credentials or Tribute calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {platformAdminTemplate} from '../media-worker/src/platform-admin-template.mjs';
const require=createRequire(import.meta.url),puppeteer=require(require.resolve('puppeteer-core',{paths:[path.resolve('output/audit-tools/lighthouse')]}));
const fixtureSecret='LOCAL_UI_FIXTURE_NEVER_A_REAL_KEY',requests=[],errors=[];
let role='owner',mode='standard',pending,legacyCache=false,legacyAssetLoads=0,versionedAssetLoads=0;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local'),pathname=url.pathname;
  if(pathname==='/cache-prior-admin'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(platformAdminTemplate.replace(/\/platform-admin\.js\?[^" ]+/, '/platform-admin.js'));return}
  if(pathname==='/admin-media'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(platformAdminTemplate);return}
  if(pathname==='/platform-admin.js'&&legacyCache){
   res.setHeader('Content-Type','text/javascript; charset=utf-8');
   if(!url.search){legacyAssetLoads++;res.setHeader('Cache-Control','public, max-age=14400, must-revalidate');res.end('window.__legacyAdminAsset=true;');return}
   versionedAssetLoads++;res.setHeader('Cache-Control','no-cache');res.end(await fs.readFile('platform-admin.js'));return;
  }
  if(pathname.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(pathname.endsWith('/me')){res.end(JSON.stringify({role,owner:role==='owner',canPublish:role!=='uploader',uploadConfigured:false,paidEnabled:false}));return}
   if(pathname.endsWith('/integrations/tribute/check')){
    let body='';for await(const chunk of req)body+=chunk;
    requests.push({method:req.method,body,cookie:req.headers.cookie,xRequestedWith:req.headers['x-requested-with']});
    if(mode==='hold'){pending=res;return}
    if(mode==='unauthorized'){res.writeHead(502);res.end('{"error":"tribute_api_unauthorized"}');return}
    if(mode==='unsafe-error'){res.writeHead(502);res.end(JSON.stringify({error:fixtureSecret}));return}
    res.end(JSON.stringify(mode==='empty'?{apiAccessible:true,activeShopFound:false,shops:[],rubPaymentTested:false}:{apiAccessible:true,activeShopFound:true,shops:[{active:true,onlyStars:mode==='stars',unexpected:fixtureSecret}],rubPaymentTested:false}));return;
   }
   res.end(JSON.stringify(pathname.endsWith('/overview')?{participants:0,videos:0,courses:0,orders:0}:{items:[]}));return;
  }
  const file=path.resolve('.'+pathname);if(!file.startsWith(process.cwd()+path.sep))throw Error();
  res.setHeader('Content-Type',path.extname(file)==='.js'?'text/javascript; charset=utf-8':'text/css');res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'tribute-settings-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await new Promise(r=>setTimeout(r,100))}}
const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port});let checks=0;
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.setCookie({name:'local_fixture_session',value:'local-only',url:origin,httpOnly:true});
 assert.match(platformAdminTemplate,/src="\/platform-admin\.js\?v=/);
 assert.match(await fs.readFile('_headers','utf8'),/\/platform-admin\.js\r?\n\s+Cache-Control: no-cache/);
 legacyCache=true;
 await page.goto(origin+'/cache-prior-admin',{waitUntil:'networkidle0'});
 assert.equal(await page.evaluate(()=>window.__legacyAdminAsset),true);
 await page.goto(origin+'/cache-prior-admin?visit=2',{waitUntil:'networkidle0'});
 assert.equal(legacyAssetLoads,1); // A subsequent visit retained the old four-hour JS cache.
 assert.equal(await page.$('[data-section=settings]'),null);
 await page.goto(origin+'/admin-media',{waitUntil:'networkidle0'});
 await page.click('[data-section=settings]');
 assert.equal(await page.$$eval('#platform-content button',nodes=>nodes.some(n=>/Tribute Shop/.test(n.textContent))),true);
 assert.equal(await page.evaluate(()=>window.__legacyAdminAsset),undefined);
 assert.equal(versionedAssetLoads,1);
 checks+=7;legacyCache=false;
 const open=async()=>{await page.goto(origin+'/admin-media',{waitUntil:'networkidle0'});await page.click('[data-section=settings]')};
 const click=()=>page.$$eval('#platform-content button',nodes=>nodes.find(n=>/Tribute Shop/.test(n.textContent)).click());
 const result=()=>page.$eval('#platform-content [role=status]',n=>n.textContent);
 for(const width of [320,390,768,1440]){
  await page.setViewport({width,height:900,isMobile:width<500});await open();await click();await page.waitForFunction(()=>document.querySelector('#platform-content [role=status]').textContent.includes('onlyStars: false'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal((await result()).includes(fixtureSecret),false);checks+=2;
 }
 await page.evaluate(()=>document.documentElement.lang='en');await page.click('[data-section=settings]');await click();await page.waitForFunction(()=>document.querySelector('#platform-content [role=status]').textContent.includes('Tribute API: available.'));checks++;
 mode='stars';await click();await page.waitForFunction(()=>document.querySelector('#platform-content [role=status]').textContent.includes('onlyStars: true'));checks++;
 mode='empty';await click();await page.waitForFunction(()=>document.querySelector('#platform-content [role=status]').textContent.includes('unknown'));checks++;
 for(const next of ['unauthorized','unsafe-error']){mode=next;await click();await page.waitForFunction(()=>document.querySelector('#platform-content [role=status]').textContent.includes('check failed'));assert.equal((await result()).includes(fixtureSecret),false);checks++}
 mode='hold';const before=requests.length;await click();await page.waitForFunction(()=>[...document.querySelectorAll('#platform-content button')].some(n=>n.disabled));await page.$$eval('#platform-content button',nodes=>nodes[0].click());assert.equal(requests.length,before+1);checks++;
 await page.click('[data-section=overview]');pending.end(JSON.stringify({apiAccessible:true,activeShopFound:true,shops:[{active:true,onlyStars:false}]}));await new Promise(r=>setTimeout(r,100));assert.equal(await page.$('#platform-content [role=status]'),null);checks++;
 for(const next of ['publisher','uploader']){role=next;await open();assert.equal(await page.$$eval('#platform-content button',nodes=>nodes.some(n=>/Tribute Shop/.test(n.textContent))),false);checks++}
 assert.ok(requests.every(r=>r.method==='POST'&&r.body==='{}'&&r.cookie?.includes('local_fixture_session=local-only')&&r.xRequestedWith==='XMLHttpRequest'));checks++;
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks,cachedOldScriptReproduced:true,versionedScriptRestoresOwnerButton:true,ownerOnlyButton:true,currentSession:true,duplicateClicksBlocked:true,secretsNotDisplayed:true,staleResponseIgnored:true,errors,realTributeCalls:0}));
}finally{await browser.close();chrome.kill();await new Promise(r=>server.close(r))}
