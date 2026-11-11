import {HttpError} from './auth.mjs';
import {requireMediaOrigin} from './origin.mjs';

// Called only after existing staff/owner and CSRF checks. No caller payloads
// can be signed. Only the fixed test envelope's signature reaches the owner;
// it is never logged/stored/displayed, and the API key never leaves Cloudflare.
export async function checkTributeWebhook(request,env){
 requireMediaOrigin(request,env);const secret=env.TRIBUTE_API_KEY;
 if(typeof secret!=='string'||!secret.length||secret.length>4096||!/^[\x21-\x7e]+$/.test(secret))throw new HttpError(503,'tribute_api_key_missing');
 const now=new Date().toISOString();
 // Official ShopOrderPaymentFailedPayload; this is a synthetic, unregistered
 // failed order, not a successful purchase. The receipt-only webhook has no
 // state changes. No request is sent to Tribute's payment/order API.
 const bytes=new TextEncoder().encode(JSON.stringify({name:'shop_order_payment_failed',created_at:now,sent_at:now,payload:{uuid:crypto.randomUUID(),shopId:0,amount:3000000,currency:'rub',errorCode:'payment_failed',errorMessage:'MYSTERION webhook self-test; no payment was created.',customerId:'mysterion-webhook-self-test'}}));
 let signature;
 try{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes));
 }catch{throw new HttpError(503,'webhook_verification_unavailable')}
 const hex=value=>Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
 // Only this fixed failed-order envelope can be signed. The owner's browser
 // sends it to the public POST route, exercising the actual network boundary
 // without changing Cloudflare Worker fetch compatibility or exposing the key.
 return {testBody:new TextDecoder().decode(bytes),testSignature:hex(signature),testOnly:true};
}
