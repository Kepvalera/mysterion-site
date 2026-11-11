import assert from 'node:assert/strict';import {platformFixture} from './platform-local-fixture.mjs';import {handlePlatform} from '../media-worker/src/platform.mjs';import {videoAccess,courseAccess,viewerLibrary} from '../media-worker/src/platform-data.mjs';
const f=await platformFixture(),{db,env,staff}=f;env.SALES_ENABLED='true';env.MEDIA_PAID_ENABLED='true';let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++},now=Math.floor(Date.now()/1000),uid=crypto.randomUUID(),video=crypto.randomUUID(),course=crypto.randomUUID(),oid=crypto.randomUUID(),gid=crypto.randomUUID(),id=()=>crypto.randomUUID();
const request=(path,method='GET',data,role='owner',csrf=true)=>new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/'+path,{method,headers:{'Content-Type':'application/json',Origin:env.MEDIA_PUBLIC_ORIGIN,...(csrf?{'X-Requested-With':'XMLHttpRequest'}:{}),...(role?{'Cf-Access-Jwt-Assertion':staff[role]}:{})},...(data?{body:JSON.stringify(data)}:{})});
const call=(...a)=>handlePlatform(request(...a),env),read=async(...args)=>{const r=await call(...args),v=await r.json();eq(r.status,200);return v};
try{
 db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,status,email_verified_at,locale,first_name,last_name,created_at,updated_at) VALUES (?,'access@example.invalid','NO_LOGIN','active',?,'ru','Валерий','Громов',?,?)").run(uid,now,now,now);
 db.prepare("INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,created_by,updated_at,publish_at,bunny_status,mutation_id) VALUES (?,'{\"ru\":\"Тест\",\"en\":\"Test\"}','{}','school',2026,'bunny',?,'paid',10000,'RUB','published','fixture',?,?,4,'fixture')").run(video,id(),new Date().toISOString(),new Date(now*1000-1000).toISOString());
 db.prepare("INSERT INTO platform_courses(id,title,description,kind,stream,access,price_minor,currency,state,created_at,updated_at) VALUES (?,'{}','{}','school',6,'paid',3000000,'RUB','published',?,?)").run(course,now,now);
 db.prepare("INSERT INTO platform_lessons(id,course_id,video_id,title,description,position,state,public_preview) VALUES (?,?,?,'{}','{}',1,'published',0)").run(id(),course,video);
 db.prepare("INSERT INTO viewer_orders(id,viewer_id,video_id,title,amount_minor,currency,status,created_at,updated_at) VALUES (?,?,?,'{}',10000,'EUR','paid',?,?)").run(oid,uid,video,now,now);
 db.prepare("INSERT INTO sales_orders(order_id,source,state,policy) VALUES (?,'manual','granted','{\"mode\":\"days\",\"days\":30}')").run(oid);
 db.prepare('INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,source_order_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(gid,uid,video,now-50,now+5000,'fixture',oid,now);
 db.prepare('INSERT INTO viewer_grants(id,viewer_id,course_id,starts_at,expires_at,granted_by,created_at) VALUES (?,?,?,?,?,?,?)').run(id(),uid,course,now-50,now+8000,'fixture',now);
 const expired=id(),revoked=id();for(const [g,end,revoke] of [[expired,now-1,null],[revoked,now+5000,now]])db.prepare('INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,created_at,revoked_at) VALUES (?,?,?,?,?,?,?,?)').run(g,uid,video,now-500,end,'fixture',now,revoke);
 const snapshot=JSON.stringify(db.prepare('SELECT * FROM viewer_orders').all());
 eq((await read('admin/access')).total,2);eq((await read('admin/access?filter=expired')).total,1);eq((await read('admin/access?filter=revoked')).total,1);eq((await read('admin/access?filter=all&q='+encodeURIComponent('гРОМОВ'))).total,4);eq((await read('admin/access?q=ACCESS@')).total,2);
 const detail=await read('admin/access?filter=all&viewer='+uid);eq(detail.participant.email,'access@example.invalid');eq(detail.total,4);
 eq((await call('admin/access?filter=invalid')).status,400);eq((await call('admin/access?page=-1')).status,400);eq((await call('admin/access','GET',null,null)).status,401);eq((await call('admin/access','GET',null,'uploader')).status,403);
 const change={request_id:id(),revision:1};eq((await call('admin/access/'+gid+'/revoke','POST',change,'owner',false)).status,403);await read('admin/access/'+gid+'/revoke','POST',change);await read('admin/access/'+gid+'/revoke','POST',change);
 eq((await videoAccess(env.MEDIA_DB,uid,video)).expires_at,null);eq((await courseAccess(env.MEDIA_DB,uid,course)).expires_at>now,true);eq((await viewerLibrary(env.MEDIA_DB,uid,true)).videos.length,0);
 eq(db.prepare("SELECT COUNT(*) n FROM sales_operations WHERE action='access.revoke'").get().n,1);eq((await read('admin/access?filter=revoked')).total,3); // Duplicate grant is also effectively blocked.
 await read('admin/access/'+gid+'/restore','POST',{request_id:id(),revision:2});eq((await videoAccess(env.MEDIA_DB,uid,video)).expires_at>now,true);eq(db.prepare('SELECT COUNT(*) n FROM access_blocks').get().n,0);
 await read('admin/access/'+revoked+'/extend','POST',{request_id:id(),revision:1,dates:{starts_at:now-100,ends_at:now+10000}});eq(db.prepare('SELECT revoked_at FROM viewer_grants WHERE id=?').get(revoked).revoked_at,now);
 eq((await call('admin/access/'+expired+'/restore','POST',{request_id:id(),revision:1})).status,409);
 db.prepare("UPDATE viewer_orders SET status='rejected' WHERE id=?").run(oid);eq((await call('admin/access/'+gid+'/restore','POST',{request_id:id(),revision:3})).status,409);db.prepare("UPDATE viewer_orders SET status='paid' WHERE id=?").run(oid);
 eq(JSON.stringify(db.prepare('SELECT * FROM viewer_orders').all()),snapshot);
 for(let i=0;i<30;i++)db.prepare('INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,created_at) VALUES (?,?,?,?,?,?,?)').run(id(),uid,video,now-1,now+1000,'fixture',now+i);
 const paged=await read('admin/access?filter=all');eq(paged.items.length,25);eq(paged.pages,2);eq((await read('admin/access?filter=all&page=2')).items.length,9);
 eq(await read('currency-rates'),{eur_rub:null,usd_rub:null});eq((await call('admin/currency-rates','PUT',{request_id:id(),revision:1,eur_rub:100,usd_rub:90},'publisher')).status,403);
 eq((await call('admin/currency-rates','PUT',{request_id:id(),revision:1,eur_rub:-1,usd_rub:90})).status,400);
 await read('admin/currency-rates','PUT',{request_id:id(),revision:1,eur_rub:100,usd_rub:90});eq(await read('currency-rates'),{eur_rub:100,usd_rub:90});
 eq((await call('admin/currency-rates','PUT',{request_id:id(),revision:1,eur_rub:101,usd_rub:90})).status,409);
 eq(db.prepare('SELECT amount_minor,currency FROM viewer_orders WHERE id=?').get(oid).currency,'EUR');eq(db.prepare('SELECT COUNT(*) n FROM sales_payments').get().n,0);
 db.prepare("UPDATE videos SET currency='EUR' WHERE id=?").run(video);const product={request_id:id(),kind:'video',id:video,revision:1,policy_revision:0,access:'paid',price_minor:10000,sale_enabled:0,policy:{mode:'days',days:30}};
 eq((await call('admin/sales/products','PUT',product)).status,409);await read('admin/sales/products','PUT',{...product,request_id:id(),confirm_rub_price:true});eq(db.prepare('SELECT currency FROM videos WHERE id=?').get(video).currency,'RUB');eq(db.prepare('SELECT currency FROM viewer_orders WHERE id=?').get(oid).currency,'EUR');
 console.log(JSON.stringify({checks,localOnly:true,paidHistoryPreserved:true,serverBlockOverridesCourseAccess:true,displayRatesOnly:true}));
}finally{f.close()}
