import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {platformAdminTemplate} from '../media-worker/src/platform-admin-template.mjs';

const require=createRequire(import.meta.url),puppeteer=require(require.resolve('puppeteer-core',{paths:[path.resolve('output/audit-tools/lighthouse')]}));
const root=process.cwd(),out=path.resolve('output/member-login-history-check');
await fs.mkdir(out,{recursive:true});
const participants=Array.from({length:28},(_,index)=>({
 id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),
 email:index===0?'target@example.invalid':`batchneedle-${String(index).padStart(2,'0')}@example.invalid`,
 first_name:index===0?'Иван':'Guest',last_name:index===0?'Петров':'Participant',
 status:'active',email_verified_at:1,created_at:100-index
}));
const now=Math.floor(Date.now()/1000),logins=Array.from({length:25},(_,index)=>({
 id:'login-'+index,logged_in_at:now-index,ip_address:'192.0.2.'+(index+1),country:'US',device:'Desktop',browser:'Chrome 120'
}));
const requests=[];
const json=(response,data)=>{response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(data))};
const types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/admin-media.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(platformAdminTemplate);return}
  if(url.pathname==='/api/platform/admin/me'){requests.push(url.pathname);json(res,{role:'owner',owner:true,canPublish:true,uploadConfigured:false,paidEnabled:false});return}
  if(url.pathname==='/api/platform/admin/overview'){requests.push(url.pathname);json(res,{participants:participants.length,videos:0,courses:0,orders:0});return}
  if(url.pathname==='/api/platform/admin/participants'){
   requests.push(url.pathname+url.search);const query=(url.searchParams.get('q')||'').trim().toLocaleLowerCase('ru'),page=Math.max(1,Number(url.searchParams.get('page'))||1);
   const matches=participants.filter(item=>!query||[item.first_name,item.last_name,item.email,(item.first_name+' '+item.last_name)].some(value=>value.toLocaleLowerCase('ru').includes(query)));
   const pageSize=25,pages=Math.max(1,Math.ceil(matches.length/pageSize)),actual=Math.min(page,pages);
   json(res,{items:matches.slice((actual-1)*pageSize,actual*pageSize),page:actual,pageSize,total:matches.length,pages});return;
  }
  const history=url.pathname.match(/^\/api\/platform\/admin\/participants\/([^/]+)\/login-history$/);
  if(history){requests.push(url.pathname+url.search);const page=Math.max(1,Number(url.searchParams.get('page'))||1),pageSize=20,pages=Math.max(1,Math.ceil(logins.length/pageSize));json(res,{items:logins.slice((Math.min(page,pages)-1)*pageSize,Math.min(page,pages)*pageSize),page:Math.min(page,pages),pageSize,total:logins.length,pages});return}
  if(url.pathname.startsWith('/api/platform/admin/')){requests.push(url.pathname);json(res,{items:[]});return}
  if(url.pathname==='/cdn-cgi/access/logout'){res.writeHead(204);res.end();return}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep))throw Error('invalid path');
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{if(!res.headersSent)res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=path.join(out,'chrome-profile-'+crypto.randomUUID());
const chrome=await import('node:child_process').then(({spawn})=>spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'}));
let port;
for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await new Promise(resolve=>setTimeout(resolve,100))}}
if(!port){chrome.kill();server.close();await fs.rm(profile,{recursive:true,force:true});throw Error('Chrome unavailable')}
const browser=await puppeteer.connect({browserURL:'http://127.0.0.1:'+port}),errors=[];
let checks=0;
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:'+server.address().port+'/admin-media.html',{waitUntil:'networkidle0'});
 await page.waitForSelector('#platform-nav button');
 await page.click('[data-section="participants"]');
 await page.waitForSelector('#platform-content input[type="search"]');
 await page.waitForFunction(()=>document.getElementById('platform-status').textContent==='');
 assert.equal(await page.$$eval('#platform-content .platform-record',items=>items.length),25);checks++;
 const initialUrl=page.url();
 await page.$eval('#platform-content input[type="search"]',(input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))},'петров');
 await page.waitForFunction(()=>document.querySelectorAll('#platform-content .platform-record').length===1);
 await page.waitForFunction(()=>document.getElementById('platform-status').textContent==='');
 assert.equal(await page.$eval('#platform-content .platform-record h2',element=>element.textContent),'Иван Петров');assert.equal(page.url(),initialUrl);checks+=2;
 await page.$eval('#platform-content input[type="search"]',input=>{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.waitForFunction(()=>document.querySelectorAll('#platform-content .platform-record').length===25);
 await page.waitForFunction(()=>document.querySelector('.platform-member-pagination button:last-of-type'));
 await page.click('.platform-member-pagination button:last-of-type');
 await page.waitForFunction(()=>document.querySelectorAll('#platform-content .platform-record').length===3);
 assert.ok(requests.some(url=>url.includes('page=2')));checks+=2;
 await page.click('.platform-member-pagination button:first-of-type');
 await page.waitForFunction(()=>document.querySelectorAll('#platform-content .platform-record').length===25);
 await page.$eval('#platform-content input[type="search"]',(input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))},'target@example.invalid');
 await page.waitForFunction(()=>document.querySelectorAll('#platform-content .platform-record').length===1);
 await page.waitForFunction(()=>document.getElementById('platform-status').textContent==='');
 const buttons=await page.$$eval('#platform-content .platform-record .platform-actions button',nodes=>nodes.map(button=>button.textContent));
 assert.deepEqual(buttons,['Профиль и сессия','История входов']);checks++;
 await page.click('#platform-content .platform-record .platform-actions button:nth-child(2)');
 await page.waitForSelector('.platform-history-dialog[open]');
 assert.equal(await page.$eval('.platform-history-entry time',element=>Boolean(element.dateTime)),true);
 assert.equal(await page.$$eval('.platform-history-entry',items=>items.length),20);
 assert.equal(await page.$$eval('#platform-content .platform-record',items=>items.length),1);checks+=3;
 await page.click('.platform-history-pagination button:first-of-type');
 await page.waitForFunction(()=>document.querySelectorAll('.platform-history-entry').length===5);
 await page.click('.platform-history-pagination button:first-of-type');
 await page.waitForFunction(()=>document.querySelectorAll('.platform-history-entry').length===20);checks+=2;
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('.platform-history-dialog[open]'));
 await page.waitForSelector('#platform-content input[type="search"]');
 assert.equal(await page.$$eval('#platform-content .platform-record',items=>items.length),1);checks++;
 await page.setViewport({width:1440,height:960,isMobile:false,deviceScaleFactor:1});
 await page.waitForSelector('#platform-nav button');
 await page.click('[data-section="participants"]');
 await page.waitForSelector('#platform-content input[type="search"]');
 await page.waitForFunction(()=>document.getElementById('platform-status').textContent==='');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
 assert.equal(await page.$$eval('#platform-content .platform-record',items=>items.length),25);checks++;
 await page.screenshot({path:path.join(out,'participants-desktop.png'),fullPage:true});
 await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});
 await page.waitForSelector('#platform-nav button');
 await page.click('[data-section="participants"]');
 await page.waitForSelector('#platform-content input[type="search"]');
 await page.waitForFunction(()=>document.getElementById('platform-status').textContent==='');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++;
 assert.equal(await page.$$eval('#platform-content .platform-record',items=>items.length),25);checks++;
 await page.screenshot({path:path.join(out,'participants-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks,errors,viewports:[390,1440],searchedWithoutReload:true,participantPages:[25,3],historyPages:[20,5],extraMainListRows:0,productionWrites:0,screenshots:out}));
}finally{
 await browser.close();if(chrome.exitCode===null){const exited=new Promise(resolve=>chrome.once('close',resolve));chrome.kill();await exited}await new Promise(resolve=>server.close(resolve));await fs.rm(profile,{recursive:true,force:true});
}
