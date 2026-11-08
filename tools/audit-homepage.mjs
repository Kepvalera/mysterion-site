// Local-only homepage audit. Run from the repository root with Node 24+.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
const root=process.cwd(), mode=process.argv[2]||'before';
const out=path.join(root,'output/homepage-audit',mode);
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const bytes=await fs.readFile(file);
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'mysterion-home-audit-'));
const browser=spawn(chrome,['--headless','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try {
 let port;
 for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await sleep(100);}}
 if(!port)throw Error('Chrome did not start');
 const page=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 let id=0;const pending=new Map(),errors=[],networkErrors=[];
 socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.loadingFailed')networkErrors.push(m.params);};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const js=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 for(const name of ['Page','Runtime','Network','Performance'])await cdp(name+'.enable');
 const init=`window.__audit={tasks:[],shifts:[],lcp:[],events:[]};for(const [type,key] of [['longtask','tasks'],['layout-shift','shifts'],['largest-contentful-paint','lcp'],['event','events']]){try{new PerformanceObserver(list=>{for(const e of list.getEntries()){window.__audit[key].push({start:e.startTime,duration:e.duration,value:e.value,hadRecentInput:e.hadRecentInput,size:e.size,url:e.url,tag:e.element?.tagName,id:e.element?.id,name:e.name,interactionId:e.interactionId})}}).observe({type,buffered:true,durationThreshold:16});}catch{}}window.__sprites=[];const original=CanvasRenderingContext2D.prototype.putImageData;CanvasRenderingContext2D.prototype.putImageData=function(...args){const result=original.apply(this,args);if(new Error().stack.includes('heavenly.js'))window.__sprites.push(this.canvas);return result;};`;
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:init});
 const rows=[];
 for(const width of [390,1440]){
  console.log(`${mode}: loading ${width}`);
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
  await cdp('Network.clearBrowserCache');
  await cdp('Page.navigate',{url:base+'/index.html'});
  await js(`new Promise(resolve=>{let n=0;const t=setInterval(()=>{if((typeof setLanguage==='function'&&document.querySelector('.heavenly-hero')?.dataset.active)||n++>200){clearInterval(t);resolve(true)}},100)})`);
  await js('document.fonts.ready.then(()=>true)');await sleep(4000);
  const vitals=await js(`(()=>{const a=__audit,fcp=performance.getEntriesByName('first-contentful-paint')[0]?.startTime||null,lcp=a.lcp.at(-1),cls=a.shifts.filter(s=>!s.hadRecentInput).reduce((s,e)=>s+e.value,0);return {fcp,lcp,cls,startupTasks:a.tasks,blockingTimeWindowMs:a.tasks.filter(t=>t.start>=fcp).reduce((s,e)=>s+Math.max(0,e.duration-50),0),resources:performance.getEntriesByType('resource').map(e=>({name:e.name.replace(location.origin,''),duration:e.duration,size:e.transferSize}))}})()`);
  if(mode==='before'&&width===390){
   const sprites=await js(`__sprites.map((c,i)=>({i,width:c.width,height:c.height,data:c.toDataURL('image/webp',.99).split(',')[1]}))`);
   await fs.mkdir(path.join(root,'output/homepage-audit/hero-sprites'),{recursive:true});
   for(const s of sprites)await fs.writeFile(path.join(root,`output/homepage-audit/hero-sprites/sprite-${s.i}-${s.width}x${s.height}.webp`),Buffer.from(s.data,'base64'));
  }
  const frames=await js(`(async()=>{const result={};for(const name of ['hero','scroll']){scrollTo({top:0,behavior:'instant'});await new Promise(r=>setTimeout(r,250));const deltas=[],taskStart=__audit.tasks.length;let last;await new Promise(resolve=>{const start=performance.now();function tick(t){if(last)deltas.push(t-last);last=t;if(name==='scroll')scrollTo({top:Math.min(1,(t-start)/5000)*(document.documentElement.scrollHeight-innerHeight),behavior:'instant'});if(t-start<5000)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)});const sorted=[...deltas].sort((a,b)=>a-b);result[name]={fps:1000*deltas.length/deltas.reduce((a,b)=>a+b,0),p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...deltas),over50:deltas.filter(d=>d>50).length,tasks:__audit.tasks.slice(taskStart)}}return result})()`);
  await cdp('HeapProfiler.collectGarbage');const memoryBefore=await cdp('Performance.getMetrics'),domBefore=await cdp('Memory.getDOMCounters');
  await js(`(async()=>{for(let cycle=0;cycle<3;cycle++){for(const node of document.querySelectorAll('main>section')){node.scrollIntoView({behavior:'instant',block:'start'});await new Promise(r=>setTimeout(r,120));}}return true})()`);
  await cdp('HeapProfiler.collectGarbage');const memoryAfter=await cdp('Performance.getMetrics'),domAfter=await cdp('Memory.getDOMCounters');
  const pageState=await js(`(()=>{const sections=[...document.querySelectorAll('main>section')].map(e=>({id:e.id||e.className,height:Math.round(e.clientHeight),background:getComputedStyle(e).backgroundImage,padding:getComputedStyle(e).paddingBlock}));return {overflow:document.documentElement.scrollWidth>innerWidth+1,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.getAttribute('src')),sections,canvas:[...document.querySelectorAll('canvas')].map(c=>({class:c.className,width:c.width,height:c.height})),runningAnimations:document.getAnimations().filter(a=>a.playState==='running').length,links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))}})()`);
  await js(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=650){scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,80));}await new Promise(r=>setTimeout(r,1200));scrollTo({top:0,behavior:'instant'});return true})()`);await sleep(500);
  const full=await js(`({x:0,y:0,width:innerWidth,height:document.documentElement.scrollHeight,scale:1})`);
  await js(`document.querySelector('.site-header').style.position='absolute';document.querySelector('.reading-progress').style.visibility='hidden';true`);
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:full});await fs.writeFile(path.join(out,`homepage-${width}.png`),Buffer.from(shot.data,'base64'));
  await js(`document.querySelector('.site-header').style.position='';document.querySelector('.reading-progress').style.visibility='';true`);
  rows.push({width,vitals,frames,memoryBefore:memoryBefore.metrics.filter(m=>/JSHeap|Nodes|EventListeners/.test(m.name)),memoryAfter:memoryAfter.metrics.filter(m=>/JSHeap|Nodes|EventListeners/.test(m.name)),domBefore,domAfter,pageState});
  console.log(`${mode}: measured ${width} FCP=${vitals.fcp} CLS=${vitals.cls} LCP=${vitals.lcp?.start}`);
 }
 const report={mode,method:'Local HTTP; headless Chrome on desktop; DPR1; unthrottled CDP. rAF cadence is not presented GPU FPS. Fixed-window vital entries are lab samples, not field CWV. Three short scroll cycles cannot prove absence of leaks.',errors,networkErrors,rows};
 if(mode==='after'){
  const checks=[];
  for(const width of [320,375,390,430,768,1440]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
   for(const lang of ['ru','en'])checks.push(await js(`setLanguage('${lang}');({width:innerWidth,lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth+1,foundersColor:getComputedStyle(document.querySelector('#founders-heading')).color,emptyTranslations:[...document.querySelectorAll('[data-i18n],[data-editorial],[data-jubilee]')].filter(e=>!e.textContent.trim()).length})`));
  }
  report.checks=checks;
  report.menu=await js(`(()=>{const b=document.querySelector('.menu-toggle'),m=document.querySelector('#mobile-nav');b.click();const open=!m.hidden;document.querySelector('#mobile-nav a').click();return {open,closedAfterLink:m.hidden}})()`);
  const links=[...new Set(rows.at(-1).pageState.links)];report.routes=[];
  for(const link of links){if(link.startsWith('#')){report.routes.push({link,exists:await js(`!!document.getElementById(${JSON.stringify(link.slice(1))})`)});}else if(!/^(https?:|mailto:|tel:)/.test(link)){const response=await fetch(base+'/'+link.split('#')[0]);const body=await response.text();const hash=link.split('#')[1];report.routes.push({link,status:response.status,anchor:hash?body.includes(`id="${hash}"`):true});}}
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
  await js(`setLanguage('ru');scrollTo({top:0,behavior:'instant'});true`);await sleep(500);
  report.crown=await js(`(async()=>{const c=document.querySelector('.heavenly-canvas'),stage=document.querySelector('.heavenly-crown-stage'),a=c.toDataURL(),b=getComputedStyle(stage).transform;await new Promise(r=>setTimeout(r,1200));const result={skyChanged:a!==c.toDataURL(),crownMoved:b!==getComputedStyle(stage).transform};let max=0;for(let i=0;i<65;i++){max=Math.max(max,...[...document.querySelectorAll('.crown-sapphire')].map(e=>Number(getComputedStyle(e).opacity)));await new Promise(r=>setTimeout(r,100));}result.sapphireMaxOpacity=max;return result})()`);
  await js(`document.querySelector('#founders').scrollIntoView({behavior:'instant'});true`);await sleep(300);
  report.clouds=await js(`(async()=>{const e=document.querySelector('.founders-cloud'),a=getComputedStyle(e).transform;await new Promise(r=>setTimeout(r,1200));return {moving:a!==getComputedStyle(e).transform,loaded:[...document.querySelectorAll('.founders-cloud')].filter(e=>getComputedStyle(e).display!=='none').every(e=>e.querySelector('img').naturalWidth>0)}})()`);
  report.soak=[];
  for(let sample=0;sample<=3;sample++){
   if(sample){console.log('60-second memory/scroll soak, checkpoint',sample*20);await js(`new Promise(resolve=>{const start=performance.now(),max=document.documentElement.scrollHeight-innerHeight;function tick(t){scrollTo({top:(.5+.5*Math.sin((t-start)/3000))*max,behavior:'instant'});if(t-start<20000)requestAnimationFrame(tick);else resolve(true)}requestAnimationFrame(tick)})`);}
   await cdp('HeapProfiler.collectGarbage');const metrics=await cdp('Performance.getMetrics');
   report.soak.push({seconds:sample*20,heap:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,...await cdp('Memory.getDOMCounters')});
  }
  report.offscreen=await js(`(()=>{scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});return new Promise(resolve=>setTimeout(()=>resolve({hero:document.querySelector('.heavenly-hero').dataset.active,founders:document.querySelector('#founders').dataset.visible,events:document.querySelector('#events').dataset.active,jubilee:document.querySelector('.jubilee-banner').dataset.skyActive,about:getComputedStyle(document.querySelector('.about-ambient')).animationPlayState}),300))})()`);
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(200);
  report.reduced=await js(`({infinite:document.getAnimations().filter(a=>a.effect?.getTiming().iterations===Infinity&&a.playState==='running').length,hero:document.querySelector('.heavenly-hero').dataset.active,jubilee:document.querySelector('.jubilee-banner').dataset.skyActive})`);
  await cdp('Emulation.setEmulatedMedia',{features:[]});
  await cdp('Emulation.setScriptExecutionDisabled',{value:true});await cdp('Page.navigate',{url:base+'/index.html'});await sleep(3000);
  await cdp('Emulation.setScriptExecutionDisabled',{value:false});report.noJS=await js(`({aboutOpacity:getComputedStyle(document.querySelector('.about-heading-block')).opacity,copyOpacity:getComputedStyle(document.querySelector('.about-copy-block')).opacity,images:[...document.images].length})`);
 }
 await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2));
 console.log(`Saved ${out}/audit.json`);
 await cdp('Page.close');socket.close();
 if(process.argv.includes('--lighthouse')){
  const cli=path.join(root,'output/audit-tools/lighthouse/node_modules/lighthouse/cli/index.js');
  for(const form of ['mobile','desktop']){
   const args=[cli,base+'/index.html','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output=html',`--output-path=${path.join(out,'lighthouse-'+form)}`,'--quiet','--chrome-flags=--headless --no-first-run','--max-wait-for-load=45000'];
   if(form==='desktop')args.push('--preset=desktop');
   console.log(`Lighthouse ${mode} ${form}`);
   const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{windowsHide:true,env:{...process.env,CHROME_PATH:chrome},stdio:['ignore','pipe','pipe']});
    const timeout=setTimeout(()=>{console.error('Lighthouse timed out; stopping only its owned process tree',child.pid);spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},120000);
    child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));
    child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',code=>{clearTimeout(timeout);resolve(code);});
   });
   if(code)throw Error(`Lighthouse failed ${code}`);
  }
 }
}finally{socket?.close();browser.kill();await new Promise(r=>server.close(r));}
