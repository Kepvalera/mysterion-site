import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile('viewer-account.js','utf8');
function page(lang='ru'){
 const nodes=new Map(),timers=new Map();let timerId=0;
 const element=()=>({hidden:false,disabled:false,value:'',textContent:'',dataset:{},setAttribute(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const form=get('viewer-form');form.elements=Object.fromEntries(['email','password','confirm'].map(k=>[k,element()]));
 const tabs=['login','register','forgot','resend'].map(action=>({...element(),dataset:{authAction:action}}));
 const dataNodes=['hint','invalid_password'].map(key=>({...element(),dataset:{auth:key}}));
 let handler=async()=>Response.json({authenticated:false});
 const context=vm.createContext({document:{documentElement:{lang},hidden:false,getElementById:get,querySelectorAll:selector=>selector==='[data-auth]'?dataNodes:tabs,addEventListener(){}},
  window:{addEventListener(){},dispatchEvent(){}},location:{hash:'',pathname:'/viewer-account.html'},history:{replaceState(){}},sessionStorage:{getItem(){},setItem(){},removeItem(){}},
  AbortController,Event,CustomEvent,URLSearchParams,TypeError,console,
  setTimeout(callback,ms){assert.equal(ms,20000);timers.set(++timerId,callback);return timerId},clearTimeout(id){timers.delete(id)},setInterval(){},fetch:(url,options)=>handler(url,options)});
 vm.runInContext(source,context);
 return {get,form,tabs,dataNodes,timers,setFetch(fn){handler=fn},async flush(){for(let i=0;i<20;i++)await Promise.resolve()},async submit(){form.elements.email.value='local@example.invalid';form.elements.password.value='Local8!?';form.elements.confirm.value='Local8!?';return form.onsubmit({preventDefault(){}})}};
}
let checks=0;
for(const lang of ['ru','en']){
 const p=page(lang);await p.flush();assert.equal(p.timers.size,0);p.tabs[1].onclick();
 assert.equal(p.form.elements.password.minLength,8);
 assert.ok(p.dataNodes.every(n=>!n.textContent.includes('15')));assert.ok(p.dataNodes.every(n=>n.textContent.includes('8')));checks++;
 for(const stuckBody of [false,true]){
  let signal;p.setFetch(async(url,options)=>{signal=options.signal;return stuckBody?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{})});
  const pending=p.submit();await p.flush();assert.equal(p.get('viewer-submit').disabled,true);assert.equal(p.timers.size,1);
  [...p.timers.values()][0]();await pending;
  assert.equal(signal.aborted,true);assert.equal(p.get('viewer-submit').disabled,false);assert.equal(p.timers.size,0);
  assert.match(p.get('viewer-status').textContent,lang==='ru'?/не ответил вовремя/:/did not respond in time/);checks++;
 }
 // Retrying after a timeout is possible; no automatic POST retry.
 let calls=0;p.setFetch(async()=>{calls++;return Response.json({ok:true},{status:202})});await p.submit();assert.equal(calls,1);assert.equal(p.get('viewer-submit').disabled,false);assert.equal(p.timers.size,0);checks++;
 p.setFetch(async()=>{throw new TypeError('PRIVATE_NETWORK_DETAIL')});await p.submit();assert.match(p.get('viewer-status').textContent,lang==='ru'?/Проверьте соединение/:/Check your connection/);assert.ok(!p.get('viewer-status').textContent.includes('PRIVATE_'));checks++;
 const id='01234567-89ab-4cde-8fab-0123456789ab';p.setFetch(async()=>Response.json({error:'viewer_service_unavailable',requestId:id},{status:503}));await p.submit();assert.ok(p.get('viewer-status').textContent.includes(id));checks++;
 p.setFetch(async()=>Response.json({error:'PRIVATE_ERROR',requestId:'PRIVATE_TOKEN'},{status:503}));await p.submit();assert.ok(!p.get('viewer-status').textContent.includes('PRIVATE_'));checks++;
 p.setFetch(async()=>Response.json({error:'rate_limited',retryAfter:300},{status:429,headers:{'Retry-After':'125'}}));await p.submit();assert.match(p.get('viewer-status').textContent,lang==='ru'?/2 мин 5 сек/:/2 min 5 sec/);checks++;
 p.setFetch(async()=>Response.json({error:'rate_limited',retryAfter:25},{status:429}));await p.submit();assert.match(p.get('viewer-status').textContent,lang==='ru'?/25 сек/:/25 sec/);checks++;
 p.setFetch(async()=>Response.json({error:'rate_limited',retryAfter:'PRIVATE_TOKEN'},{status:429,headers:{'Retry-After':'invalid'}}));await p.submit();assert.ok(!/NaN|PRIVATE_TOKEN/.test(p.get('viewer-status').textContent));assert.match(p.get('viewer-status').textContent,lang==='ru'?/Повторите позже/:/Retry later/);checks++;
}
console.log(JSON.stringify({checks,languages:['ru','en'],timeoutMs:20000,timeoutDuringFetch:true,timeoutDuringBody:true,retry:true,productionRequests:0}));
