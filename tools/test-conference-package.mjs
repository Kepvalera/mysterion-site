import assert from 'node:assert/strict';
import {platformFixture} from './platform-local-fixture.mjs';
import {handlePlatform} from '../media-worker/src/platform.mjs';

const f=await platformFixture(),{db,env,staff}=f;
Object.assign(env,{SALES_ENABLED:'true',MEDIA_PAID_ENABLED:'true',SALES_PUBLIC_ENABLED:'true'});
let checks=0;
const request=(path,method='GET',body)=>new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/'+path,{method,headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','Cf-Access-Jwt-Assertion':staff.owner},...(body===undefined?{}:{body:JSON.stringify(body)})});
const call=(path,method='GET',body)=>handlePlatform(request(path,method,body),env);
const read=async promise=>{const r=await promise;const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));checks++;return body};
try{
 const conference=await read(call('admin/courses','POST',{title:{ru:'Конференция пакета',en:'Conference package'},description:{ru:'Пакет двух записей',en:'Two-record package'},kind:'conference',stream:null,access:'paid',price_minor:1000000,currency:'RUB',state:'published',duration_days:90,sale_enabled:1}));
 const product=db.prepare("SELECT kind,product_id,sale_enabled,policy FROM sales_products WHERE kind='course' AND product_id=?").get(conference.id);
 assert.equal(product.kind,'course');assert.equal(product.product_id,conference.id);assert.equal(product.sale_enabled,1);assert.equal(product.policy,JSON.stringify({mode:'days',days:90}));checks+=4;
 const videoIds=[];
 for(const title of ['День 1','День 2']){
  const videoId=crypto.randomUUID();  db.prepare("INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,updated_at,mutation_id) VALUES (?,?,?,'conference',2026,'bunny',?,'paid',1000000,'RUB','published',?,?,?)").run(videoId,JSON.stringify({ru:title,en:title}),'{}',crypto.randomUUID(),new Date().toISOString(),new Date().toISOString(),crypto.randomUUID());
  videoIds.push(videoId);
  await read(call('admin/lessons','POST',{course_id:conference.id,title:{ru:title,en:title},description:{ru:'Запись конференции',en:'Conference recording'},video_id:videoId,position:videoIds.length,state:'published',public_preview:0}));
 }
 const lessons=await read(call('admin/lessons','GET'));
 assert.equal(lessons.items.filter(l=>l.course_id===conference.id).length,2);checks++;
 const publicCatalog=await read(call('catalog','GET'));
 const packageItem=publicCatalog.courses.find(c=>c.id===conference.id);
 assert.equal(packageItem.access,'paid');assert.equal(packageItem.price_minor,1000000);checks+=2;
 const viewerId=crypto.randomUUID(),now=Math.floor(Date.now()/1000),orderId=crypto.randomUUID(),grantId=crypto.randomUUID();
 db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at) VALUES (?,?,?,?,'active','ru',?,?)").run(viewerId,'conference@example.invalid','fixture',now,now,now);
 db.prepare("INSERT INTO viewer_orders(id,viewer_id,course_id,title,amount_minor,currency,status,created_at,updated_at,access_expires_at) VALUES (?,?,?,?,1000000,'RUB','paid',?,?,?)").run(orderId,viewerId,conference.id,'{}',now,now,now+90*86400);
 db.prepare("INSERT INTO viewer_grants(id,viewer_id,course_id,starts_at,expires_at,granted_by,source_order_id,created_at) VALUES (?,?,?,?,?,'getplatinum',?,?)").run(grantId,viewerId,conference.id,now,now+90*86400,orderId,now);
 db.prepare("DELETE FROM platform_lessons WHERE course_id=? AND video_id=?").run(conference.id,videoIds[1]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM viewer_grants WHERE id=? AND source_order_id=? AND revoked_at IS NULL').get(grantId,orderId).n,1);checks++;
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM platform_lessons WHERE course_id=?').get(conference.id).n,1);checks++;
 console.log(JSON.stringify({checks,conferenceId:conference.id,videoCount:2,priceMinor:1000000,durationDays:90,existingGrantPreserved:true,realPayments:0}));
}finally{f.close()}
