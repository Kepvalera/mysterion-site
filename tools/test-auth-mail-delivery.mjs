/* Isolated mailer/SQLite fixtures: never sends a real message. */
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {platformFixture} from './platform-local-fixture.mjs';import {handleViewer} from '../media-worker/src/viewer-auth.mjs';
const f=await platformFixture(),{env,db}=f,originalWarn=console.warn,logs=[];console.warn=v=>logs.push(v);let checks=0,serial=1;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},pending=[];
const call=(route,data)=>handleViewer(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/viewer/'+route,{method:'POST',headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','CF-Connecting-IP':'192.0.2.'+(++serial)},body:JSON.stringify(data)}),env,{waitUntil(p){pending.push(p)}});
try{
 let release,held=false,settled=false;env.VIEWER_MAILER={async fetch(){held=true;return new Promise(resolve=>release=resolve)}};
 const registration=call('register',{email:'delivery@example.invalid',password:'Local-mail-8!?',locale:'ru'});registration.then(()=>settled=true);for(let i=0;i<200&&!held;i++)await new Promise(r=>setTimeout(r,5));eq(held,true);eq(settled,false);release(Response.json({id:'local-mail'}));eq((await registration).status,202);eq(pending.length,0);
 const identity=db.prepare('SELECT id,password_hash,status FROM viewer_accounts WHERE email=?').get('delivery@example.invalid');eq(identity.status,'pending');
 env.VIEWER_MAILER={async fetch(){return new Response('PRIVATE_PROVIDER_RESPONSE',{status:500})}};
 for(const route of ['resend-verification','forgot-password']){const r=await call(route,{email:'delivery@example.invalid'});eq(r.status,503);const data=await r.json();eq(data.error,'email_delivery_unavailable');eq(JSON.stringify(data).includes('PRIVATE_PROVIDER_RESPONSE'),false)}
 const r=await call('register',{email:'failed@example.invalid',password:'Local-mail-8!?'});eq(r.status,503);eq((await r.json()).error,'email_delivery_unavailable');
 // A failed registration remains pending; existing resend recovers it.
 let mail;env.VIEWER_MAILER={async fetch(r){mail=await r.json();return Response.json({id:'local-mail'})}};eq((await call('resend-verification',{email:'failed@example.invalid'})).status,202);const token=new URLSearchParams(new URL(mail.text.split('\n\n').at(-1)).hash.slice(1)).get('token');eq((await call('verify-email',{token})).status,200);eq((await call('login',{email:'failed@example.invalid',password:'Local-mail-8!?'})).status,200);
 const before=db.prepare('SELECT id,password_hash,status FROM viewer_accounts WHERE id=?').get(identity.id);eq(before,identity);
 const noAccount=await call('resend-verification',{email:'unknown@example.invalid'}),known=await call('resend-verification',{email:'delivery@example.invalid'});eq(noAccount.status,202);eq(known.status,202);eq(await noAccount.json(),await known.json());
 eq(logs.some(s=>/PRIVATE_PROVIDER_RESPONSE|delivery@example|failed@example|Local-mail-8/.test(s)),false);eq(db.prepare('PRAGMA foreign_key_check').all(),[]);
 const report={checks,acknowledgementWaitsForProvider:true,mailFailuresReturn503:true,resendRecovery:true,genericResponsesPreserved:true,realMessages:0,productionWrites:0};await fs.mkdir('output/auth-forms',{recursive:true});await fs.writeFile('output/auth-forms/mail-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{console.warn=originalWarn;f.close()}
