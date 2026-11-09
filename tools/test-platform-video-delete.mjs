import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {platformFixture} from './platform-local-fixture.mjs';
import {handlePlatform} from '../media-worker/src/platform.mjs';
import {viewerLibrary} from '../media-worker/src/platform-data.mjs';

const fixture=await platformFixture(),{db,env,staff}=fixture,originalFetch=globalThis.fetch,oldWarn=console.warn;
console.warn=()=>{};
Object.assign(env,{BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'803179',BUNNY_API_KEY:'LOCAL_ONLY_DELETE_TEST_KEY',BUNNY_TOKEN_KEY:'LOCAL_ONLY_PLAYBACK_TEST_KEY'});
let deletionMode='missing',deleteRequests=[],checks=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++};
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://video.bunnycdn.com/')){
  if(options.method==='DELETE'){
   deleteRequests.push(String(url));
   if(deletionMode==='missing')return new Response('not found',{status:404});
   if(deletionMode==='fail')return new Response('provider failure',{status:500});
   return new Response(null,{status:204});
  }
  throw Error('Unexpected Bunny request');
 }
 return originalFetch(url,options);
};
const call=(path,method='GET',body,role='owner')=>handlePlatform(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/'+path,{
 method,headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','Cf-Access-Jwt-Assertion':staff[role]},
 ...(body===undefined?{}:{body:JSON.stringify(body)})
}),env);
const read=async result=>{const response=await result,data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data};
const createVideo=async({type='youtube',state='published',id=crypto.randomUUID()}={})=>{
 const response=await call('admin/videos','POST',{id,title:{ru:'Тест удаления',en:'Delete test'},description:{ru:'',en:''},category:'sermon',year:2026,source_type:type,source_ref:type==='youtube'?'abcdefghijk':'',access:'free',price_minor:0,currency:'EUR',state:type==='bunny'?'draft':state});
 const data=await read(response);
 if(type==='bunny')db.prepare("UPDATE videos SET source_ref=?,bunny_library_id='803179',bunny_status=4,state=? WHERE id=?").run(crypto.randomUUID(),state,id);
 return data;
};
const addViewer=()=>{
 const id=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
 db.prepare("INSERT INTO viewer_accounts(id,email,password_hash,email_verified_at,status,locale,created_at,updated_at) VALUES (?,?,?,?,'active','en',?,?)").run(id,id+'@example.invalid','local-fixture-hash',now,now,now);
 return id;
};
const addGrant=(viewerId,videoId)=>db.prepare('INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,created_at) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),viewerId,videoId,Math.floor(Date.now()/1000)-10,Math.floor(Date.now()/1000)+3600,'local-test-owner',Math.floor(Date.now()/1000));

try{
 const viewerId=addViewer();
 const hidden=await createVideo();
 addGrant(viewerId,hidden.id);
 check((await read(call('catalog'))).videos.length,1);
 check((await call('admin/videos/'+hidden.id,'DELETE',{revision:hidden.revision},'publisher')).status,403);
 check((await read(call('admin/videos/'+hidden.id,'DELETE',{revision:hidden.revision}))).ok,true);
 const hiddenRow=db.prepare('SELECT state,bunny_delete_pending FROM videos WHERE id=?').get(hidden.id);
 check([hiddenRow.state,hiddenRow.bunny_delete_pending],['deleted',0]);
 check(deleteRequests.length,0);
 check((await read(call('catalog'))).videos.length,0);
 check((await call('play/'+hidden.id)).status,404);
 check((await viewerLibrary(env.MEDIA_DB,viewerId)).videos.length,0);
 check(db.prepare('SELECT COUNT(*) n FROM viewer_grants WHERE video_id=?').get(hidden.id).n,1);

 const bunnyVideo=await createVideo({type:'bunny'});
 addGrant(viewerId,bunnyVideo.id);
 db.prepare("INSERT INTO viewer_orders(id,viewer_id,video_id,title,amount_minor,currency,status,created_at,updated_at) VALUES (?,?,?,'{}',100,'EUR','pending_payment',?,?)").run(crypto.randomUUID(),viewerId,bunnyVideo.id,Math.floor(Date.now()/1000),Math.floor(Date.now()/1000));
 const notBunny=await call('admin/videos/'+hidden.id+'/delete-bunny','POST',{revision:db.prepare('SELECT revision FROM videos WHERE id=?').get(hidden.id).revision});
 check(notBunny.status,409);
 check((await notBunny.json()).error,'bunny_required');
 check((await call('admin/videos/'+bunnyVideo.id+'/delete-bunny','POST',{revision:bunnyVideo.revision},'publisher')).status,403);
 check(deleteRequests.length,0);
 db.prepare("UPDATE videos SET bunny_library_id='999999' WHERE id=?").run(bunnyVideo.id);
 const wrongLibrary=await call('admin/videos/'+bunnyVideo.id+'/delete-bunny','POST',{revision:bunnyVideo.revision});
 check(wrongLibrary.status,409);
 check((await wrongLibrary.json()).error,'bunny_video_not_bound');
 check(deleteRequests.length,0);
 db.prepare("UPDATE videos SET bunny_library_id='803179' WHERE id=?").run(bunnyVideo.id);

 const missing=await call('admin/videos/'+bunnyVideo.id+'/delete-bunny','POST',{revision:bunnyVideo.revision});
 check(missing.status,502);
 check((await missing.json()).error,'bunny_library_or_video_not_found');
 let saved=db.prepare('SELECT * FROM videos WHERE id=?').get(bunnyVideo.id);
 check(saved.state,'deleted');
 check(saved.bunny_delete_pending,1);
 deletionMode='fail';
 const failed=await call('admin/videos/'+bunnyVideo.id+'/delete-bunny','POST',{revision:saved.revision});
 check(failed.status,502);
 check((await failed.json()).error,'bunny_unavailable');
 saved=db.prepare('SELECT * FROM videos WHERE id=?').get(bunnyVideo.id);
 check(saved.state,'deleted');
 check(saved.bunny_delete_pending,1);
 check((await viewerLibrary(env.MEDIA_DB,viewerId)).videos.length,0);
 check((await call('play/'+bunnyVideo.id)).status,404);
 const visible=await read(call('admin/videos'));
 check(visible.items.some(item=>item.id===bunnyVideo.id&&item.bunny_delete_pending===1),true);
 check(db.prepare('SELECT COUNT(*) n FROM viewer_grants WHERE video_id=?').get(bunnyVideo.id).n,1);
 check(db.prepare('SELECT COUNT(*) n FROM viewer_orders WHERE video_id=?').get(bunnyVideo.id).n,1);

 deletionMode='succeed';
 await read(call('admin/videos/'+bunnyVideo.id+'/delete-bunny','POST',{revision:saved.revision}));
 saved=db.prepare('SELECT * FROM videos WHERE id=?').get(bunnyVideo.id);
 check(saved.state,'deleted');
 check(saved.bunny_delete_pending,0);
 check(deleteRequests.length,3);
 check(deleteRequests.every(url=>url.includes('/library/803179/videos/'+saved.source_ref)),true);
 check(db.prepare('SELECT COUNT(*) n FROM videos WHERE id=?').get(bunnyVideo.id).n,1);
 check(db.prepare('SELECT COUNT(*) n FROM viewer_grants WHERE video_id=?').get(bunnyVideo.id).n,1);
 check(db.prepare('SELECT COUNT(*) n FROM viewer_orders WHERE video_id=?').get(bunnyVideo.id).n,1);
 check(db.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='video.hidden_deleted' AND target=?").get(hidden.id).n,1);
 check(db.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='video.bunny_deleted' AND target=?").get(bunnyVideo.id).n,1);

 const ui=await fs.readFile(new URL('../platform-admin.js',import.meta.url),'utf8');
 assert.ok(ui.includes('Видео будет безвозвратно удалено из Bunny Stream. Восстановить его будет невозможно.'));
 assert.ok(ui.includes("confirm(warning)||!confirm(second)"));
 assert.ok(ui.includes("'Убрать из каталога'"));
 assert.ok(ui.includes("'Удалить полностью'"));
 checks+=4;
 console.log(JSON.stringify({checks,softHide:true,hardDeleteOwnerOnly:true,wrongLibraryBlocked:true,bunnyFailureNotReportedAsSuccess:true,retryAfterPartialFailure:true,grantsAndOrdersPreserved:true,productionWrites:0,realBunnyRequests:0}));
}finally{
 globalThis.fetch=originalFetch;
 console.warn=oldWarn;
 fixture.close();
}
