// Cloudflare workerd, local fixture key only. No D1, production or Tribute calls.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),paths=[path.resolve('tools/release-build'),path.resolve('output/approved-school-release-iyOHjR/source/tools/release-build')];
const {build}=require(require.resolve('esbuild',{paths})),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths}));
const result=await build({stdin:{contents:"import {handleTributeWebhook} from './media-worker/src/tribute-webhook.mjs';export default {fetch:handleTributeWebhook}",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2020',keepNames:true,write:false});
const key='LOCAL_ONLY_RUNTIME_TRIBUTE_KEY',origin='https://local.invalid';
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2026-11-04',modules:[{type:'ESModule',path:path.resolve('output/tribute-webhook-runtime.mjs'),contents:result.outputFiles[0].text}],bindings:{MEDIA_PUBLIC_ORIGIN:origin,TRIBUTE_API_KEY:key,SALES_ENABLED:'true',TRIBUTE_PAYMENTS_ENABLED:'false'}}));
let checks=0;
try{
 for(const event of [{},{name:'test'},{name:'shop_order'},...['new_digital_product','digital_product_refunded'].map(name=>({name,created_at:'2026-11-12T01:00:00Z',sent_at:'2026-11-12T01:00:00Z',payload:{product_id:456,purchase_id:987,transaction_id:654,amount:10000,currency:'rub',product_name:'Local fixture',purchase_created_at:'2026-11-12T01:00:00Z',refunded_at:'2026-11-12T01:00:00Z',refund_reason:'Local fixture',trb_user_id:'T-31326'}}))]){
  const body=JSON.stringify(event),signature=createHmac('sha256',key).update(body).digest('hex');
  for(const [sig,status] of [[signature,200],['0'.repeat(64),401]]){
   const r=await mf.dispatchFetch(origin+'/api/tribute/webhook',{method:'POST',headers:{'Content-Type':'application/json','trbt-signature':sig},body});
   assert.equal(r.status,status);checks++;
  }
 }
 console.log(JSON.stringify({checks,runtime:'Cloudflare workerd',signedReceipts:true,invalidSignaturesDenied:true,databaseBindings:0,productionRequests:0}));
}finally{await mf.dispose()}
