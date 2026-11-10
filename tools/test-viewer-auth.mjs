import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {handleViewer} from '../media-worker/src/viewer-auth.mjs';import {handle} from '../media-worker/src/worker.mjs';
import {hashPassword,verifyPassword,validPassword} from '../media-worker/src/viewer-password.mjs';
import {argon2idAsync} from '../media-worker/vendor/noble-hashes/argon2.js';
import {deliver} from '../media-worker/src/viewer-mail.mjs';
const db=new DatabaseSync(':memory:');for(const f of ['0001_media.sql','0002_bunny_stream.sql','0003_media_members.sql'])db.exec(await fs.readFile('media-worker/migrations/'+f,'utf8'));
db.exec("INSERT INTO users VALUES ('LOCAL_ADMIN','LOCAL_ACCESS_SUB','admin',1)");const old=JSON.stringify(db.prepare('SELECT * FROM users').all());
for(const f of ['0004_viewer_accounts.sql','0005_viewer_sessions.sql','0008_viewer_login_history.sql'])db.exec(await fs.readFile('media-worker/migrations/'+f,'utf8'));
function prepare(sql){return {bind(...args){this.args=args;return this},first(){return db.prepare(sql).get(...(this.args||[]))||null},all(){return {results:db.prepare(sql).all(...(this.args||[]))}},run(){return {meta:{changes:Number(db.prepare(sql).run(...(this.args||[])).changes)}}}}}
const mails=[],env={VIEWER_AUTH_ENABLED:'true',VIEWER_RATE_KEY:crypto.randomUUID(),MEDIA_PUBLIC_ORIGIN:'https://local.invalid',MEDIA_DB:{prepare,batch(stmts){db.exec('BEGIN');try{const r=stmts.map(s=>s.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}},VIEWER_MAILER:{async fetch(request){mails.push(await request.json());return Response.json({ok:true})}}};
let tests=0,serial=0;const pass='Local8!?',other='LOCAL Replacement 2026!';
const warnings=[],originalWarn=console.warn;console.warn=value=>warnings.push(String(value));
async function call(route,data,cookie='',headers={},settings=env){const work=[];const response=await handleViewer(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/viewer/'+route,{method:data===undefined?'GET':'POST',headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.'+(++serial%200+1),...(cookie?{Cookie:cookie}:{}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}),settings,{waitUntil(p){work.push(p)}});await Promise.all(work);return response}
async function expect(status,route,data,cookie,headers,settings){const r=await call(route,data,cookie,headers,settings);assert.equal(r.status,status,'Unexpected status for '+route);assert.equal(r.headers.get('Cache-Control'),'no-store');tests++;return r}
const sessionCookie=r=>r.headers.get('Set-Cookie')?.split(';')[0];
const mailToken=()=>new URLSearchParams(new URL(mails.at(-1).text.split('\n\n').at(-1)).hash.slice(1)).get('token');
const resetRate=()=>db.exec('DELETE FROM viewer_rate_limits');
try{
 assert.equal(validPassword('1234567'),false);assert.equal(validPassword(pass),true);assert.equal(validPassword('😀'.repeat(8)),true);assert.equal(validPassword('x'.repeat(128)),true);assert.equal(validPassword('x'.repeat(129)),false);tests+=5;
 await assert.rejects(()=>hashPassword('1234567'),e=>e.message==='invalid_password');
 await assert.rejects(()=>verifyPassword(pass,'invalid'),e=>e.message==='password_record_invalid');
 const independent=await Promise.allSettled(Array.from({length:4},()=>hashPassword(pass)));assert.ok(independent.every(r=>r.status==='fulfilled'));tests++;
 // RFC 9106 Argon2id vector, independent of our encoding/parameters.
 const vector=await argon2idAsync(new Uint8Array(32).fill(1),new Uint8Array(16).fill(2),{m:32,t:3,p:4,dkLen:32,key:new Uint8Array(8).fill(3),personalization:new Uint8Array(12).fill(4)});
 assert.ok(Buffer.from(vector).toString('hex')==='0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');tests++;
 const start=performance.now(),a=await hashPassword(pass),b=await hashPassword(pass);assert.ok(a!==b);assert.ok(await verifyPassword(pass,a));assert.ok(!await verifyPassword(other,a));const kdfMs=(performance.now()-start)/4;tests+=3;
 // The old async implementation and the request-local implementation must agree.
 const salt=Uint8Array.from(a.split(':')[5].match(/../g),x=>parseInt(x,16));
 const legacy=await argon2idAsync(new TextEncoder().encode(pass),salt,{m:19456,t:2,p:1,dkLen:32,maxmem:24*1024*1024});assert.equal(Buffer.from(legacy).toString('hex'),a.split(':')[6]);tests++;
 await expect(503,'session',undefined,'',{}, {...env,VIEWER_AUTH_ENABLED:'false'});
 await expect(503,'register',{email:'local@example.invalid',password:pass},'',{},{...env,VIEWER_MAILER:undefined});
 await expect(403,'register',{email:'local@example.invalid',password:pass},'',{Origin:'https://other.invalid'});
 await expect(421,'session',undefined,'',{}, {...env,MEDIA_PUBLIC_ORIGIN:'https://other.invalid'});
 const domainEnv={...env,MEDIA_PUBLIC_ORIGIN:'https://mysterion-international.com',MEDIA_ALLOWED_ORIGINS:'https://mysterion-international.com,https://mysterion-international.pages.dev'};
 const legacyOrigin='https://mysterion-international.pages.dev';
 const legacySession=await handleViewer(new Request(legacyOrigin+'/api/viewer/session'),domainEnv);assert.equal(legacySession.status,200);assert.equal((await legacySession.json()).authenticated,false);tests++;
 const legacyPost=await handleViewer(new Request(legacyOrigin+'/api/viewer/register',{method:'POST',headers:{Origin:legacyOrigin,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json'},body:JSON.stringify({unexpected:true})}),domainEnv);assert.equal(legacyPost.status,400);assert.equal((await legacyPost.json()).error,'invalid_fields');tests++;
 const mismatchedPost=await handleViewer(new Request(legacyOrigin+'/api/viewer/register',{method:'POST',headers:{Origin:domainEnv.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json'},body:JSON.stringify({unexpected:true})}),domainEnv);assert.equal(mismatchedPost.status,403);assert.equal((await mismatchedPost.json()).error,'invalid_origin');tests++;
 await expect(403,'register',{email:'local@example.invalid',password:pass},'',{'X-Requested-With':''});
 await expect(400,'register',{email:'local@example.invalid',password:pass,role:'admin'});
 await expect(400,'register',{email:'bad',password:pass});await expect(400,'register',{email:'local@example.invalid',password:'short'});
 await expect(413,'register',{email:'local@example.invalid',password:'x'.repeat(5000)});
 await expect(202,'register',{email:'Local@Example.Invalid',password:pass,locale:'en'});const verification=mailToken();assert.ok(verification&&!JSON.stringify(db.prepare('SELECT * FROM viewer_email_tokens').all()).includes(verification));tests++;
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM viewer_accounts').get().n,1);assert.equal(mails.length,1);tests++;
 await expect(202,'register',{email:'local@example.invalid',password:other});assert.equal(mails.length,1);tests++;
 await expect(401,'login',{email:'local@example.invalid',password:pass});
 await expect(400,'verify-email',{token:'0'.repeat(64)});
 const verified=await Promise.all([call('verify-email',{token:verification}),call('verify-email',{token:verification})]);assert.deepEqual(verified.map(r=>r.status).sort(),[200,400]);tests++;
 await expect(400,'verify-email',{token:verification});resetRate();
 const login=await expect(200,'login',{email:'local@example.invalid',password:pass});const first=sessionCookie(login);assert.ok(/HttpOnly; Secure; SameSite=Lax/.test(login.headers.get('Set-Cookie')));assert.ok(!JSON.stringify(await login.json()).includes(first.split('=')[1]));tests++;
 assert.equal((await(await expect(200,'session',undefined,first)).json()).authenticated,true);
 const both=await Promise.all([call('login',{email:'local@example.invalid',password:pass}),call('login',{email:'local@example.invalid',password:pass})]);assert.ok(both.every(r=>r.status===200));
 const cookieA=sessionCookie(both[0]),cookieB=sessionCookie(both[1]);const sessions=await Promise.all([call('session',undefined,cookieA).then(r=>r.json()),call('session',undefined,cookieB).then(r=>r.json())]);assert.equal(sessions.filter(s=>s.authenticated).length,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM viewer_sessions').get().n,1);tests++;
 assert.equal((await(await call('session',undefined,first)).json()).authenticated,false);tests++;
 const current=sessions[0].authenticated?cookieA:cookieB;await expect(401,'login',{email:'local@example.invalid',password:other});assert.equal((await(await call('session',undefined,current)).json()).authenticated,true);tests++;
 assert.equal((await(await call('session',undefined,current+'; '+current)).json()).authenticated,false);tests++;
 await expect(403,'logout',{},current,{Origin:'https://other.invalid'});assert.equal((await(await call('session',undefined,current)).json()).authenticated,true);tests++;
 const before=mails.length;await expect(202,'forgot-password',{email:'unknown@example.invalid'});assert.equal(mails.length,before);tests++;resetRate();
 await expect(202,'forgot-password',{email:'local@example.invalid'});const reset=mailToken();
 const resets=await Promise.all([call('reset-password',{token:reset,password:other}),call('reset-password',{token:reset,password:pass})]);assert.deepEqual(resets.map(r=>r.status).sort(),[200,400]);tests++;
 assert.equal((await(await call('session',undefined,current)).json()).authenticated,false);await expect(400,'reset-password',{token:reset,password:other});tests++;
 const stored=db.prepare('SELECT password_hash FROM viewer_accounts').get().password_hash;const newPass=await verifyPassword(other,stored)?other:pass;resetRate();
 const fresh=sessionCookie(await expect(200,'login',{email:'local@example.invalid',password:newPass}));await expect(200,'logout-all',{},fresh);assert.equal((await(await call('session',undefined,fresh)).json()).authenticated,false);tests++;
 const again=sessionCookie(await expect(200,'login',{email:'local@example.invalid',password:newPass}));db.exec('UPDATE viewer_sessions SET idle_expires_at=0');assert.equal((await(await call('session',undefined,again)).json()).authenticated,false);tests++;
 const absolute=sessionCookie(await expect(200,'login',{email:'local@example.invalid',password:newPass}));db.exec('UPDATE viewer_sessions SET expires_at=0');assert.equal((await(await call('session',undefined,absolute)).json()).authenticated,false);tests++;
 const realPrepare=env.MEDIA_DB.prepare;env.MEDIA_DB.prepare=query=>{const stmt=realPrepare(query);if(query.startsWith('INSERT INTO viewer_sessions')){const run=stmt.run;stmt.run=function(){db.exec('UPDATE viewer_accounts SET credential_version=credential_version+1');return run.call(this)}}return stmt};
 try{await expect(401,'login',{email:'local@example.invalid',password:newPass})}finally{env.MEDIA_DB.prepare=realPrepare}
 resetRate();await expect(202,'forgot-password',{email:'local@example.invalid'});const expiredToken=mailToken();db.exec('UPDATE viewer_email_tokens SET expires_at=0');await expect(400,'reset-password',{token:expiredToken,password:other});
 await expect(202,'resend-verification',{email:'unknown@example.invalid'});
 const final=sessionCookie(await expect(200,'login',{email:'local@example.invalid',password:newPass}));db.exec("UPDATE viewer_accounts SET status='disabled'");assert.equal((await(await call('session',undefined,final)).json()).authenticated,false);await expect(401,'login',{email:'local@example.invalid',password:newPass});tests++;
 // Keep the rate-limit test inside one bucket even when run at a 10-minute boundary.
 resetRate();const realNow=Date.now,rateNow=realNow();Date.now=()=>rateNow;
 try{for(let i=0;i<3;i++)await expect(202,'forgot-password',{email:'rate@example.invalid'});await expect(429,'forgot-password',{email:'rate@example.invalid'})}finally{Date.now=realNow}
 const adminEnv={...env,MEDIA_ENABLED:'true',MEDIA_ACCESS_ISSUER:'https://local.cloudflareaccess.com',MEDIA_ACCESS_AUD:'LOCAL_ADMIN_AUD'};const adminResponse=await handle(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/media/admin/me',{headers:{Cookie:final}}),adminEnv);assert.equal(adminResponse.status,401);tests++;
 const originalFetch=globalThis.fetch;let providerCalls=0;globalThis.fetch=async(url,options)=>{providerCalls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer LOCAL_RESEND_KEY');return new Response('PRIVATE_PROVIDER_BODY',{status:302,headers:{Location:'https://untrusted.invalid'}})};
 try{await assert.rejects(()=>deliver({...env,VIEWER_MAILER:undefined,RESEND_API_KEY:'LOCAL_RESEND_KEY',VIEWER_EMAIL_FROM:'no-reply@example.invalid'},{email:'local@example.invalid',token:'LOCAL_TOKEN',purpose:'reset',locale:'en',id:'LOCAL_ID'}),e=>e.message==='email_delivery_unavailable');assert.equal(providerCalls,1);tests++}finally{globalThis.fetch=originalFetch}
 const unavailable=await expect(503,'session',undefined,final,{}, {...env,MEDIA_DB:{prepare(){throw Error('PRIVATE_DATABASE_DETAIL')}}});assert.ok(!(await unavailable.text()).includes('PRIVATE_DATABASE_DETAIL'));tests++;
 const diagnostic=warnings.map(w=>{try{return JSON.parse(w)}catch{return null}}).find(w=>w?.event==='viewer_auth_failed'&&w.code==='viewer_service_unavailable');assert.ok(diagnostic);assert.equal(diagnostic.phase,'session');assert.match(diagnostic.requestId,/^[a-f0-9-]{36}$/);tests++;
 const allWarnings=warnings.join('\n');for(const secret of [pass,other,first,verification,reset,'PRIVATE_DATABASE_DETAIL','PRIVATE_PROVIDER_BODY','LOCAL_RESEND_KEY','local@example.invalid'])assert.ok(!allWarnings.includes(secret));tests++;
 assert.equal(JSON.stringify(db.prepare('SELECT * FROM users').all()),old);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM purchases').get().n,0);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);tests++;
 // Verification must not read or hash a password; no session is created by a link.
 async function verificationFixture({purpose='verify',expired=false,consumed=false,version=1,status='pending'}={}){
  const id=crypto.randomUUID(),token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),time=Math.floor(Date.now()/1000);
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
  db.prepare('INSERT INTO viewer_accounts(id,email,password_hash,locale,created_at,updated_at,status) VALUES (?,?,?,?,?,?,?)').run(id,id+'@example.invalid','NOT_A_PASSWORD_HASH','en',time,time,status);
  db.prepare('INSERT INTO viewer_email_tokens(token_hash,account_id,purpose,credential_version,created_at,expires_at,consumed_at) VALUES (?,?,?,?,?,?,?)').run(hash,id,purpose,version,time,time+(expired?-1:600),consumed?time:null);
  return {id,token};
 }
 resetRate();const fixture=await verificationFixture();const proof=await expect(200,'verify-email',{token:fixture.token});assert.equal(proof.headers.get('Set-Cookie'),null);assert.equal(db.prepare('SELECT status FROM viewer_accounts WHERE id=?').get(fixture.id).status,'active');tests++;
 await expect(400,'verify-email',{token:fixture.token});
 for(const options of [{expired:true},{consumed:true},{version:2},{status:'disabled'},{purpose:'reset'}]){const f=await verificationFixture(options);await expect(400,'verify-email',{token:f.token});assert.equal(db.prepare('SELECT email_verified_at FROM viewer_accounts WHERE id=?').get(f.id).email_verified_at,null);tests++}
 const untouched=await verificationFixture();await expect(405,'verify-email');await expect(403,'verify-email',{token:untouched.token},'',{Origin:'https://other.invalid'});await expect(200,'verify-email',{token:untouched.token});
 assert.equal(await verifyPassword('',a),false);tests++;
 console.log(JSON.stringify({tests,argon2id:{memoryKiB:19456,passes:2,parallelism:1,nodeMeanWallMs:Math.round(kdfMs)},concurrentLogins:'exactly one valid session',tokenRace:'one winner',legacyUsers:'unchanged',productionWrites:0,email:'private local capture only'}));
}finally{console.warn=originalWarn;db.close()}
