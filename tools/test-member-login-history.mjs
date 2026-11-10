import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {platformFixture} from './platform-local-fixture.mjs';

const require=createRequire(import.meta.url),build=require(require.resolve('esbuild',{paths:[path.resolve('output/audit-tools/wrangler')]})).build;
const bundled=await build({
 stdin:{contents:`export {handlePlatform} from ${JSON.stringify(path.resolve('media-worker/src/platform.mjs'))};export {handleViewer} from ${JSON.stringify(path.resolve('media-worker/src/viewer-auth.mjs'))};`,resolveDir:process.cwd()},
 bundle:true,format:'esm',platform:'node',write:false,
 plugins:[{name:'local-password-stub',setup(builder){
  builder.onResolve({filter:/viewer-password\.mjs$/},()=>({path:'viewer-password',namespace:'test-stub'}));
  builder.onLoad({filter:/.*/,namespace:'test-stub'},()=>({contents:"export const hashPassword=async()=>'LOCAL_TEST_HASH';export const verifyPassword=async(password,hash)=>password==='Local8!?'&&hash==='LOCAL_TEST_HASH';export const validPassword=()=>true;export const dummyPasswordHash='LOCAL_DUMMY_HASH';",loader:'js'}));
 }}]
});
const bundlePath=path.join(os.tmpdir(),'mysterion-login-history-'+crypto.randomUUID()+'.mjs');
await fs.writeFile(bundlePath,bundled.outputFiles[0].text);
const {handlePlatform,handleViewer}=await import(pathToFileURL(bundlePath).href);
const fixture=await platformFixture(),{db,env,staff}=fixture,oldWarn=console.warn;
console.warn=()=>{};
let checks=0;
const account=({email,first='Local',last='Participant'}={})=>{
 const id=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
 db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at,first_name,last_name) VALUES (?,?,?,?,'active','ru',?,?,?,?)").run(id,email||id+'@example.invalid','LOCAL_TEST_HASH',now,now,now,first,last);
 return id;
};
const request=(url,method='GET',headers={},body)=>{
 const result=new Request(url,{method,headers, ...(body===undefined?{}:{body})});
 Object.defineProperty(result,'cf',{value:{country:'CA'}});
 return result;
};
const admin=(path,role='owner')=>handlePlatform(request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/'+path,'GET',{
 Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Cf-Access-Jwt-Assertion':staff[role]
}),env);
const read=async(path,role='owner',status=200)=>{
 const response=await admin(path,role),data=await response.json();
 assert.equal(response.status,status,JSON.stringify(data));checks++;return data;
};

try{
 const target=account({email:'target@example.invalid',first:'Иван',last:'Петров'});
 for(let i=0;i<28;i++)account({email:`batchneedle-${String(i).padStart(2,'0')}@example.invalid`,first:'Guest',last:'Participant'});

 const byFirst=await read('participants?q='+encodeURIComponent('иван')+'&page=1');
 assert.equal(byFirst.total,1);assert.equal(byFirst.items[0].id,target);checks+=2;
 const byLast=await read('participants?q='+encodeURIComponent('пЕТРОВ')+'&page=1');
 assert.equal(byLast.total,1);assert.equal(byLast.items[0].email,'target@example.invalid');checks+=2;
 const firstPage=await read('participants?q=batchneedle&page=1');
 assert.deepEqual([firstPage.total,firstPage.pageSize,firstPage.items.length,firstPage.pages],[28,25,25,2]);checks++;
 const secondPage=await read('participants?q=batchneedle&page=2');
 assert.deepEqual([secondPage.page,secondPage.items.length],[2,3]);checks++;
 const clamped=await read('participants?q=batchneedle&page=99');
 assert.equal(clamped.page,2);assert.equal(clamped.items.length,3);checks+=2;
 await read('participants?q=batchneedle&page=1','publisher',403);
 await read('participants?q=batchneedle&page=1','uploader',403);
 await read('participants?q=x&page=0','owner',400);

 const now=Math.floor(Date.now()/1000),expired=now-90*86400-1;
 db.prepare("INSERT INTO viewer_login_history(id,account_id,logged_in_at,device,browser) VALUES (?,?,?,'Desktop','Old')").run(crypto.randomUUID(),target,expired);
 const credentials={email:'target@example.invalid',password:'Local8!?'};
 const loginRequest=()=>request(env.MEDIA_PUBLIC_ORIGIN+'/api/viewer/login','POST',{
  Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json',
  'CF-Connecting-IP':'203.0.113.42','X-Forwarded-For':'198.51.100.9',
  'User-Agent':'Mozilla/5.0 (Linux; Android 13; Mobile) Chrome/123.0.0.0 Mobile Safari/537.36'
 },JSON.stringify(credentials));
 const login=await handleViewer(loginRequest(),env);
 assert.equal(login.status,200);assert.equal(db.prepare('SELECT ip_address,country,device,browser FROM viewer_login_history WHERE account_id=?').get(target).ip_address,'203.0.113.42');checks+=2;
 const metadata=db.prepare('SELECT country,device,browser FROM viewer_login_history WHERE account_id=?').get(target);
 assert.deepEqual({...metadata},{country:'CA',device:'Mobile',browser:'Chrome 123'});assert.equal(db.prepare('SELECT COUNT(*) n FROM viewer_login_history WHERE logged_in_at<?').get(now-90*86400).n,0);checks+=2;
 const loginCookie=login.headers.get('Set-Cookie').split(';')[0];
 const failed=await handleViewer(request(env.MEDIA_PUBLIC_ORIGIN+'/api/viewer/login','POST',{
  Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.42'
 },JSON.stringify({...credentials,password:'wrong password'})),env);
 assert.equal(failed.status,401);assert.equal(db.prepare('SELECT COUNT(*) n FROM viewer_login_history WHERE account_id=?').get(target).n,1);checks+=2;
 const parallel=await Promise.all([handleViewer(loginRequest(),env),handleViewer(loginRequest(),env)]);
 assert.deepEqual(parallel.map(result=>result.status),[200,200]);
 const sessions=await Promise.all([loginCookie,...parallel.map(result=>result.headers.get('Set-Cookie').split(';')[0])].map(async cookie=>{
  const response=await handleViewer(request(env.MEDIA_PUBLIC_ORIGIN+'/api/viewer/session','GET',{Cookie:cookie}),env);
  return (await response.json()).authenticated;
 }));
 assert.equal(sessions.filter(Boolean).length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM viewer_sessions WHERE account_id=?').get(target).n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM viewer_login_history WHERE account_id=?').get(target).n,3);checks+=3;

 for(let i=0;i<25;i++)db.prepare('INSERT INTO viewer_login_history(id,account_id,logged_in_at,ip_address,country,device,browser) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),target,now-i,'192.0.2.'+(i+1),'US','Desktop','Chrome 120');
 const other=account({email:'other@example.invalid'});
 db.prepare("INSERT INTO viewer_login_history(id,account_id,logged_in_at,ip_address,country,device,browser) VALUES (?,?,?,'198.51.100.1','US','Mobile','Safari 17')").run(crypto.randomUUID(),other,now);
 const recent=await read('participants/'+target+'/login-history?page=1');
 assert.deepEqual([recent.total,recent.items.length,recent.pages],[28,20,2]);assert.ok(recent.items[0].logged_in_at>=now&&recent.items[0].logged_in_at<=now+5);checks+=2;
 assert.equal(recent.items.some(item=>item.ip_address==='198.51.100.1'),false);assert.ok(recent.items.some(item=>item.ip_address==='192.0.2.1'));checks+=2;
 const previous=await read('participants/'+target+'/login-history?page=2');
 assert.equal(previous.items.length,8);assert.ok(previous.items[0].logged_in_at<recent.items.at(-1).logged_in_at);checks+=2;
 const empty=await read('participants/'+account()+'/login-history?page=1');
 assert.deepEqual([empty.total,empty.items.length,empty.pages],[0,0,1]);checks++;
 await read('participants/'+crypto.randomUUID()+'/login-history?page=1','owner',404);
 await read('participants/'+target+'/login-history?page=0','owner',400);
 await read('participants/'+target+'/login-history?page=1','publisher',403);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM viewer_login_history WHERE logged_in_at<?').get(now-90*86400).n,0);checks++;
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);checks++;
 console.log(JSON.stringify({checks,search:['name','surname','email'],participantPageSize:25,historyPageSize:20,retentionDays:90,ownerOnly:true,singleActiveSession:true,productionWrites:0}));
}finally{
 console.warn=oldWarn;fixture.close();await fs.unlink(bundlePath).catch(()=>{});
}
