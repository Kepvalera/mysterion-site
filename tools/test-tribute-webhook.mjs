// Isolated signature fixtures. Never sends events to Tribute or production.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleTributeWebhook} from '../media-worker/src/tribute-webhook.mjs';
import {onRequest} from '../functions/api/tribute/webhook.js';
import fs from 'node:fs/promises';
const key='LOCAL_WEBHOOK_FIXTURE_NOT_A_REAL_SECRET',origin='https://mysterion-international.com';
const env={MEDIA_PUBLIC_ORIGIN:origin,TRIBUTE_API_KEY:key,get MEDIA_DB(){throw Error('Webhook must not read or write D1')}};
const body=JSON.stringify({name:'shop_order',created_at:'2025-03-20T01:15:58.33246Z',sent_at:'2025-03-20T01:15:58.542279448Z',payload:{uuid:'550e8400-e29b-41d4-a716-446655440000',amount:3000000,currency:'rub',status:'paid',email:'local-fixture@example.invalid'}});
const sign=(text,encoding='hex',secret=key)=>createHmac('sha256',secret).update(text).digest(encoding);
const call=(text=body,options={})=>handleTributeWebhook(new Request(options.url||origin+'/api/tribute/webhook',{method:options.method||'POST',headers:{'Content-Type':'application/json','trbt-signature':sign(text),...options.headers},...(options.method==='GET'?{}:{body:text})}),options.env||env);
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
const logs=[],oldLog=console.log,oldWarn=console.warn,oldError=console.error,oldFetch=globalThis.fetch;
console.log=console.warn=console.error=(...args)=>logs.push(args.join(' '));globalThis.fetch=()=>{throw Error('No outbound requests allowed')};
try{
 for(const signature of [sign(body),sign(body).toUpperCase(),sign(body,'base64')]){const r=await call(body,{headers:{'trbt-signature':signature}});equal(r.status,200);equal(await r.json(),{status:'ok'});equal(r.headers.get('cache-control'),'no-store')}
 for(let i=0;i<3;i++)equal((await call()).status,200); // Replays never grant access.
 equal((await call(body,{headers:{'trbt-signature':''}})).status,401);
 equal((await call(body,{headers:{'trbt-signature':'0'.repeat(64)}})).status,401);
 equal((await call(body,{headers:{'trbt-signature':sign(body,'hex','DIFFERENT_FIXTURE_KEY')}})).status,401);
 equal((await call(body+' ',{headers:{'trbt-signature':sign(body)}})).status,401);
 equal((await call(body,{headers:{'trbt-signature':'sha256='+sign(body)}})).status,401);
 equal((await call(body,{headers:{'trbt-signature':sign(body)+','+sign(body)}})).status,401);
 equal((await call(body,{method:'GET'})).status,405);
 equal((await call(body,{headers:{'Content-Type':'text/plain'}})).status,415);
 equal((await call(body,{headers:{'Content-Encoding':'gzip'}})).status,415);
 equal((await call('x'.repeat(65537))).status,413);
 equal((await call(body,{env:{MEDIA_PUBLIC_ORIGIN:origin}})).status,503);
 equal((await call(body,{url:'https://other.invalid/api/tribute/webhook'})).status,421);
 for(const data of [null,[]])equal((await call(JSON.stringify(data))).status,400);
 // Arbitrary signed probe objects are receipt-only, not invented official
 // Tribute test fixtures. Neither timestamps nor a payment payload is needed.
 const enabled={MEDIA_PUBLIC_ORIGIN:origin,TRIBUTE_API_KEY:key,SALES_ENABLED:'true',TRIBUTE_PAYMENTS_ENABLED:'true',TRIBUTE_DIGITAL_ENABLED:'false',get MEDIA_DB(){throw Error('Receipt must not access D1')}};
 for(const data of [{},{test:true},{name:'test'},{name:'TEST',payload:{}},{name:'future_event',payload:{}}]){
  const text=JSON.stringify(data);
  for(const config of [env,enabled]){equal((await call(text,{env:config})).status,200);equal((await call(text,{env:config,headers:{'trbt-signature':'0'.repeat(64)}})).status,401)}
 }
 for(const data of [{name:'shop_order'},{...JSON.parse(body),payload:[]},{...JSON.parse(body),sent_at:'bad'}]){
  equal((await call(JSON.stringify(data))).status,200); // Disabled: receipt only.
  equal((await call(JSON.stringify(data),{env:enabled})).status,400); // Enabled: unchanged Shop validation.
 }
 // Official Digital Products guide example (older minimal payload) and the
 // current OpenAPI schema. Both must remain isolated from Shop processing,
 // even if someone later enables Shop payments. Duplicate receipts have zero
 // effects; no claim of persistent purchase idempotency is made here.
 const digital={name:'new_digital_product',created_at:'2025-03-20T01:15:58.332Z',sent_at:'2025-03-20T01:15:58.542Z',payload:{product_id:456,amount:500,currency:'usd',user_id:31326,telegram_user_id:12321321}};
 const purchase={...digital,payload:{...digital.payload,purchase_id:987,transaction_id:654,product_name:'Local fixture',purchase_created_at:digital.created_at,trb_user_id:'T-31326'}};
 const refund={...purchase,name:'digital_product_refunded',payload:{...purchase.payload,refund_reason:'Local fixture',refunded_at:digital.created_at}};
 for(const data of [digital,purchase,refund])for(const config of [env,enabled]){
  const text=JSON.stringify(data);
  for(let i=0;i<2;i++){const r=await call(text,{env:config});equal(r.status,200);equal(await r.json(),{status:'ok'})}
  equal((await call(text,{env:config,headers:{'trbt-signature':'0'.repeat(64)}})).status,401);
  equal((await call(text+' ',{env:config,headers:{'trbt-signature':sign(text)}})).status,401);
 }
 equal((await call('{bad json')).status,400);
 const unicode=JSON.stringify({...JSON.parse(body),payload:{description:'\u0414\u0435\u043c\u043e'}});equal((await call(unicode)).status,200);
 const response=await onRequest({request:new Request(origin+'/api/tribute/webhook',{method:'POST',headers:{'Content-Type':'application/json','trbt-signature':sign(body)},body}),env});equal(response.status,200);
 const routes=JSON.parse(await fs.readFile('_routes.json','utf8'));equal(routes.include.includes('/api/tribute/webhook'),true);
 equal(logs,[]);
}finally{console.log=oldLog;console.warn=oldWarn;console.error=oldError;globalThis.fetch=oldFetch}
console.log(JSON.stringify({checks,rawBodyHmac:true,invalidSignatureDenied:true,retriesHaveNoSideEffects:true,payloadLogs:0,databaseAccess:0,realPayments:0,productionRequests:0}));
