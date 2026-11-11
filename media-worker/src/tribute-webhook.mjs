import {requireMediaOrigin} from './origin.mjs';
import {automaticEnabled} from './sales-core.mjs';
import {processTributeEvent} from './sales-tribute.mjs';
import {processDigitalEvent} from './tribute-digital.mjs';

// Tribute Shop: https://wiki.tribute.tg/for-shops/api/webhooks
// Digital Products: https://wiki.tribute.tg/for-content-creators/api-documentation/webhooks
// Digital receipts never enter the Shop order processor: product_id/purchase_id
// and Tribute buyer IDs are not Shop order UUIDs or verified site account IDs.
const digitalEvents=new Set(['new_digital_product','digital_product_refunded']);
const shopEvents=new Set(['shop_order','shop_order_payment_failed','shop_order_refunded']);
const reply=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
function signatureBytes(value){
 if(typeof value!=='string')return null;
 if(/^[a-f0-9]{64}$/i.test(value))return Uint8Array.from(value.match(/../g),pair=>parseInt(pair,16));
 // The docs specify HMAC-SHA256 but not its textual encoding. Both encodings
 // below represent exactly 32 digest bytes; no unsigned/prefix fallback exists.
 if(/^[A-Za-z0-9+/]{43}=$/.test(value)){
  try{const raw=atob(value);if(raw.length===32&&btoa(raw)===value)return Uint8Array.from(raw,c=>c.charCodeAt(0))}catch{}
 }
 return null;
}
export async function handleTributeWebhook(request,env){
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405,{Allow:'POST'});
 try{requireMediaOrigin(request,env)}catch{return reply({error:'wrong_origin'},421)}
 const secret=env.TRIBUTE_API_KEY;
 if(typeof secret!=='string'||!secret.length||secret.length>4096||!/^[\x21-\x7e]+$/.test(secret))return reply({error:'webhook_not_configured'},503);
 const signature=signatureBytes(request.headers.get('trbt-signature'));
 if(!signature)return reply({error:'invalid_webhook_signature'},401);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||!['','identity'].includes(request.headers.get('Content-Encoding')||''))return reply({error:'json_required'},415);
 const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_webhook_data'},400);
 const parts=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return reply({error:'body_too_large'},413)}parts.push(value)}
 }catch{return reply({error:'invalid_webhook_data'},400)}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
 try{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,signature,bytes))return reply({error:'invalid_webhook_signature'},401);
 }catch{return reply({error:'webhook_verification_unavailable'},503)}
 let event;
 try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return reply({error:'invalid_webhook_data'},400)}
 if(!event||typeof event!=='object'||Array.isArray(event))return reply({error:'invalid_webhook_data'},400);
 // A connectivity probe is not a payment. Only require a signed JSON object
 // for receipt-only traffic; do not invent a schema/name for Tribute's test
 // button (the public API docs do not specify its payload). This also allows
 // future event types without treating them as purchases. Never persist/log
 // these bodies, buyer details or signatures.
 if(digitalEvents.has(event.name)){try{await processDigitalEvent(env,event)}catch(error){return reply({error:error.status===400?'invalid_digital_event':'digital_processing_unavailable'},error.status===400?400:503)}return reply({status:'ok'})}
 if(!shopEvents.has(event.name)||!automaticEnabled(env))return reply({status:'ok'});
 // Keep the existing strict business envelope gate for enabled Shop payments.
 // A disabled payment integration cannot mutate orders/access via test data.
 if(typeof event.name!=='string'||!/^[a-z][a-z0-9_]{0,95}$/.test(event.name)||
    !['created_at','sent_at'].every(field=>typeof event[field]==='string'&&event[field].length<=64&&/^\d{4}-\d{2}-\d{2}T/.test(event[field])&&Number.isFinite(Date.parse(event[field])))||
    !event.payload||typeof event.payload!=='object'||Array.isArray(event.payload))return reply({error:'invalid_webhook_data'},400);
 try{await processTributeEvent(env,event)}catch(error){return reply({error:error.status===400?'invalid_payment_event':'payment_processing_unavailable'},error.status===400?400:503)}
 return reply({status:'ok'});
}
