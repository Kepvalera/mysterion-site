import {deny,time} from './platform-data.mjs';
import {input} from './platform-http.mjs';
import {hash,participant} from './sales-core.mjs';
import {requireMediaOrigin} from './origin.mjs';
export const botUsername='MysterionAccessBot',telegramWebhookPath='/api/telegram/webhook';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
function token(env){if(typeof env.TELEGRAM_BOT_TOKEN!=='string'||!/^\d+:[A-Za-z0-9_-]{20,200}$/.test(env.TELEGRAM_BOT_TOKEN))deny(503,'telegram_not_configured');return env.TELEGRAM_BOT_TOKEN}
export async function telegramRequest(env,method,body={}){
 const credential=token(env),stage=({getMe:'identity',getWebhookInfo:'webhook_status',setWebhook:'webhook_register',sendMessage:'message'})[method];if(!stage)deny(400,'telegram_method_not_supported');
 // Workers supports manual/follow, not redirect:error. Manual preserves the
 // no-redirect policy without throwing before the network request is sent.
 let r;try{r=await fetch('https://api.telegram.org/bot'+credential+'/'+method,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}catch(error){deny(503,'telegram_'+stage+'_'+(['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network'))}
 if(r.status>=300&&r.status<400)deny(503,'telegram_'+stage+'_redirect_denied');
 let v;try{v=await r.json()}catch{deny(503,'telegram_'+stage+'_invalid_response')}
 if(!r.ok||v.ok!==true){const code=[400,401,403,404,409,429,500,502,503,504].includes(v.error_code)?v.error_code:[400,401,403,404,409,429,500,502,503,504].includes(r.status)?r.status:'unknown';deny(503,'telegram_'+stage+'_http_'+code)}return v.result;
}
// Domain-separated secret derived inside Cloudflare. It never leaves the
// server except as setWebhook.secret_token to Telegram over HTTPS. No extra
// secret, API token disclosure, browser signing endpoint or arbitrary signer.
export async function telegramWebhookSecret(env){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('MYSTERION:telegram-access-webhook:v1')))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function setupTelegramWebhook(env){
 const me=await telegramRequest(env,'getMe');if(me.username?.toLowerCase()!==botUsername.toLowerCase()||!me.is_bot)deny(409,'telegram_bot_mismatch');
 const url=new URL(telegramWebhookPath,env.MEDIA_PUBLIC_ORIGIN).href,info=await telegramRequest(env,'getWebhookInfo');
 if(info.url&&info.url!==url)deny(409,'telegram_other_webhook_exists');
 if(await telegramRequest(env,'setWebhook',{url,secret_token:await telegramWebhookSecret(env),allowed_updates:['message'],drop_pending_updates:false})!==true)deny(503,'telegram_webhook_register_unconfirmed');
 const after=await telegramRequest(env,'getWebhookInfo');if(after.url!==url)deny(503,'telegram_webhook_not_ready');return {configured:true,bot:botUsername,url,pendingUpdates:after.pending_update_count||0};
}
export async function telegramViewer(request,env,viewer,path){
 const db=env.MEDIA_DB;
 if(path==='telegram'&&request.method==='GET'){
  const linked=await db.prepare('SELECT telegram_id FROM telegram_account_links WHERE viewer_id=?').bind(viewer.id).first();
  const pending=await db.prepare('SELECT id,telegram_id FROM telegram_link_attempts WHERE viewer_id=? AND session_hash=? AND expires_at>? AND consumed_at IS NULL ORDER BY expires_at DESC LIMIT 1').bind(viewer.id,viewer.hash,time()).first();
  return {linked:!!linked,telegramId:linked?.telegram_id||null,pending:pending?.telegram_id?{id:pending.id,telegramId:pending.telegram_id}:null,bot:botUsername};
 }
 await input(request,[]);if(request.method!=='POST')deny(405,'method_not_allowed');await participant(db,viewer.id);
 if(path==='telegram/start'){
  token(env);if(await db.prepare('SELECT 1 FROM telegram_account_links WHERE viewer_id=?').bind(viewer.id).first())deny(409,'telegram_already_linked');
  const raw=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''),id=crypto.randomUUID();
  await db.batch([db.prepare('DELETE FROM telegram_link_attempts WHERE viewer_id=? OR expires_at<?').bind(viewer.id,time()),db.prepare('INSERT INTO telegram_link_attempts(id,token_hash,viewer_id,session_hash,expires_at) VALUES (?,?,?,?,?)').bind(id,await hash(raw),viewer.id,viewer.hash,time()+600)]);
  return {url:'https://t.me/'+botUsername+'?start=bind_'+raw,expiresIn:600};
 }
 if(path==='telegram/confirm'){
  const pending=await db.prepare('SELECT * FROM telegram_link_attempts WHERE viewer_id=? AND session_hash=? AND expires_at>? AND consumed_at IS NULL AND telegram_id IS NOT NULL').bind(viewer.id,viewer.hash,time()).first();if(!pending)deny(409,'telegram_confirmation_pending');
  const result=await db.batch([
   db.prepare('INSERT INTO telegram_account_links SELECT telegram_id,viewer_id,? FROM telegram_link_attempts WHERE id=? AND session_hash=? AND expires_at>? AND consumed_at IS NULL ON CONFLICT DO NOTHING').bind(time(),pending.id,viewer.hash,time()),
   db.prepare('UPDATE telegram_link_attempts SET consumed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM telegram_account_links WHERE viewer_id=? AND telegram_id=?)').bind(time(),pending.id,viewer.id,pending.telegram_id)
  ]);if(!result[0].meta.changes)deny(409,'telegram_already_linked');
  return {linked:true};
 }
 deny(404,'not_found');
}
export async function handleTelegramWebhook(request,env){
 try{
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);requireMediaOrigin(request,env);
  const provided=request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'';if(!/^[a-f0-9]{64}$/.test(provided))return reply({error:'invalid_telegram_secret'},401);
  // Fixed-size digest comparison avoids data-dependent early string comparison.
  const expected=await telegramWebhookSecret(env),a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(provided))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expected)));let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)return reply({error:'invalid_telegram_secret'},401);
  const update=await input(request,['update_id','message','edited_message','callback_query','channel_post','my_chat_member']);
  if(!Number.isSafeInteger(update.update_id)||update.update_id<0)deny(400,'invalid_telegram_update');
  const m=update.message,match=typeof m?.text==='string'?m.text.match(/^\/start(?:@MysterionAccessBot)? bind_([A-Za-z0-9_-]{43})$/i):null;
  if(!match||m.chat?.type!=='private'||m.from?.is_bot!==false||!Number.isSafeInteger(m.from?.id)||m.from.id<1||m.chat.id!==m.from.id)return reply({ok:true});
  const attempt=await env.MEDIA_DB.prepare('SELECT * FROM telegram_link_attempts WHERE token_hash=? AND expires_at>? AND telegram_id IS NULL AND consumed_at IS NULL').bind(await hash(match[1]),time()).first();if(!attempt)return reply({ok:true});
  // A /start token only proposes a Telegram ID. The initiating, still-valid
  // site session must confirm it; a forwarded link cannot bind by itself.
  const result=await env.MEDIA_DB.prepare('UPDATE telegram_link_attempts SET telegram_id=? WHERE id=? AND telegram_id IS NULL AND consumed_at IS NULL AND expires_at>?').bind(String(m.from.id),attempt.id,time()).run();
  if(result.meta.changes){try{await telegramRequest(env,'sendMessage',{chat_id:m.chat.id,text:'Подтвердите привязку Telegram в личном кабинете MYSTERION. / Confirm this Telegram connection in your MYSTERION account.'})}catch{}}
  return reply({ok:true});
 }catch(error){return reply({error:error.status===400?'invalid_telegram_update':'telegram_webhook_unavailable'},error.status===400?400:503)}
}
