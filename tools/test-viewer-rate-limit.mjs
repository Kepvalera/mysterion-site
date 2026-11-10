import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {handleViewer} from '../media-worker/src/viewer-auth.mjs';
import {hashPassword} from '../media-worker/src/viewer-password.mjs';
import {admitViewerOperation,admitViewerKdf,reserveViewerPassword,viewerClientIP} from '../media-worker/src/viewer-rate-limit.mjs';

const migrations=await Promise.all(['0004_viewer_accounts.sql','0005_viewer_sessions.sql','0008_viewer_login_history.sql'].map(n=>fs.readFile('media-worker/migrations/'+n,'utf8')));
const password='Local8!?',encoded=await hashPassword(password),origin='https://local.invalid',address='local@example.invalid';
let checks=0,clock=1800000000;const realNow=Date.now,realWarn=console.warn;Date.now=()=>clock*1000;const logs=[];console.warn=value=>logs.push(String(value));
const request=(route='login',ip='192.0.2.1',data={email:address,password},cookie)=>new Request(origin+'/api/viewer/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',...(ip?{'CF-Connecting-IP':ip}:{}),...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
function fixture(){
 const db=new DatabaseSync(':memory:');migrations.forEach(sql=>db.exec(sql));
 db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at) VALUES (?,?,?,?,'active','en',?,?)").run('LOCAL',address,encoded,clock,clock,clock);
 let fault='';const prepare=sql=>{
  if((fault==='lookup'&&sql.startsWith('SELECT * FROM viewer_accounts WHERE email='))||(fault==='session'&&sql.startsWith('INSERT INTO viewer_sessions')))throw Error('PRIVATE_DATABASE_FAILURE');
  return {bind(...args){this.args=args;return this},first(){return db.prepare(sql).get(...(this.args||[]))||null},run(){return {meta:{changes:Number(db.prepare(sql).run(...(this.args||[])).changes)}}}};
 };
 const env={VIEWER_AUTH_ENABLED:'true',VIEWER_RATE_KEY:'LOCAL_ONLY_RATE_KEY_FOR_POLICY_TESTS',MEDIA_PUBLIC_ORIGIN:origin,MEDIA_DB:{prepare,batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.run());db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}},VIEWER_MAILER:{async fetch(){return new Response('{}')}}};
 return {db,env,setFault(value){fault=value},call:(route='login',data={email:address,password},ip='192.0.2.1',cookie)=>handleViewer(request(route,ip,data,cookie),env),pending:()=>Number(db.prepare("SELECT COUNT(*) AS n FROM viewer_rate_limits WHERE bucket GLOB '*:pending:*'").get().n)};
}
async function scenario(fn){clock=1800000000;const f=fixture();try{await fn(f)}finally{f.db.close()}}
async function blocked(fn,scope){await assert.rejects(fn,e=>{assert.equal(e.status,429);assert.equal(e.limitScope,scope);assert.ok(e.retryAfter>=1&&e.retryAfter<=3600);return true});checks++}
try{
 await scenario(async f=>{
  // Real successful login/logout loops never accumulate password failures.
  for(let i=0;i<10;i++){const login=await f.call();assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.equal((await f.call('logout',{},'192.0.2.1',cookie)).status,200)}
  assert.equal(f.pending(),0);checks++;
  for(let i=0;i<5;i++)assert.equal((await f.call('login',{email:address,password:'Wrong8!?'})).status,401);
  const limited=await f.call();assert.equal(limited.status,429);const body=await limited.json();assert.equal(body.limitScope,'password_pair');assert.equal(Number(limited.headers.get('Retry-After')),body.retryAfter);assert.equal(body.retryAfter,900);checks++;
  clock+=900;assert.equal((await f.call()).status,200);checks++;
 });
 await scenario(async f=>{
  for(let i=0;i<30;i++)assert.equal((await f.call()).status,200);
  const r=await f.call();assert.equal(r.status,429);assert.equal((await r.json()).limitScope,'login_ip');assert.equal(r.headers.get('Retry-After'),'600');checks++;
 });
 for(const fault of ['lookup','session','hash'])await scenario(async f=>{
  f.setFault(fault);if(fault==='hash')f.db.exec("UPDATE viewer_accounts SET password_hash='INVALID_HASH'");
  for(let i=0;i<6;i++)assert.equal((await f.call()).status,503);
  assert.equal(f.pending(),0);f.setFault('');f.db.prepare('UPDATE viewer_accounts SET password_hash=?').run(encoded);
  assert.equal((await f.call()).status,200);checks++;
 });
 await scenario(async f=>{
  const all=await Promise.allSettled(Array.from({length:20},()=>reserveViewerPassword(request(),f.env,address)));
  const admitted=all.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.equal(admitted.length,5);assert.ok(all.filter(r=>r.status==='rejected').every(r=>r.reason.limitScope==='password_pair'));checks++;
  await Promise.all(admitted.map(a=>a.finish(true)));assert.equal(f.pending(),0);await blocked(()=>reserveViewerPassword(request(),f.env,address),'password_pair');
 });
 await scenario(async f=>{
  const all=await Promise.allSettled(Array.from({length:20},(_,i)=>reserveViewerPassword(request('login','192.0.2.'+(i+1)),f.env,address)));
  const admitted=all.filter(r=>r.status==='fulfilled').map(r=>r.value);assert.equal(admitted.length,10);await Promise.all(admitted.map(a=>a.finish(true)));assert.equal(f.pending(),0);
  await blocked(()=>reserveViewerPassword(request('login','198.51.100.1'),f.env,address),'password_email');checks++;
 });
 await scenario(async f=>{
  const abandoned=[];for(let i=0;i<5;i++)abandoned.push(await reserveViewerPassword(request(),f.env,address));
  await blocked(()=>reserveViewerPassword(request(),f.env,address),'password_pair');
  clock+=31;const next=await reserveViewerPassword(request(),f.env,address);await next.finish(false);checks++;
 });
 await scenario(async f=>{
  const logins=await Promise.all(Array.from({length:3},()=>f.call()));assert.ok(logins.every(r=>r.status===200));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM viewer_sessions').get().n,1);assert.equal(f.pending(),0);checks++;
 });
 await scenario(async f=>{
  const r=await f.call('login',{email:address,password},'');assert.equal(r.status,503);assert.equal((await r.json()).error,'client_ip_unavailable');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM viewer_rate_limits').get().n,0);checks++;
  await assert.rejects(()=>admitViewerKdf(request('login','not-an-ip'),f.env),e=>e.message==='client_ip_unavailable');checks++;
  assert.equal(viewerClientIP(request('login','2001:0db8:0:0:0:0:0:1'),f.env),'2001:db8::1');
  const spoofed=request('login','');spoofed.headers.set('X-Forwarded-For','192.0.2.99');assert.throws(()=>viewerClientIP(spoofed,f.env),e=>e.message==='client_ip_unavailable');checks++;
  assert.throws(()=>viewerClientIP(request('login',''),{...f.env,VIEWER_LOCAL_IP_FALLBACK:'true'}),e=>e.message==='client_ip_unavailable');checks++;
  const local=new Request('http://127.0.0.1/api/viewer/login');assert.equal(viewerClientIP(local,{MEDIA_PUBLIC_ORIGIN:'http://127.0.0.1',VIEWER_LOCAL_IP_FALLBACK:'true'}),'127.0.0.1');checks++;
 });
 await scenario(async f=>{
  const token='a'.repeat(64),digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  f.db.exec("UPDATE viewer_accounts SET status='pending',email_verified_at=NULL");
  f.db.prepare("INSERT INTO viewer_email_tokens(token_hash,account_id,purpose,credential_version,created_at,expires_at) VALUES (?,'LOCAL','verify',1,?,?)").run(digest,clock,clock+3600);
  assert.equal((await f.call('verify-email',{token})).status,200);const counts=f.db.prepare('SELECT count FROM viewer_rate_limits').all();assert.equal(counts.length,2);assert.ok(counts.every(row=>row.count===1));checks++;
 });
 await scenario(async f=>{
  for(let i=0;i<3;i++)await admitViewerOperation(request(),f.env,'forgot-password',{address});
  await blocked(()=>admitViewerOperation(request(),f.env,'forgot-password',{address}),'recovery_email');
  // Recovery exhaustion must not block login or token verification.
  assert.equal((await f.call()).status,200);await admitViewerOperation(request(),f.env,'verify-email',{token:'b'.repeat(64)});checks++;
 });
 await scenario(async f=>{
  for(const operation of ['forgot-password','forgot-password','resend-verification','resend-verification','register'])await admitViewerOperation(request(),f.env,operation,{address});
  await blocked(()=>admitViewerOperation(request(),f.env,'register',{address}),'mail_email');assert.equal((await f.call()).status,200);checks++;
 });
 for(const [operation,max,scope] of [['register',3,'register_email'],['resend-verification',3,'resend_email'],['verify-email',5,'verification_token'],['reset-password',5,'reset_token']])await scenario(async f=>{
  for(let i=0;i<max;i++)await admitViewerOperation(request(),f.env,operation,{address,token:'c'.repeat(64)});
  await blocked(()=>admitViewerOperation(request(),f.env,operation,{address,token:'c'.repeat(64)}),scope);
 });
 await scenario(async f=>{
  for(let i=0;i<30;i++)await admitViewerKdf(request(),f.env);
  await blocked(()=>admitViewerKdf(request(),f.env),'kdf_ip');checks++;
 });
 await scenario(async f=>{
  f.db.prepare('INSERT INTO viewer_rate_limits VALUES (?,9,?)').run('LOCAL_OLD_BUCKET',clock+5000);await admitViewerOperation(request(),f.env,'login',{address});
  assert.equal(f.db.prepare('SELECT count FROM viewer_rate_limits WHERE bucket=?').get('LOCAL_OLD_BUCKET').count,9);
  const rows=JSON.stringify(f.db.prepare('SELECT bucket FROM viewer_rate_limits').all());assert.ok(!rows.includes(address));assert.ok(!rows.includes('192.0.2.1'));checks++;
 });
 assert.ok(!logs.join('').includes('PRIVATE_DATABASE_FAILURE'));assert.ok(!logs.join('').includes(address));checks++;
 console.log(JSON.stringify({checks,successfulLoginLoops:10,serverFailuresNotPasswordFailures:true,atomicParallelReservations:true,expiredReservationsRecover:true,noDoubleIPCharge:true,retryAfter:true,noRemoteWrites:true}));
}finally{Date.now=realNow;console.warn=realWarn}
