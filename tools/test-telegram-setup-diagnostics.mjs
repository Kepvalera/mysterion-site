import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {telegramRequest,setupTelegramWebhook} from '../media-worker/src/telegram-access.mjs';
const original=globalThis.fetch,env={TELEGRAM_BOT_TOKEN:'123456:LOCAL_ONLY_SETUP_FIXTURE_TOKEN',MEDIA_PUBLIC_ORIGIN:'https://local.invalid'};let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
async function fails(fn,expected){await assert.rejects(fn,e=>{eq(e.message,expected);eq(e.message.includes(env.TELEGRAM_BOT_TOKEN),false);return true});checks++}
try{
 for(const method of ['getMe','getWebhookInfo','setWebhook']){const stage=({getMe:'identity',getWebhookInfo:'webhook_status',setWebhook:'webhook_register'})[method];
  globalThis.fetch=async()=>Response.json({ok:false,error_code:401,description:'Never expose '+env.TELEGRAM_BOT_TOKEN},{status:401});await fails(()=>telegramRequest(env,method),'telegram_'+stage+'_http_401');
  globalThis.fetch=async()=>{throw Object.assign(Error('Never expose '+env.TELEGRAM_BOT_TOKEN),{name:'TimeoutError'})};await fails(()=>telegramRequest(env,method),'telegram_'+stage+'_timeout');
  globalThis.fetch=async()=>{throw Error('Never expose '+env.TELEGRAM_BOT_TOKEN)};await fails(()=>telegramRequest(env,method),'telegram_'+stage+'_network');
 }
 await fails(()=>telegramRequest({},'getMe'),'telegram_not_configured');let calls=[];
 globalThis.fetch=async url=>{const method=String(url).split('/').at(-1);calls.push(method);return Response.json({ok:true,result:method==='getMe'?{is_bot:true,username:'MysterionAccessBot'}:method==='getWebhookInfo'?{url:'https://another.example/webhook'}:true})};await fails(()=>setupTelegramWebhook(env),'telegram_other_webhook_exists');eq(calls.includes('setWebhook'),false);
 globalThis.fetch=async()=>Response.json({ok:true,result:{is_bot:true,username:'OtherBot'}});await fails(()=>setupTelegramWebhook(env),'telegram_bot_mismatch');
 const client=await fs.readFile('platform-client.js','utf8');eq(client.includes("path==='admin/integrations/telegram/setup'?65000:20000"),true);
 console.log(JSON.stringify({checks,localOnly:true,rawProviderErrorsHidden:true,externalRequests:0,setupTimeoutScoped:true}));
}finally{globalThis.fetch=original}
