import {deny,time} from './platform-data.mjs';
import {input,csrf} from './platform-http.mjs';
import {hash} from './sales-core.mjs';
import {admitViewerOperation} from './viewer-rate-limit.mjs';
const cookieName='__Host-mysterion_tg_login',bot='MysterionAccessBot';
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
const clearCookie=()=>cookieName+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
function browserToken(request){const parts=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));if(parts.length!==1)return null;const v=parts[0].slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(v)?v:null}
const reply=(data,status=200,cookie)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
const nextURL=row=>row.video_id?'/media.html?purchase_video='+row.video_id:'/viewer-account.html';
export async function handleTelegramLogin(request,env,helpers){
 const path=new URL(request.url).pathname.split('/').at(-1),db=env.MEDIA_DB;
 if(path==='start'){
  if(request.method!=='POST')deny(405,'method_not_allowed');csrf(request,env);const d=await input(request,['video_id','locale']);await admitViewerOperation(request,env,'telegram-start');
  if(!['ru','en'].includes(d.locale||'ru'))deny(400,'invalid_locale');
  if(d.video_id!=null&&(!/^[a-f0-9-]{36}$/.test(d.video_id)||!await db.prepare("SELECT 1 FROM videos WHERE id=? AND state='published' AND access='paid'").bind(d.video_id).first()))deny(400,'invalid_target');
  if(!env.TELEGRAM_BOT_TOKEN)deny(503,'telegram_not_configured');
  const proof=random(),raw=random(),id=crypto.randomUUID(),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  // Hex payload (64) plus a prefix would exceed Telegram's 64-char limit;
  // use unpadded base64url for the 256-bit bot challenge instead.
  const start=btoa(String.fromCharCode(...Uint8Array.from(raw.match(/../g),v=>parseInt(v,16)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  await db.batch([db.prepare('DELETE FROM telegram_login_attempts WHERE id IN(SELECT id FROM telegram_login_attempts WHERE expires_at<? LIMIT 100)').bind(time()),db.prepare('INSERT INTO telegram_login_attempts(id,token_hash,browser_hash,display_code,locale,video_id,expires_at) VALUES (?,?,?,?,?,?,?)').bind(id,await hash(start),await hash(proof),code,d.locale||'ru',d.video_id||null,time()+600)]);
  return reply({url:'https://t.me/'+bot+'?start=login_'+start,code,expiresIn:600},200,cookieName+'='+proof+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600');
 }
 const token=browserToken(request);if(!token)deny(401,'telegram_login_expired');const row=await db.prepare('SELECT * FROM telegram_login_attempts WHERE browser_hash=? AND expires_at>? AND consumed_at IS NULL').bind(await hash(token),time()).first();if(!row)deny(401,'telegram_login_expired');
 if(path==='cancel'&&request.method==='POST'){csrf(request,env);await input(request,[]);await db.prepare('UPDATE telegram_login_attempts SET rejected_at=? WHERE id=? AND consumed_at IS NULL').bind(time(),row.id).run();return reply({ok:true},200,clearCookie())}
 if(path==='status'&&request.method==='GET'){
  await admitViewerOperation(request,env,'telegram-status');
  if(row.rejected_at)return reply({state:'rejected'});
  if(!row.approved_at)return reply({state:'pending',code:row.display_code});
  const link=await db.prepare('SELECT viewer_id FROM telegram_account_links WHERE telegram_id=?').bind(row.telegram_id).first();return reply({state:link?'approved':'new_identity',telegramId:row.telegram_id,next:nextURL(row)});
 }
 if(path!=='complete'||request.method!=='POST')deny(405,'method_not_allowed');csrf(request,env);const d=await input(request,['mode']);await admitViewerOperation(request,env,'telegram-complete');
 if(!['existing','create','link'].includes(d.mode))deny(400,'invalid_fields');if(!row.approved_at||row.rejected_at||!row.telegram_id)deny(409,'telegram_login_not_approved');
 const linked=await db.prepare('SELECT viewer_id FROM telegram_account_links WHERE telegram_id=?').bind(row.telegram_id).first(),current=await helpers.session(request,env);
 if(d.mode==='link'&&!current)deny(401,'authentication_required');
 if(d.mode==='existing'&&!linked)deny(409,'telegram_account_choice_required');
 if(current&&d.mode!=='link')deny(409,'telegram_existing_session');
 if(d.mode==='link'&&linked&&linked.viewer_id!==current.id)deny(409,'telegram_account_conflict');
 if(d.mode==='link'&&await db.prepare('SELECT 1 FROM telegram_account_links WHERE viewer_id=? AND telegram_id!=?').bind(current.id,row.telegram_id).first())deny(409,'telegram_account_conflict');
 const nonce=crypto.randomUUID(),id=crypto.randomUUID(),at=time(),guard='EXISTS(SELECT 1 FROM telegram_login_attempts WHERE id=? AND consume_nonce=?)',q=(sql,args=[])=>db.prepare(sql.replaceAll('$guard',guard)).bind(...args,row.id,nonce);
 const statements=[db.prepare('UPDATE telegram_login_attempts SET consumed_at=?,consume_nonce=? WHERE id=? AND browser_hash=? AND approved_at IS NOT NULL AND rejected_at IS NULL AND consumed_at IS NULL AND expires_at>?').bind(at,nonce,row.id,await hash(token),at)];
 if(d.mode==='create'){
  // Preserve the legacy NOT NULL email key without inventing a user's email.
  // This internal, non-deliverable identifier is hidden from the profile and
  // cannot be used for email login, verification or password recovery.
  statements.push(q("INSERT INTO viewer_accounts(id,email,password_hash,status,locale,created_at,updated_at,first_name,last_name,telegram_only) SELECT ?,?,'TELEGRAM_ONLY_NO_PASSWORD','active',?,?,?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM telegram_account_links WHERE telegram_id=?) AND $guard",[id,'telegram-'+id+'@identity.invalid',row.locale,at,at,row.first_name,row.last_name,row.telegram_id]),q('INSERT INTO telegram_account_links SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM viewer_accounts WHERE id=?) AND $guard ON CONFLICT DO NOTHING',[row.telegram_id,id,at,id]));
 }else if(d.mode==='link')statements.push(q('INSERT INTO telegram_account_links SELECT ?,?,? WHERE $guard ON CONFLICT DO NOTHING',[row.telegram_id,current.id,at]));
 statements.push(q("INSERT INTO viewer_auth_events SELECT ?,viewer_id,'telegram_identity_confirmed',? FROM telegram_account_links WHERE telegram_id=? AND $guard",[crypto.randomUUID(),at,row.telegram_id]));
 const applied=await db.batch(statements);if(!applied[0].meta.changes)deny(409,'telegram_login_used');
 const account=await db.prepare('SELECT a.* FROM viewer_accounts a JOIN telegram_account_links t ON t.viewer_id=a.id WHERE t.telegram_id=?').bind(row.telegram_id).first();if(!account||account.status!=='active')deny(401,'authentication_required');
 if(d.mode==='link'){if(account.id!==current.id)deny(409,'telegram_account_conflict');return reply({ok:true,next:nextURL(row)},200,clearCookie())}
 const issued=await helpers.issue(request,env,account);issued.headers.append('Set-Cookie',clearCookie());return new Response(JSON.stringify({ok:true,next:nextURL(row)}),{status:200,headers:issued.headers});
}
function name(value){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80):''}
export async function telegramLoginUpdate(env,update,send,prepare=async()=>{}){
 const m=update.message,match=typeof m?.text==='string'?m.text.match(/^\/start(?:@MysterionAccessBot)? login_([A-Za-z0-9_-]{43})$/i):null;
 if(match){
  if(m.chat?.type!=='private'||m.from?.is_bot!==false||!Number.isSafeInteger(m.from?.id)||m.from.id<1||m.chat.id!==m.from.id)return true;
  const row=await env.MEDIA_DB.prepare('SELECT * FROM telegram_login_attempts WHERE token_hash=? AND expires_at>? AND consumed_at IS NULL AND approved_at IS NULL AND rejected_at IS NULL').bind(await hash(match[1]),time()).first();if(!row||row.telegram_id&&row.telegram_id!==String(m.from.id))return true;
  await prepare();
  await env.MEDIA_DB.prepare('UPDATE telegram_login_attempts SET telegram_id=?,first_name=?,last_name=? WHERE id=? AND (telegram_id IS NULL OR telegram_id=?) AND consumed_at IS NULL AND approved_at IS NULL AND rejected_at IS NULL').bind(String(m.from.id),name(m.from.first_name),name(m.from.last_name),row.id,String(m.from.id)).run();
  const ru=row.locale==='ru';await send('sendMessage',{chat_id:m.chat.id,text:(ru?'Вход в MYSTERION. Сравните код с кодом в браузере: ':'MYSTERION sign-in. Match this code with your browser: ')+row.display_code+(ru?'\nПодтверждайте только вход, который начали сами. Не пересылайте ссылку.':'\nApprove only a sign-in you started. Do not forward the link.'),reply_markup:{inline_keyboard:[[{text:ru?'Подтвердить вход':'Confirm sign-in',callback_data:'login:'+row.id+':approve'}],[{text:ru?'Отмена':'Cancel',callback_data:'login:'+row.id+':reject'}]]}});return true;
 }
 const c=update.callback_query,action=typeof c?.data==='string'?c.data.match(/^login:([a-f0-9-]{36}):(approve|reject)$/):null;if(!action)return false;
 if(c.from?.is_bot!==false||!Number.isSafeInteger(c.from?.id)||c.from.id<1||c.message?.chat?.type!=='private'||c.message.chat.id!==c.from.id)return true;
 const result=await env.MEDIA_DB.prepare(`UPDATE telegram_login_attempts SET ${action[2]==='approve'?'approved_at':'rejected_at'}=? WHERE id=? AND telegram_id=? AND consumed_at IS NULL AND approved_at IS NULL AND rejected_at IS NULL AND expires_at>?`).bind(time(),action[1],String(c.from.id),time()).run();
 try{await send('answerCallbackQuery',{callback_query_id:c.id,text:result.meta.changes?'MYSTERION: вернитесь в браузер / Return to your browser':'Ссылка недействительна / Link expired'})}catch{}
 return true;
}
