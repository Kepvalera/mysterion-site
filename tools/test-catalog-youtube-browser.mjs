import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const puppeteer=require(require.resolve('puppeteer-core',{paths:[path.resolve('output/audit-tools/lighthouse')]}));
const root=process.cwd(),ids=['abcdefghijk','lmnopqrstuv'],errors=[],requests=[];
const videos=ids.map((youtube_ref,index)=>({id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,title:{ru:`Local thumb test ${index+1}`,en:`Local thumbnail test ${index+1}`},description:{ru:'Local browser fixture',en:'Local browser fixture'},category:'sermon',year:2026,access:'free',price_minor:0,currency:'EUR',youtube_ref}));
const svg=(width,height)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#d4b778"/></svg>`;
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ytimg.com; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.mediadelivery.net https://vk.com https://vkvideo.ru; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/platform/catalog'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({courses:[],videos}));return}
  const play=url.pathname.match(/^\/api\/platform\/play\/([a-f0-9-]+)$/);
  if(play){const video=videos.find(item=>item.id===play[1]);requests.push(url.pathname);res.writeHead(video?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify(video?{type:'youtube',id:video.youtube_ref}:{error:'not_found'}));return}
  const file=url.pathname==='/catalog'||url.pathname==='/catalog.html'?'catalog.html':url.pathname.slice(1);
  if(!['catalog.html','catalog.js','platform-client.js','platform.css'].includes(file)){res.writeHead(404);res.end();return}
  const headers={'Content-Type':contentTypes[path.extname(file)]||'application/octet-stream'};
  if(file==='catalog.html')headers['Content-Security-Policy']=policy;
  res.writeHead(200,headers);res.end(await fs.readFile(path.join(root,file)));
 }catch(error){res.writeHead(500);res.end(String(error))}
});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(/Content Security Policy|Refused to load/i.test(message.text()))errors.push(message.text())});
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.hostname==='i.ytimg.com'){
   const [,id,quality]=url.pathname.match(/^\/vi\/([\w-]+)\/(maxresdefault|hqdefault|mqdefault)\.jpg$/)||[];
   if(id===ids[0])return request.respond({status:200,contentType:'image/svg+xml',body:svg(quality==='mqdefault'?320:120,quality==='mqdefault'?180:90)});
   return request.respond({status:404,contentType:'text/plain',body:'missing thumbnail fixture'});
  }
  if(url.hostname==='www.youtube-nocookie.com')return request.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Local mocked player</title>'});
  return request.continue();
 });

 let checks=0;
 for(const viewport of [{width:1440,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]){
  await page.setViewport({width:viewport.width,height:viewport.height});
  await page.goto(origin+'/catalog',{waitUntil:'networkidle0'});
  const card='.platform-record:nth-of-type(1)',preview=page.locator(card+' .youtube-preview');
  await page.waitForFunction(()=>{const img=document.querySelector('.youtube-preview img');return img?.naturalWidth===320});
  assert.match(await page.$eval(card+' .youtube-preview img',img=>img.getAttribute('src')),/\/mqdefault\.jpg$/);
  assert.equal(await page.$eval(card+' .youtube-preview img',img=>img.naturalWidth),320);
  assert.equal(await page.$$eval(card+' .youtube-preview-play',nodes=>nodes.length),1);
  await page.waitForSelector('.youtube-preview-fallback');
  assert.equal(await page.$eval('.platform-record:nth-of-type(2)',element=>element.querySelector('.youtube-preview-fallback').innerText),'MYSTERION\nINTERNATIONAL');
  checks+=4;
  await preview.click();
  await page.waitForSelector('#catalog-detail-body iframe');
  const fromThumbnail=await page.$eval('#catalog-detail-body iframe',frame=>frame.getAttribute('src'));
  await page.locator('#catalog-close').click();
  await page.locator(card+' .platform-actions button').click();
  await page.waitForSelector('#catalog-detail-body iframe');
  const fromWatch=await page.$eval('#catalog-detail-body iframe',frame=>frame.getAttribute('src'));
  assert.equal(fromThumbnail,fromWatch);
  assert.match(fromWatch,/youtube-nocookie\.com\/embed\/abcdefghijk$/);
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(layout.scrollWidth<=layout.width,`${viewport.name} layout overflows horizontally`);
  checks+=4;
  await page.locator('#catalog-close').click();
 }
 assert.deepEqual(errors,[]);
 assert.equal(requests.filter(path=>path.endsWith(videos[0].id)).length,4);
 console.log(JSON.stringify({checks,viewports:['desktop','mobile'],maxresAndHqPlaceholdersDetected:true,mqFallbackLoaded:true,allSizesUnavailableShowsBrandFallback:true,thumbnailAndWatchOpenSamePlayer:true,cspErrors:errors.length,playRequests:requests.length}));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
