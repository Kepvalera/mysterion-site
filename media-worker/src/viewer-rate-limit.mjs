import {HttpError} from './auth.mjs';

const now=()=>Math.floor(Date.now()/1000);
const policies=Object.freeze({
 login:[['login_ip','ip',30,600],['login_email','email',30,600]],
 register:[['register_ip','ip',5,3600],['register_email','email',3,3600]],
 'forgot-password':[['recovery_ip','ip',10,900],['recovery_email','email',3,900]],
 'resend-verification':[['resend_ip','ip',10,900],['resend_email','email',3,900]],
 'verify-email':[['verification_ip','ip',30,600],['verification_token','token',5,900]],
 'reset-password':[['reset_ip','ip',10,900],['reset_token','token',5,900]]
});
const mailPolicies=[['mail_ip','ip',20,3600],['mail_email','email',5,3600]];
export class ViewerRateLimitError extends HttpError{
 constructor(scope,seconds){super(429,'rate_limited');this.limitScope=scope;this.retryAfter=Math.max(1,Math.min(3600,Math.ceil(seconds)))}
}

export function viewerClientIP(request,env){
 const raw=request.headers.get('CF-Connecting-IP');
 if(raw){
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)&&raw.split('.').every(n=>Number(n)<=255))return raw.split('.').map(Number).join('.');
  if(/^[a-fA-F0-9:.]+$/.test(raw)&&raw.includes(':')){try{return new URL('http://['+raw+']/').hostname.slice(1,-1)}catch{}}
  throw new HttpError(503,'client_ip_unavailable');
 }
 // Explicit development-only fallback. It can never activate on a public origin.
 const url=new URL(request.url);
 if(env.VIEWER_LOCAL_IP_FALLBACK==='true'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.origin===env.MEDIA_PUBLIC_ORIGIN)return '127.0.0.1';
 throw new HttpError(503,'client_ip_unavailable');
}

async function keyFor(env,scope,value,seconds){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VIEWER_RATE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['viewer-rate-v2',scope,value])));
 const digest=Array.from(new Uint8Array(mac),n=>n.toString(16).padStart(2,'0')).join(''),time=now(),end=(Math.floor(time/seconds)+1)*seconds;
 return {bucket:'vr2:'+digest+':'+Math.floor(time/seconds),end};
}

async function consume(env,[scope,type,max,seconds],values){
 const {bucket,end}=await keyFor(env,scope,values[type],seconds);
 // Saturating atomic increment: rejected requests neither increase nor extend it.
 const row=await env.MEDIA_DB.prepare('INSERT INTO viewer_rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(bucket,end+60,max).first();
 if(!row)throw new ViewerRateLimitError(scope,end-now());
}

export async function admitViewerOperation(request,env,operation,{address,token}={}){
 const values={ip:viewerClientIP(request,env),email:address,token:typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?token:null};
 await env.MEDIA_DB.prepare('DELETE FROM viewer_rate_limits WHERE bucket IN (SELECT bucket FROM viewer_rate_limits WHERE expires_at<? LIMIT 100)').bind(now()).run();
 for(const policy of policies[operation]||[]){if(policy[1]==='token'&&!values.token)continue;await consume(env,policy,values)}
 // Applied to every mail intent, including unknown addresses, before lookup.
 // This preserves generic recovery responses and avoids an account-existence oracle.
 if(['register','forgot-password','resend-verification'].includes(operation))for(const policy of mailPolicies)await consume(env,policy,values);
}

export async function admitViewerKdf(request,env){
 // Shared CPU admission, independent of operation and password correctness.
 await consume(env,['kdf_ip','ip',30,600],{ip:viewerClientIP(request,env)});
}

async function reserve(env,scope,value,max){
 const {bucket,end}=await keyFor(env,scope,value,900),time=now(),lease=bucket+':pending:'+crypto.randomUUID(),expiry=Math.min(end,time+30),pattern=bucket+':pending:*';
 // One SQLite statement guards committed failures plus in-flight attempts.
 const row=await env.MEDIA_DB.prepare(`INSERT INTO viewer_rate_limits(bucket,count,expires_at)
 SELECT ?,1,? WHERE COALESCE((SELECT count FROM viewer_rate_limits WHERE bucket=?),0)
 +(SELECT COUNT(*) FROM viewer_rate_limits WHERE bucket GLOB ? AND expires_at>?)<? RETURNING count`).bind(lease,expiry,bucket,pattern,time,max).first();
 if(!row){
  const state=await env.MEDIA_DB.prepare(`SELECT COALESCE((SELECT count FROM viewer_rate_limits WHERE bucket=?),0) AS failures,
   (SELECT MIN(expires_at) FROM viewer_rate_limits WHERE bucket GLOB ? AND expires_at>?) AS pending_until`).bind(bucket,pattern,time).first();
  throw new ViewerRateLimitError(scope,(state.failures>=max?end:Math.min(end,state.pending_until||end))-now());
 }
 return {bucket,end,lease};
}

async function finish(env,holds,wrongPassword){
 if(!holds.length)return;
 const statements=[];
 for(const hold of holds){
  if(wrongPassword)statements.push(env.MEDIA_DB.prepare(`INSERT INTO viewer_rate_limits(bucket,count,expires_at)
   SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM viewer_rate_limits WHERE bucket=? AND expires_at>?)
   ON CONFLICT(bucket) DO UPDATE SET count=count+1`).bind(hold.bucket,hold.end+60,hold.lease,now()));
  statements.push(env.MEDIA_DB.prepare('DELETE FROM viewer_rate_limits WHERE bucket=?').bind(hold.lease));
 }
 await env.MEDIA_DB.batch(statements);
}

export async function reserveViewerPassword(request,env,address){
 const holds=[];
 try{
  holds.push(await reserve(env,'password_pair',JSON.stringify([address,viewerClientIP(request,env)]),5));
  holds.push(await reserve(env,'password_email',address,10));
 }catch(error){await finish(env,holds,false).catch(()=>{});throw error}
 let completed=false;
 return {async finish(wrongPassword){if(completed)return;await finish(env,holds,wrongPassword);completed=true}};
}
