// Memory-only tests; no real keys, provider requests, payments or remote D1.
import assert from 'node:assert/strict';
import {checkTributeShops} from '../media-worker/src/tribute-shop-check.mjs';
import {handlePlatform} from '../media-worker/src/platform.mjs';
import {platformFixture} from './platform-local-fixture.mjs';

const f=await platformFixture(),originalFetch=globalThis.fetch,originalWarn=console.warn;
const key='LOCAL_TRIBUTE_FIXTURE_NOT_A_REAL_API_KEY',logs=[],requests=[];
let checks=0,provider=()=>Response.json([{id:12,status:1,onlyStars:false,name:key,callbackUrl:key}]);
const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://tribute.tg/api/v1/shops')return originalFetch(url,options);
 requests.push({url:String(url),method:options.method,redirect:options.redirect});
 equal(options.headers['Api-Key'],key);equal(options.method,'GET');equal(options.redirect,'manual');
 return provider(options);
};
console.warn=(...args)=>logs.push(args.join(' '));
const env={...f.env,TRIBUTE_API_KEY:key};
async function error(expected,customEnv=env){await assert.rejects(()=>checkTributeShops(customEnv),e=>e.message===expected);checks++}
try{
 equal(await checkTributeShops(env),{apiAccessible:true,activeShopFound:true,shops:[{id:12,active:true,onlyStars:false,rubModeEligible:true}],rubPaymentTested:false});
 provider=()=>Response.json([{id:12,status:1,onlyStars:true},{id:13,status:0,onlyStars:false}]);
 const limited=await checkTributeShops(env);equal(limited.shops.map(s=>s.rubModeEligible),[false,false]);
 provider=()=>Response.json([]);equal(await checkTributeShops(env),{apiAccessible:true,activeShopFound:false,shops:[],rubPaymentTested:false});
 const beforeMissing=requests.length;
 await error('tribute_api_key_missing',{...env,TRIBUTE_API_KEY:undefined});
 await error('tribute_api_key_invalid_format',{...env,TRIBUTE_API_KEY:key+'\n'});
 equal(requests.length,beforeMissing);
 for(const [status,code] of [[401,'tribute_api_unauthorized'],[403,'tribute_api_forbidden'],[429,'tribute_api_rate_limited'],[500,'tribute_api_unavailable'],[302,'tribute_api_redirect_blocked']]){
  provider=()=>new Response(key,{status,headers:{Location:'https://not-tribute.invalid/'}});await error(code);
 }
 provider=()=>{throw new Error(key)};await error('tribute_api_unreachable');
 for(const data of [{shops:[]},[{id:1,status:1,onlyStars:'false'}],[{id:1,status:2,onlyStars:false}],[{id:-1,status:1,onlyStars:false}],[{id:key,status:1,onlyStars:false}]]){provider=()=>Response.json(data);await error('tribute_api_response_invalid')}
 provider=()=>new Response(key);await error('tribute_api_response_invalid');
 provider=()=>new Response('x'.repeat(131073));await error('tribute_api_response_invalid');

 requests.length=0;
 provider=()=>Response.json([{id:12,status:1,onlyStars:false,unexpected:key}]);
 const changes=f.db.prepare('SELECT total_changes() AS count').get().count;
 const call=(jwt,extra={},data={})=>handlePlatform(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/integrations/tribute/check',{
  method:'POST',headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',...(jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}),...extra},body:JSON.stringify(data)
 }),env);
 equal((await call()).status,401);
 equal((await call(f.staff.publisher)).status,403);
 equal((await call(f.staff.uploader)).status,403);
 equal((await call(f.staff.owner,{Origin:'https://other.invalid'})).status,403);
 equal((await call(f.staff.owner,{'X-Requested-With':''})).status,403);
 equal((await call(f.staff.owner,{}, {apiKey:key})).status,400);
 equal(requests.length,0);
 const response=await call(f.staff.owner);equal(response.status,200);
 const text=await response.text();equal(text.includes(key),false);equal(JSON.parse(text).shops[0].rubModeEligible,true);
 equal(response.headers.get('Cache-Control'),'no-store');equal(requests.length,1);
 provider=()=>new Response(key,{status:500});
 const failed=await call(f.staff.owner);equal(failed.status,502);equal((await failed.text()).includes(key),false);
 equal(logs.join('\n').includes(key),false);
 equal(f.db.prepare('SELECT total_changes() AS count').get().count,changes);
 equal(requests.every(r=>r.url==='https://tribute.tg/api/v1/shops'&&r.method==='GET'&&r.redirect==='manual'),true);
 console.log(JSON.stringify({checks,ownerOnly:true,csrfEnforced:true,secretNotReturnedOrLogged:true,upstreamGetOnly:true,databaseWrites:0,realProviderRequests:0}));
}finally{console.warn=originalWarn;globalThis.fetch=originalFetch;f.close()}
