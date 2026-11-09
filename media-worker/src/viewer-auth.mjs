import {HttpError} from './auth.mjs';
import {requireMediaOrigin} from './origin.mjs';
import {hashPassword,verifyPassword,validPassword,dummyPasswordHash} from './viewer-password.mjs';
import {mailConfigured,deliver} from './viewer-mail.mjs';
const cookieName='__Host-mysterion_viewer',day=86400,idle=43200;
const now=()=>Math.floor(Date.now()/1000),random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const reply=(data,status=200,cookie)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
const fail=(status,code)=>{throw new HttpError(status,code)};
const clearCookie=()=>`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function cookie(request){const parts=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));if(parts.length!==1)return null;const token=parts[0].slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(token)?token:null}
function email(value){if(typeof value!=='string')fail(400,'invalid_email');const normalized=value.trim().toLowerCase();if(normalized.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(normalized))fail(400,'invalid_email');return normalized}
async function input(request,allowed){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'json_required');
 const reader=request.body?.getReader();if(!reader)fail(400,'invalid_json');let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();fail(413,'body_too_large')}chunks.push(value)}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{fail(400,'invalid_json')}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!allowed.includes(k)))fail(400,'invalid_fields');return data;
}
async function limit(request,env,address){
 await env.MEDIA_DB.prepare('DELETE FROM viewer_rate_limits WHERE bucket IN (SELECT bucket FROM viewer_rate_limits WHERE expires_at<? LIMIT 100)').bind(now()).run();
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VIEWER_RATE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 for(const [type,value,max] of [['ip',request.headers.get('CF-Connecting-IP')||'local',30],...(address?[['email',address,10]]:[])]){
  const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(type+':'+value))),x=>x.toString(16).padStart(2,'0')).join('');const time=now(),bucket=hash+':'+Math.floor(time/600);
  const row=await env.MEDIA_DB.prepare('INSERT INTO viewer_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,time+1200).first();if(row.count>max)fail(429,'rate_limited');
 }
}
async function audit(db,id,action){await db.prepare('INSERT INTO viewer_auth_events VALUES (?,?,?,?)').bind(crypto.randomUUID(),id,action,now()).run()}
async function sendToken(env,account,purpose,context){
 const token=random(),hash=await digest(token),time=now();await env.MEDIA_DB.batch([
  env.MEDIA_DB.prepare('UPDATE viewer_email_tokens SET consumed_at=? WHERE account_id=? AND purpose=? AND consumed_at IS NULL').bind(time,account.id,purpose),
  env.MEDIA_DB.prepare('INSERT INTO viewer_email_tokens(token_hash,account_id,purpose,credential_version,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(hash,account.id,purpose,account.credential_version,time,time+(purpose==='verify'?day:1800))
 ]);
 const delivery=deliver(env,{email:account.email,token,purpose,locale:account.locale,id:hash}).catch(()=>console.warn(JSON.stringify({event:'viewer_email_delivery_failed',code:'email_delivery_unavailable'})));
 if(context?.waitUntil)context.waitUntil(delivery);else await delivery;
}
async function session(request,env){
 const token=cookie(request);if(!token)return null;const hash=await digest(token),time=now();
 const row=await env.MEDIA_DB.prepare(`SELECT a.id,a.credential_version,s.created_at,s.expires_at FROM viewer_sessions s JOIN viewer_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.credential_version=a.credential_version AND a.status='active' AND a.email_verified_at IS NOT NULL AND s.expires_at>? AND s.idle_expires_at>?`).bind(hash,time,time).first();
 if(!row)return null;await env.MEDIA_DB.prepare('UPDATE viewer_sessions SET last_seen_at=?,idle_expires_at=min(expires_at,?) WHERE token_hash=? AND last_seen_at<?').bind(time,time+idle,hash,time-300).run();return {...row,hash};
}
export async function handleViewer(request,env,context){
 const requestId=crypto.randomUUID(),started=Date.now();let phase='configuration';
 const candidate=new URL(request.url).pathname.replace(/^\/api\/viewer\//,'');
 const operation=['session','register','login','verify-email','resend-verification','forgot-password','reset-password','logout','logout-all'].includes(candidate)?candidate:'unknown';
 try{
  if(env.VIEWER_AUTH_ENABLED!=='true')fail(503,'viewer_auth_disabled');requireMediaOrigin(request,env);
  if(!env.MEDIA_DB||typeof env.VIEWER_RATE_KEY!=='string'||env.VIEWER_RATE_KEY.length<32)fail(503,'viewer_auth_not_configured');
  const route=new URL(request.url).pathname.replace(/^\/api\/viewer\//,''),method=request.method,db=env.MEDIA_DB;
  if(route==='session'&&method==='GET'){phase='session';const user=await session(request,env);return reply(user?{authenticated:true,verified:true,expiresAt:user.expires_at*1000}:{authenticated:false},200,!user&&cookie(request)?clearCookie():undefined)}
  const fields={register:['email','password','locale'],login:['email','password'],'verify-email':['token'],'resend-verification':['email'],'forgot-password':['email'],'reset-password':['token','password'],logout:[],'logout-all':[]};
  if(!Object.hasOwn(fields,route))fail(404,'not_found');if(method!=='POST')fail(405,'method_not_allowed');
  if(request.headers.get('Origin')!==env.MEDIA_PUBLIC_ORIGIN||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('X-Requested-With')!=='XMLHttpRequest')fail(403,'invalid_origin');
  phase='input';const data=await input(request,fields[route]);
  if(route==='logout'||route==='logout-all'){
   const user=await session(request,env);if(user){if(route==='logout-all')await db.batch([db.prepare('UPDATE viewer_accounts SET credential_version=credential_version+1,updated_at=? WHERE id=? AND credential_version=?').bind(now(),user.id,user.credential_version),db.prepare('DELETE FROM viewer_sessions WHERE account_id=? AND token_hash=?').bind(user.id,user.hash)]);else await db.prepare('DELETE FROM viewer_sessions WHERE token_hash=?').bind(user.hash).run();await audit(db,user.id,route)}
   return reply({ok:true},200,clearCookie());
  }
  const address=['register','login','resend-verification','forgot-password'].includes(route)?email(data.email):null;phase='rate_limit';await limit(request,env,address);
  phase='mail_configuration';if(['register','resend-verification','forgot-password'].includes(route)&&!mailConfigured(env))fail(503,'email_not_configured');
  if(route==='register'){
   if(!validPassword(data.password))fail(400,'invalid_password');if(data.locale!==undefined&&!['ru','en'].includes(data.locale))fail(400,'invalid_locale');
   phase='password_hash';const hash=await hashPassword(data.password),id=crypto.randomUUID(),time=now();phase='account_store';const result=await db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,locale,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING").bind(id,address,hash,data.locale||'ru',time,time).run();
   if(result.meta.changes){const account=await db.prepare('SELECT * FROM viewer_accounts WHERE id=?').bind(id).first();phase='email_token';await sendToken(env,account,'verify',context);phase='audit';await audit(db,id,'registered')}
   return reply({ok:true,message:'check_email'},202);
  }
  if(route==='forgot-password'||route==='resend-verification'){
   const started=Date.now(),account=await db.prepare('SELECT * FROM viewer_accounts WHERE email=?').bind(address).first();if(account&&account.status!=='disabled'&&(route==='forgot-password'||!account.email_verified_at))await sendToken(env,account,route==='forgot-password'?'reset':'verify',context);await new Promise(resolve=>setTimeout(resolve,Math.max(0,500-(Date.now()-started))));return reply({ok:true,message:'check_email'},202);
  }
  if(route==='login'){
   phase='account_lookup';const account=await db.prepare('SELECT * FROM viewer_accounts WHERE email=?').bind(address).first();phase='password_verify';const valid=await verifyPassword(data.password,account?.password_hash||dummyPasswordHash);
   if(!valid||!account||account.status!=='active'||!account.email_verified_at)fail(401,'invalid_credentials');
   phase='session_store';const token=random(),hash=await digest(token),time=now();
   // Primary-key replacement is atomic. Guard against password-reset/disable races.
   const result=await db.prepare(`INSERT INTO viewer_sessions(account_id,token_hash,credential_version,created_at,last_seen_at,idle_expires_at,expires_at) SELECT id,?,credential_version,?,?,?,? FROM viewer_accounts WHERE id=? AND credential_version=? AND status='active' AND email_verified_at IS NOT NULL ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,credential_version=excluded.credential_version,created_at=excluded.created_at,last_seen_at=excluded.last_seen_at,idle_expires_at=excluded.idle_expires_at,expires_at=excluded.expires_at`).bind(hash,time,time,time+idle,time+7*day,account.id,account.credential_version).run();
   if(!result.meta.changes)fail(401,'invalid_credentials');await audit(db,account.id,'login');return reply({ok:true},200,`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7*day}`);
  }
  if(!/^[a-f0-9]{64}$/.test(data.token||''))fail(400,'invalid_or_expired_token');
  phase='token_lookup';const hash=await digest(data.token),purpose=route==='verify-email'?'verify':'reset';
  const record=await db.prepare(`SELECT t.*,a.email,a.status,a.credential_version AS current_version FROM viewer_email_tokens t JOIN viewer_accounts a ON a.id=t.account_id WHERE t.token_hash=? AND t.purpose=? AND t.consumed_at IS NULL AND t.expires_at>?`).bind(hash,purpose,now()).first();
  if(!record||record.status==='disabled'||record.credential_version!==record.current_version)fail(400,'invalid_or_expired_token');
  await limit(request,env,record.email);
  // Verification proves possession of the single-use, expiring 256-bit token.
  // Explicit same-origin POST only; no automatic login or GET-side mutation.
  let nextHash;if(purpose==='reset'){phase='password_hash';nextHash=await hashPassword(data.password)}
  phase='token_consume';
  const time=now(),consume=crypto.randomUUID();
  const statements=[db.prepare('UPDATE viewer_email_tokens SET consumed_at=?,consumption_id=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? AND credential_version=(SELECT credential_version FROM viewer_accounts WHERE id=account_id)').bind(time,consume,hash,time)];
  if(purpose==='verify')statements.push(db.prepare("UPDATE viewer_accounts SET status='active',email_verified_at=?,updated_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM viewer_email_tokens WHERE token_hash=? AND consumption_id=?)").bind(time,time,record.account_id,hash,consume));
  else{statements.push(db.prepare("UPDATE viewer_accounts SET password_hash=?,status='active',email_verified_at=COALESCE(email_verified_at,?),credential_version=credential_version+1,updated_at=? WHERE id=? AND status!='disabled' AND EXISTS(SELECT 1 FROM viewer_email_tokens WHERE token_hash=? AND consumption_id=?)").bind(nextHash,time,time,record.account_id,hash,consume));statements.push(db.prepare('DELETE FROM viewer_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM viewer_email_tokens WHERE token_hash=? AND consumption_id=?)').bind(record.account_id,hash,consume))}
  const result=await db.batch(statements);if(!result[0].meta.changes||!result[1].meta.changes)fail(400,'invalid_or_expired_token');await audit(db,record.account_id,purpose==='verify'?'email_verified':'password_reset');return reply({ok:true},200,purpose==='reset'?clearCookie():undefined);
 }catch(error){
  // Fixed classifications only: never log request URLs/bodies, exception messages,
  // identity, cookies, tokens, provider responses or credentials.
  const allowed=new Set(['viewer_auth_disabled','viewer_auth_not_configured','email_not_configured','origin_not_configured','wrong_origin','invalid_origin','not_found','method_not_allowed','json_required','invalid_json','body_too_large','invalid_fields','invalid_email','invalid_password','invalid_locale','rate_limited','invalid_credentials','invalid_or_expired_token','password_record_invalid']);
  const known=error instanceof HttpError&&allowed.has(error.message),code=known?error.message:'viewer_service_unavailable',status=known?error.status:503;
  console.warn(JSON.stringify({event:'viewer_auth_failed',requestId,operation,phase,code,status,elapsedWallMs:Math.max(0,Date.now()-started)}));
  const response=reply({error:code,requestId},status);response.headers.set('X-Mysterion-Request-ID',requestId);return response;
 }
}
