import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),puppeteer=require(require.resolve('puppeteer-core',{paths:[path.resolve('output/audit-tools/lighthouse')]}));
const root=process.cwd(),ids={youtube:'00000000-0000-4000-8000-000000000001',vk:'00000000-0000-4000-8000-000000000002',dual:'00000000-0000-4000-8000-000000000003',bunny:'00000000-0000-4000-8000-000000000004'},yt='abcdefghijk',vk='https://vk.com/video_ext.php?oid=-123&id=456',errors=[],requests=[];
const item=(id,title,source={})=>({id,title:{ru:title,en:title+' EN'},description:{ru:'Тестовая запись',en:'Local fixture'},category:'sermon',year:2026,access:'free',price_minor:0,currency:'EUR',has_cover:false,...source});
const items=[item(ids.youtube,'Только YouTube',{youtube_ref:yt}),item(ids.vk,'Только VK',{vk_ref:vk}),item(ids.dual,'YouTube и VK',{youtube_ref:yt,vk_ref:vk,has_cover:true}),item(ids.bunny,'Bunny Stream',{has_cover:true})];
const bunnyURL='https://player.mediadelivery.net/embed/803179/00000000-0000-4000-8000-000000000004?token='+('a'.repeat(64))+'&expires=2000000000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#d4b778"/></svg>';
const policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://i.ytimg.com; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.mediadelivery.net https://vk.com https://vkvideo.ru; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/media/videos'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({items,hasMore:false}));return}
  if(url.pathname==='/api/media/session'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"authenticated":false}');return}
  const video=url.pathname.match(/^\/api\/media\/videos\/([a-f0-9-]{36})\/(play|cover|vk-cover)$/);
  if(video){
   const [,id,kind]=video;requests.push({id,kind,source:url.searchParams.get('source')});
   if(kind==='cover'||kind==='vk-cover'){res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});res.end(svg);return}
   const data=id===ids.bunny?{type:'bunny',url:bunnyURL}:url.searchParams.get('source')==='vk'||id===ids.vk?{type:'vk',url:vk}:{type:'youtube',id:yt};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return
  }
  const file=url.pathname==='/sermons'||url.pathname==='/sermons.html'?'sermons.html':url.pathname.slice(1);
  if(!['sermons.html','sermons-page.js','media-player.js','script.js','account.js','styles.css','sermons.css','account.css','favicon.svg','mysterion-crown.webp'].includes(file)){res.writeHead(404);res.end();return}
  const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream'};
  if(file==='sermons.html'){headers['Content-Security-Policy']=policy;headers['Referrer-Policy']='strict-origin-when-cross-origin'}
  res.writeHead(200,headers);res.end(await fs.readFile(path.join(root,file)));
 }catch(error){res.writeHead(500);res.end(String(error))}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;let browser,checks=0;
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(/Content Security Policy|Refused to load/i.test(message.text()))errors.push(message.text())});
 await page.setRequestInterception(true);
 page.on('request',request=>{const url=new URL(request.url());if(url.hostname==='i.ytimg.com')return request.respond({status:200,contentType:'image/svg+xml',body:svg});if(['www.youtube-nocookie.com','vk.com','player.mediadelivery.net'].includes(url.hostname))return request.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Local mock player</title>'});return request.continue()});
 for(const viewport of [{width:1440,height:1000,name:'desktop'},{width:390,height:844,name:'mobile'}]){
  await page.setViewport({width:viewport.width,height:viewport.height,isMobile:viewport.width<500});await page.goto(origin+'/sermons',{waitUntil:'networkidle0'});
  assert.equal(await page.$$eval('.video-card',nodes=>nodes.length),4,'one card per record');
  assert.ok((await page.$eval('.video-card:nth-of-type(3) .video-thumb img',image=>image.getAttribute('src'))).endsWith(`/api/media/videos/${ids.dual}/cover`),'manual cover has priority');
  await page.click('.video-card:nth-of-type(3) .video-thumb');await page.waitForSelector('#video-player iframe');
  assert.equal(await page.$$eval('.video-source-switcher button',nodes=>nodes.length),2);assert.equal(await page.$eval('.video-source-switcher button:first-child',button=>button.getAttribute('aria-pressed')),'true');
  const youtubeFrame=await page.$eval('#video-player iframe',frame=>frame.getAttribute('src'));assert.match(youtubeFrame,/youtube-nocookie\.com\/embed\/abcdefghijk$/);
  await page.click('.video-source-switcher button:nth-of-type(2)');await page.waitForFunction(()=>document.querySelector('#video-player iframe')?.src.includes('vk.com/video_ext.php'));
  assert.equal(await page.$$eval('#video-player iframe',nodes=>nodes.length),1,'old source stopped before new source loads');assert.equal(await page.$eval('.video-source-switcher button:nth-of-type(2)',button=>button.getAttribute('aria-pressed')),'true');
  await page.click('.dialog-close');await page.click('.video-card:nth-of-type(3) .video-watch');await page.waitForSelector('#video-player iframe');
  assert.equal(await page.$eval('#video-player iframe',frame=>frame.getAttribute('src')),youtubeFrame,'Watch button opens the same default source');
  assert.equal(await page.$$eval('.video-source-switcher button',nodes=>nodes.length),2);await page.click('.dialog-close');
  for(const index of [1,2]){await page.click(`.video-card:nth-of-type(${index}) .video-thumb`);await page.waitForSelector('#video-player iframe');assert.equal(await page.$eval('.video-source-switcher',element=>element.hidden),true,'single-source item has no switcher');await page.click('.dialog-close')}
  await page.click('.video-card:nth-of-type(4) .video-thumb');await page.waitForFunction(()=>document.querySelector('#video-player iframe')?.src.includes('player.mediadelivery.net'));assert.equal(await page.$eval('.video-source-switcher',element=>element.hidden),true,'Bunny item is not affected');await page.click('.dialog-close');
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(layout.scrollWidth<=layout.width,`${viewport.name} horizontal overflow`);checks+=12;
 }
 await page.click('.lang-toggle');await page.click('[data-lang="en"]');assert.equal(await page.$eval('h1',element=>element.innerText),'Sermons\nand teaching.');checks++;
 assert.deepEqual(errors,[]);assert.ok(requests.some(r=>r.id===ids.dual&&r.kind==='play'&&r.source==='vk'));
 console.log(JSON.stringify({checks,viewports:['desktop','mobile'],singleSource:true,dualSourceSwitch:true,oldIframeStopped:true,customCoverPriority:true,bunnyUnaffected:true,ruEn:true,duplicateCards:false,cspErrors:errors.length,remoteWrites:0}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
