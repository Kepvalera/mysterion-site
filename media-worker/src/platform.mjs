import {HttpError} from './auth.mjs';
import {requireMediaOrigin} from './origin.mjs';
import {requireViewerSession} from './viewer-auth.mjs';
import {admitViewerOperation,ViewerRateLimitError} from './viewer-rate-limit.mjs';
import {deny,time,rows,decode,localized,courseAccess,videoAccess} from './platform-data.mjs';
import {csrf,input,text,revision,product,json} from './platform-http.mjs';
import {platformAdmin} from './platform-admin.mjs';
import {vkEmbed} from './video-source.mjs';
import * as bunny from './bunny.mjs';
export async function handlePlatform(request,env){
 const requestId=crypto.randomUUID();
 try{
  requireMediaOrigin(request,env);if(env.VIEWER_PLATFORM_ENABLED!=='true'||!env.MEDIA_DB)deny(503,'platform_not_configured');
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/platform\//,''),method=request.method,db=env.MEDIA_DB;
  if(path.startsWith('admin/'))return json(await platformAdmin(request,env,path.slice(6),method));
  if(method!=='GET')csrf(request,env);
  const cover=path.match(/^covers\/([a-f0-9-]{36})$/);
  if(cover&&method==='GET'){const row=await db.prepare("SELECT c.mime,c.bytes FROM media_covers c JOIN videos v ON v.id=c.video_id WHERE v.id=? AND v.state='published' AND v.publish_at<=?").bind(cover[1],new Date().toISOString()).first();if(!row)deny(404,'not_found');return new Response(row.bytes,{headers:{'Content-Type':row.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
  if(path==='catalog'&&method==='GET'){
   const courses=await rows(db.prepare("SELECT id,title,description,kind,stream,access,price_minor,currency FROM platform_courses WHERE state='published' ORDER BY updated_at DESC LIMIT 200"));
   const videos=await rows(db.prepare("SELECT id,title,description,category,year,access,price_minor,currency,(cover_key='d1') AS has_cover FROM videos WHERE state='published' AND publish_at<=? ORDER BY publish_at DESC LIMIT 200").bind(new Date().toISOString()));
   return json({courses:courses.map(decode),videos:videos.map(decode)});
  }
  const play=path.match(/^play\/([a-f0-9-]{36})$/);
  if(play&&method==='GET'){
   const video=await db.prepare("SELECT * FROM videos WHERE id=? AND state='published' AND publish_at<=?").bind(play[1],new Date().toISOString()).first();if(!video)deny(404,'not_found');let maxExpiry=time()+180;
   if(video.access==='paid'){
    const viewer=await requireViewerSession(request,env),grant=await videoAccess(db,viewer.id,video.id);if(!grant?.expires_at)deny(403,'viewing_right_required');
    if(env.MEDIA_PAID_ENABLED!=='true')deny(503,'paid_playback_disabled');maxExpiry=Math.min(maxExpiry,grant.expires_at,viewer.expires_at);
   }
   if(video.source_type==='youtube'&&video.access==='free')return json({type:'youtube',id:video.source_ref});
   if(video.source_type==='vk'&&video.access==='free')return json({type:'vk',url:vkEmbed(video.source_ref)});
   if(video.source_type==='r2'&&video.access==='free')return json({type:'r2',url:'/api/media/videos/'+video.id+'/stream'});
   if(video.source_type!=='bunny')deny(503,'protected_storage_required');if(video.bunny_status!==4)deny(409,'video_not_ready');
   return json(await bunny.playback(env,video,maxExpiry));
  }
  const courseMatch=path.match(/^courses\/([a-f0-9-]{36})$/),lessonMatch=path.match(/^lessons\/([a-f0-9-]{36})$/);
  if(courseMatch&&method==='GET'){
   const course=await db.prepare("SELECT * FROM platform_courses WHERE id=? AND state='published'").bind(courseMatch[1]).first();if(!course)deny(404,'not_found');
   let expiresAt=null;if(course.access==='paid'){const user=await requireViewerSession(request,env),grant=await courseAccess(db,user.id,course.id);if(!grant?.expires_at)deny(403,'viewing_right_required');expiresAt=grant.expires_at}
   const lessons=await rows(db.prepare("SELECT id,title,description,position FROM platform_lessons WHERE course_id=? AND state='published' ORDER BY position,id").bind(course.id));return json({...decode(course),expires_at:expiresAt,lessons:lessons.map(decode)});
  }
  if(lessonMatch&&method==='GET'){
   const lesson=await db.prepare("SELECT l.*,c.access,c.state AS course_state FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.id=? AND l.state='published' AND c.state='published'").bind(lessonMatch[1]).first();if(!lesson)deny(404,'not_found');
   if(lesson.access==='paid'&&!lesson.public_preview){const user=await requireViewerSession(request,env),grant=await courseAccess(db,user.id,lesson.course_id);if(!grant?.expires_at)deny(403,'viewing_right_required')}
   const materials=await rows(db.prepare('SELECT id,title,content FROM platform_materials WHERE lesson_id=? ORDER BY id').bind(lesson.id));
   return json({...decode(lesson),materials:materials.map(m=>({...m,title:localized(m.title)}))});
  }
  const viewer=await requireViewerSession(request,env);
  if(path==='profile'&&method==='PUT'){
   const data=await input(request,['first_name','last_name']);await admitViewerOperation(request,env,'profile',{address:viewer.id});
   const names=['first_name','last_name'].map(key=>{const name=text(data[key],80);if(/[<>\p{Cc}\p{Cf}]/u.test(name))deny(400,'invalid_name');return name.normalize('NFC')});
   await db.prepare('UPDATE viewer_accounts SET first_name=?,last_name=?,updated_at=? WHERE id=?').bind(...names,time(),viewer.id).run();return json({ok:true});
  }
  if(path==='orders'&&method==='POST'){
   const data=await input(request,['kind','id']),target=product(data);await admitViewerOperation(request,env,'orders',{address:viewer.id});
   const item=await db.prepare(`SELECT * FROM ${target.table} WHERE id=? AND state='published'${data.kind==='video'?' AND publish_at<=?':''}`).bind(data.id,...(data.kind==='video'?[new Date().toISOString()]:[])).first();if(!item||item.access!=='paid'||item.price_minor<=0)deny(400,'not_for_sale');
   const id=crypto.randomUUID();await db.prepare(`INSERT INTO viewer_orders(id,viewer_id,${target.column},title,amount_minor,currency,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending_payment',?,?) ON CONFLICT DO NOTHING`).bind(id,viewer.id,item.id,item.title,item.price_minor,item.currency,time(),time()).run();
   const order=await db.prepare(`SELECT id,status,revision FROM viewer_orders WHERE viewer_id=? AND ${target.column}=? AND status IN ('pending_payment','in_review')`).bind(viewer.id,item.id).first();return json(order,201);
  }
  const submit=path.match(/^orders\/([a-f0-9-]{36})\/submit$/);
  if(submit&&method==='POST'){
   const data=await input(request,['revision']);await admitViewerOperation(request,env,'orders',{address:viewer.id});
   const result=await db.prepare("UPDATE viewer_orders SET status='in_review',revision=revision+1,updated_at=? WHERE id=? AND viewer_id=? AND status='pending_payment' AND revision=?").bind(time(),submit[1],viewer.id,revision(data.revision)).run();if(!result.meta.changes)deny(409,'revision_conflict');return json({ok:true});
  }
  const progress=path.match(/^progress\/([a-f0-9-]{36})$/);
  if(progress&&method==='PUT'){
   const data=await input(request,['position_seconds','completed']);await admitViewerOperation(request,env,'progress',{address:viewer.id});
   if(!Number.isInteger(data.position_seconds)||data.position_seconds<0||data.position_seconds>86400||![0,1].includes(data.completed))deny(400,'invalid_fields');
   const lesson=await db.prepare("SELECT l.*,c.access FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.id=? AND l.state='published' AND c.state='published'").bind(progress[1]).first();if(!lesson)deny(404,'not_found');
   if(lesson.access==='paid'&&!lesson.public_preview&&!(await courseAccess(db,viewer.id,lesson.course_id))?.expires_at)deny(403,'viewing_right_required');
   await db.prepare('INSERT INTO platform_progress VALUES (?,?,?,?,?) ON CONFLICT(viewer_id,lesson_id) DO UPDATE SET position_seconds=excluded.position_seconds,completed=excluded.completed,updated_at=excluded.updated_at').bind(viewer.id,lesson.id,data.position_seconds,data.completed,time()).run();return json({ok:true});
  }
  deny(404,'not_found');
 }catch(error){
  const status=error instanceof HttpError?error.status:503,code=error instanceof HttpError?error.message:'platform_unavailable';
  const rate=error instanceof ViewerRateLimitError?{retryAfter:error.retryAfter,limitScope:error.limitScope}:{};
  console.warn(JSON.stringify({event:'platform_request_failed',requestId,status,code,...rate}));const response=json({error:code,requestId,...rate},status);if(rate.retryAfter)response.headers.set('Retry-After',String(rate.retryAfter));return response;
 }
}
