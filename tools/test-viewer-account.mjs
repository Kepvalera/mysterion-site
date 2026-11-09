import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {handleViewer} from '../media-worker/src/viewer-auth.mjs';
import {hashPassword} from '../media-worker/src/viewer-password.mjs';
const db=new DatabaseSync(':memory:');for(const name of ['0004_viewer_accounts.sql','0005_viewer_sessions.sql'])db.exec(await fs.readFile('media-worker/migrations/'+name,'utf8'));
const password='Local8!?',encoded=await hashPassword(password),time=Math.floor(Date.now()/1000);
for(const [id,email] of [['A','first@example.invalid'],['B','second@example.invalid']])db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at) VALUES (?,?,?,?,'active','en',?,?)").run(id,email,encoded,time,time,time);
const queries=[],prepare=sql=>{queries.push(sql);return {bind(...args){this.args=args;return this},first(){return db.prepare(sql).get(...(this.args||[]))||null},run(){return {meta:{changes:Number(db.prepare(sql).run(...(this.args||[])).changes)}}}}};
const env={VIEWER_AUTH_ENABLED:'true',MEDIA_PUBLIC_ORIGIN:'https://local.invalid',VIEWER_RATE_KEY:'LOCAL_ACCOUNT_TEST_RATE_KEY_ONLY_2026',MEDIA_DB:{prepare,batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}};
const oldWarn=console.warn;console.warn=()=>{};let checks=0;
const call=(route,cookie='',body)=>handleViewer(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/viewer/'+route,{method:body?'POST':'GET',headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','CF-Connecting-IP':'192.0.2.1',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
const login=async email=>{const r=await call('login','',{email,password});assert.equal(r.status,200);return r.headers.get('Set-Cookie').split(';')[0]};
try{
 for(const cookie of ['', '__Host-mysterion_viewer='+'f'.repeat(64), 'CF_Authorization=LOCAL_UNVERIFIED_TOKEN','__Host-mysterion_viewer=bad']){const r=await call('account',cookie);assert.equal(r.status,401);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).error,'authentication_required');checks++}
 const a=await login('first@example.invalid'),b=await login('second@example.invalid');
 const r=await call('account',a),data=await r.json();assert.equal(r.status,200);assert.equal(data.profile.email,'first@example.invalid');assert.equal(data.profile.name,null);assert.equal(data.profile.emailVerified,true);assert.ok(data.session.expiresAt>Date.now());checks++;
 assert.deepEqual(data.library,{courses:[],videos:[],purchases:[],continueLearning:[]});assert.deepEqual(data.features,{materialAccess:false,purchases:false,displayName:false});checks++;
 const serialized=JSON.stringify(data);for(const secret of [password,encoded,a.split('=')[1],'credential_version','token_hash','password_hash','access_sub'])assert.ok(!serialized.includes(secret));checks++;
 assert.equal((await(await call('account?user_id=B&role=admin',a)).json()).profile.email,'first@example.invalid');checks++;
 assert.equal((await(await call('account',b)).json()).profile.email,'second@example.invalid');checks++;
 assert.equal((await call('account',a+'; '+a)).status,401);assert.equal((await call('account',a,{role:'admin'})).status,405);checks+=2;
 const replacement=await login('first@example.invalid');assert.equal((await call('account',a)).status,401);assert.equal((await call('account',replacement)).status,200);checks++;
 await call('logout',replacement,{});assert.equal((await call('account',replacement)).status,401);checks++;
 const current=await login('first@example.invalid');db.exec("UPDATE viewer_accounts SET status='disabled' WHERE id='A'");assert.equal((await call('account',current)).status,401);checks++;
 db.exec("UPDATE viewer_accounts SET status='active',email_verified_at=NULL WHERE id='A'");assert.equal((await call('account',current)).status,401);checks++;
 db.prepare('UPDATE viewer_accounts SET email_verified_at=? WHERE id=?').run(time,'A');db.exec("UPDATE viewer_accounts SET credential_version=credential_version+1 WHERE id='A'");assert.equal((await call('account',current)).status,401);checks++;
 const fresh=await login('first@example.invalid');db.exec("UPDATE viewer_sessions SET idle_expires_at=0 WHERE account_id='A'");assert.equal((await call('account',fresh)).status,401);checks++;
 const raced=await login('first@example.invalid'),originalPrepare=env.MEDIA_DB.prepare;
 env.MEDIA_DB.prepare=sql=>{if(sql.startsWith('SELECT a.email,'))db.exec("DELETE FROM viewer_sessions WHERE account_id='A'");return originalPrepare(sql)};
 try{assert.equal((await call('account',raced)).status,401);checks++}finally{env.MEDIA_DB.prepare=originalPrepare}
 assert.ok(!queries.some(q=>/\b(?:FROM|JOIN) (?:users|purchases|entitlements|manual_grants|videos|collections)\b/.test(q)));checks++;
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);checks++;
 console.log(JSON.stringify({checks,unauthorized:'401',crossAccountIsolation:true,tokenNotExposed:true,legacyMapping:false,emptyStates:true,remoteWrites:0}));
}finally{console.warn=oldWarn;db.close()}
