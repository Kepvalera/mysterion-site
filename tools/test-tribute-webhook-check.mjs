// Isolated role + signature checks. No real secrets, users or provider calls.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {platformFixture} from './platform-local-fixture.mjs';
import {handlePlatform} from '../media-worker/src/platform.mjs';
import {handleTributeWebhook} from '../media-worker/src/tribute-webhook.mjs';
import {checkTributeWebhook} from '../media-worker/src/tribute-webhook-check.mjs';
const f=await platformFixture(),key='LOCAL_WEBHOOK_CHECK_FIXTURE_NOT_A_REAL_KEY',env={...f.env,TRIBUTE_API_KEY:key};
const oldWarn=console.warn,oldFetch=globalThis.fetch,logs=[];console.warn=(...args)=>logs.push(args.join(' '));
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
const call=(jwt,headers={},data={})=>handlePlatform(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/integrations/tribute/webhook-check',{method:'POST',headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',...(jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}),...headers},body:JSON.stringify(data)}),env);
try{
 const before=f.db.prepare('SELECT total_changes() n').get().n;
 equal((await call()).status,401);equal((await call(f.staff.publisher)).status,403);equal((await call(f.staff.uploader)).status,403);
 equal((await call(f.staff.owner,{Origin:'https://other.invalid'})).status,403);equal((await call(f.staff.owner,{'X-Requested-With':''})).status,403);
 equal((await call(f.staff.owner,{}, {payload:{name:'shop_order'}})).status,400);
 const response=await call(f.staff.owner);equal(response.status,200);equal(response.headers.get('cache-control'),'no-store');
 const probe=await response.json();equal(probe.testOnly,true);equal(probe.testSignature,createHmac('sha256',key).update(probe.testBody).digest('hex'));
 equal(JSON.stringify(probe).includes(key),false);
 const event=JSON.parse(probe.testBody);equal(event.name,'shop_order_payment_failed');equal(event.payload.errorCode,'payment_failed');equal(event.payload.customerId,'mysterion-webhook-self-test');equal(Object.hasOwn(event.payload,'email'),false);
 const signed=await handleTributeWebhook(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/tribute/webhook',{method:'POST',headers:{'Content-Type':'application/json','trbt-signature':probe.testSignature},body:probe.testBody}),env);equal(signed.status,200);equal(await signed.json(),{status:'ok'});
 const wrong=(probe.testSignature[0]==='0'?'1':'0')+probe.testSignature.slice(1);
 equal((await handleTributeWebhook(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/tribute/webhook',{method:'POST',headers:{'Content-Type':'application/json','trbt-signature':wrong},body:probe.testBody}),env)).status,401);
 globalThis.fetch=()=>{throw Error('No outbound requests permitted')};
 const noDatabase={MEDIA_PUBLIC_ORIGIN:env.MEDIA_PUBLIC_ORIGIN,TRIBUTE_API_KEY:key,get MEDIA_DB(){throw Error('Self-test must not access D1')}};
 const generated=await checkTributeWebhook(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/integrations/tribute/webhook-check'),noDatabase);equal(generated.testOnly,true);
 await assert.rejects(()=>checkTributeWebhook(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/integrations/tribute/webhook-check'),{MEDIA_PUBLIC_ORIGIN:env.MEDIA_PUBLIC_ORIGIN}),e=>e.message==='tribute_api_key_missing');checks++;
 equal(f.db.prepare('SELECT total_changes() n').get().n,before);equal(logs.join('\n').includes(key),false);equal(logs.join('\n').includes(probe.testSignature),false);
 console.log(JSON.stringify({checks,ownerOnly:true,csrf:true,arbitraryPayloadSigningDenied:true,signedWebhook:200,invalidSignature:401,databaseWrites:0,externalRequests:0,apiKeyNotReturnedOrLogged:true}));
}finally{console.warn=oldWarn;globalThis.fetch=oldFetch;f.close()}
