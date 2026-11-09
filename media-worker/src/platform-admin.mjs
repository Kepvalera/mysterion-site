import {staffIdentity,requireOwner,canEditVideo,deny,rows,decode,time,idPattern,audit} from './platform-data.mjs';
import {csrf,input,text,translations,revision,expiry,product} from './platform-http.mjs';
import {vkEmbed,youtubeId} from './video-source.mjs';
import * as bunny from './bunny.mjs';
const categories=['sermon','testimony','conference','school'];
function money(d){if(!['free','paid'].includes(d.access)||!Number.isSafeInteger(d.price_minor)||d.price_minor<0||d.price_minor>100000000||!['EUR','USD','RUB'].includes(d.currency)||(d.access==='free'&&d.price_minor!==0)||(d.access==='paid'&&d.price_minor===0))deny(400,'invalid_price')}
function mergeTranslation(value,previous,max,required=false){const next=JSON.parse(translations(value,max,required));if(previous){try{const old=JSON.parse(previous);if(typeof old.de==='string')next.de=old.de}catch{}}return JSON.stringify(next)}
function coverURL(id){return '/api/platform/covers/'+id}
async function videoRow(db,id){const row=await db.prepare("SELECT * FROM videos WHERE id=? AND state!='deleted'").bind(id).first();if(!row)deny(404,'not_found');return row}
async function updateResult(statement){const result=await statement.run();if(!result.meta.changes)deny(409,'revision_conflict');return {ok:true}}
export async function platformAdmin(request,env,path,method){
 const db=env.MEDIA_DB,staff=await staffIdentity(request,env);if(method!=='GET')csrf(request,env);
 if(path==='me'&&method==='GET'){let uploadConfigured=false;try{bunny.configured(env);uploadConfigured=true}catch{}return {role:staff.role,canPublish:staff.role!=='uploader',owner:staff.role==='owner',uploadConfigured,paidEnabled:env.MEDIA_PAID_ENABLED==='true'}}
 if(path==='videos'&&method==='GET')return {items:(await rows(db.prepare("SELECT * FROM videos WHERE state!='deleted' AND (?!='uploader' OR (created_by=? AND state='draft')) ORDER BY updated_at DESC LIMIT 200").bind(staff.role,staff.sub))).map(decode)};
 const vm=path.match(/^videos\/([a-f0-9-]{36})(?:\/(upload|status|resume|cover))?$/);
 if(path==='videos'&&method==='POST'||vm&&!vm[2]&&method==='PUT'){
  const d=await input(request,['id','title','description','category','year','source_type','source_ref','access','price_minor','currency','state','revision']);
  if(d.id!==undefined&&(!idPattern.test(d.id)||vm&&d.id!==vm[1]))deny(400,'invalid_video');
  const old=vm?await videoRow(db,vm[1]):null;if(old)canEditVideo(staff,old);money(d);
  if(!categories.includes(d.category)||!Number.isInteger(d.year)||d.year<1900||d.year>2100||!['youtube','vk','bunny'].includes(d.source_type)||!['draft','published'].includes(d.state))deny(400,'invalid_video');
  if(staff.role==='uploader'&&d.state!=='draft')deny(403,'publisher_required');
  if(d.access==='paid'&&d.source_type!=='bunny')deny(400,'protected_storage_required');
  let ref=d.source_type==='bunny'?(old?.source_type==='bunny'?old.source_ref:''):text(d.source_ref,1024,true);
  if(d.source_type==='youtube')ref=youtubeId(ref);if(d.source_type==='vk')ref=vkEmbed(ref);
  if(old&&old.source_type==='bunny'&&old.source_ref&&d.source_type!=='bunny')deny(409,'bound_source_immutable');
  if(d.state==='published'){
   if(d.access==='paid'&&env.MEDIA_PAID_ENABLED!=='true')deny(503,'paid_publication_disabled');
   if(d.source_type==='bunny'){bunny.boundVideo(env,old||{});const status=await bunny.syncVideo(env,old);if(!status.ready)deny(409,'video_not_ready')}
  }
  const title=mergeTranslation(d.title,old?.title,300,true),description=mergeTranslation(d.description,old?.description,6000),now=new Date().toISOString(),id=old?.id||d.id||crypto.randomUUID();
  if(old)await updateResult(db.prepare('UPDATE videos SET title=?,description=?,category=?,year=?,source_type=?,source_ref=?,access=?,price_minor=?,currency=?,state=?,revision=revision+1,updated_at=?,mutation_id=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM bunny_leases WHERE video_id=videos.id AND expires_at>?)').bind(title,description,d.category,d.year,d.source_type,ref,d.access,d.price_minor,d.currency,d.state,now,crypto.randomUUID(),id,revision(d.revision),time()));
  else {
   await db.prepare('INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,updated_at,mutation_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,title,description,d.category,d.year,d.source_type,ref,d.access,d.price_minor,d.currency,d.state,now,now,crypto.randomUUID(),staff.sub).run();
   const saved=await videoRow(db,id);if(saved.created_by!==staff.sub)deny(403,'draft_owner_required');
   // A stable client-chosen UUID makes an initial save safe to retry after a
   // lost response. It never overwrites an existing or concurrently edited row.
   if(saved.title!==title||saved.description!==description||['category','year','source_type','access','price_minor','currency','state'].some(k=>saved[k]!==d[k])||d.source_type!=='bunny'&&saved.source_ref!==ref)deny(409,'revision_conflict');
  }
  await audit(db,staff.sub,'video.saved',id);return decode(await videoRow(db,id));
 }
 if(vm){
  const video=await videoRow(db,vm[1]);canEditVideo(staff,video);
  if(method==='PUT'&&vm[2]==='cover'){
   const mime=request.headers.get('Content-Type');if(!['image/jpeg','image/png','image/webp'].includes(mime))deny(415,'invalid_cover');
   const reader=request.body?.getReader();if(!reader)deny(400,'invalid_cover');const chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();deny(413,'cover_too_large')}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   const signature=mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';if(!signature)deny(400,'invalid_cover');
   await db.batch([db.prepare('INSERT INTO media_covers VALUES (?,?,?) ON CONFLICT(video_id) DO UPDATE SET mime=excluded.mime,bytes=excluded.bytes').bind(video.id,mime,bytes),db.prepare("UPDATE videos SET cover_key='d1',cover_type=? WHERE id=?").bind(mime,video.id)]);await audit(db,staff.sub,'video.cover',video.id);return {ok:true,url:coverURL(video.id)};
  }
  if(method==='DELETE'&&!vm[2]){requireOwner(staff);const d=await input(request,['revision']);await updateResult(db.prepare("UPDATE videos SET state='deleted',revision=revision+1,bunny_delete_pending=CASE WHEN source_type='bunny' AND source_ref!='' THEN 1 ELSE 0 END WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM bunny_leases WHERE video_id=videos.id AND expires_at>?)").bind(video.id,revision(d.revision),time()));await audit(db,staff.sub,'video.hidden_deleted',video.id);return {ok:true,providerRemovalPending:video.source_type==='bunny'&&!!video.source_ref}}
  if(method==='POST'&&vm[2]==='upload'){
   if(video.state!=='draft'||video.source_type!=='bunny')deny(409,'bunny_draft_required');bunny.configured(env);
   return bunny.withLease(env,video.id,async()=>{
    let current=await videoRow(db,video.id);
    if(!current.source_ref){const remote=await bunny.bunnyRequest(env,'','POST',{title:JSON.parse(current.title).ru});if(!bunny.uuid.test(remote.guid)||String(remote.videoLibraryId)!==env.BUNNY_LIBRARY_ID)deny(502,'bunny_response_invalid');
     await db.prepare("UPDATE videos SET source_ref=?,bunny_library_id=? WHERE id=? AND source_type='bunny' AND source_ref='' AND state='draft'").bind(remote.guid,env.BUNNY_LIBRARY_ID,current.id).run();current=await videoRow(db,current.id)}
    return bunny.uploadGrant(env,current);
   });
  }
  if(method==='POST'&&vm[2]==='status')return bunny.syncVideo(env,video);
  if(vm[2]==='resume'){
   if(video.state!=='draft'||video.source_type!=='bunny')deny(409,'bunny_draft_required');
   if(method==='GET'){
    if(!video.source_ref)return {upload:null};
    bunny.boundVideo(env,video);
    return {upload:await db.prepare('SELECT location,file_size,fingerprint FROM platform_uploads WHERE video_id=?').bind(video.id).first()};
   }
   bunny.boundVideo(env,video);
   if(method==='PUT'){const d=await input(request,['location','file_size','fingerprint']);let url;try{url=new URL(d.location)}catch{deny(400,'invalid_upload_location')}
    if(url.origin!=='https://video.bunnycdn.com'||!/^\/tusupload\/[a-zA-Z0-9_-]+$/.test(url.pathname)||url.search||url.hash||url.username||url.password||!Number.isSafeInteger(d.file_size)||d.file_size<1||d.file_size>20*1024**3||!/^[a-f0-9]{64}$/.test(d.fingerprint))deny(400,'invalid_upload_location');
    await db.prepare('INSERT INTO platform_uploads VALUES (?,?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET location=excluded.location,file_size=excluded.file_size,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at').bind(video.id,url.href,d.file_size,d.fingerprint,time()).run();return {ok:true};}
  }
 }
 // Every non-video administrative operation is owner-only, including lists.
 requireOwner(staff);
 if(path==='overview'&&method==='GET')return {participants:(await db.prepare('SELECT COUNT(*) n FROM viewer_accounts').first()).n,videos:(await db.prepare("SELECT COUNT(*) n FROM videos WHERE state!='deleted'").first()).n,courses:(await db.prepare("SELECT COUNT(*) n FROM platform_courses WHERE state!='archived'").first()).n,orders:(await db.prepare("SELECT COUNT(*) n FROM viewer_orders WHERE status='in_review'").first()).n};
 if(path==='participants'&&method==='GET')return {items:await rows(db.prepare('SELECT id,email,first_name,last_name,status,email_verified_at,created_at FROM viewer_accounts ORDER BY created_at DESC LIMIT 200'))};
 const participant=path.match(/^participants\/([a-f0-9-]{36})$/);
 if(participant&&method==='PUT'){
  const d=await input(request,['first_name','last_name','status']);if(!['active','disabled'].includes(d.status))deny(400,'invalid_account_status');
  const names=['first_name','last_name'].map(k=>{const value=text(d[k],80);if(/[<>\p{Cc}\p{Cf}]/u.test(value))deny(400,'invalid_name');return value.normalize('NFC')});
  const result=await db.batch([db.prepare('UPDATE viewer_accounts SET first_name=?,last_name=?,status=?,updated_at=? WHERE id=? AND email_verified_at IS NOT NULL').bind(...names,d.status,time(),participant[1]),db.prepare("DELETE FROM viewer_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM viewer_accounts a WHERE a.id=account_id AND a.status='disabled')").bind(participant[1])]);
  if(!result[0].meta.changes)deny(409,'verified_account_required');await audit(db,staff.sub,'participant.updated',participant[1]);return {ok:true};
 }
 if(path==='courses'&&method==='GET')return {items:(await rows(db.prepare('SELECT * FROM platform_courses ORDER BY updated_at DESC LIMIT 200'))).map(decode)};
 const cm=path.match(/^courses\/([a-f0-9-]{36})$/);
 if(path==='courses'&&method==='POST'||cm&&method==='PUT'){
  const d=await input(request,['title','description','kind','stream','access','price_minor','currency','state','revision']);money(d);
  if(!['school','conference','seminar','course'].includes(d.kind)||!['draft','published','archived'].includes(d.state)||(d.kind==='school'?![3,4,5,6].includes(d.stream):d.stream!==null))deny(400,'invalid_course');
  const title=translations(d.title,300,true),description=translations(d.description,6000),id=cm?.[1]||crypto.randomUUID();
  if(cm)await updateResult(db.prepare('UPDATE platform_courses SET title=?,description=?,kind=?,stream=?,access=?,price_minor=?,currency=?,state=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(title,description,d.kind,d.stream,d.access,d.price_minor,d.currency,d.state,time(),id,revision(d.revision)));
  else await db.prepare('INSERT INTO platform_courses(id,title,description,kind,stream,access,price_minor,currency,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id,title,description,d.kind,d.stream,d.access,d.price_minor,d.currency,d.state,time(),time()).run();await audit(db,staff.sub,'course.saved',id);return decode(await db.prepare('SELECT * FROM platform_courses WHERE id=?').bind(id).first());
 }
 if(path==='lessons'&&method==='GET')return {items:(await rows(db.prepare('SELECT * FROM platform_lessons ORDER BY course_id,position LIMIT 500'))).map(decode)};
 const lm=path.match(/^lessons\/([a-f0-9-]{36})$/);
 if(path==='lessons'&&method==='POST'||lm&&method==='PUT'){
  const d=await input(request,['course_id','title','description','video_id','position','state','public_preview','revision']);
  if(!idPattern.test(d.course_id)||d.video_id!==null&&!idPattern.test(d.video_id)||!Number.isInteger(d.position)||d.position<0||d.position>10000||!['draft','published'].includes(d.state)||![0,1].includes(d.public_preview))deny(400,'invalid_lesson');
  const course=await db.prepare('SELECT * FROM platform_courses WHERE id=?').bind(d.course_id).first();if(!course)deny(404,'course_not_found');
  if(d.video_id){const video=await videoRow(db,d.video_id);if(d.state==='published'&&video.state!=='published')deny(409,'published_video_required');if(course.access==='free'&&video.access!=='free')deny(400,'free_course_paid_video');if(course.access==='paid'&&!d.public_preview&&video.access==='free')deny(400,'public_video_requires_preview')}
  const title=translations(d.title,300,true),description=translations(d.description,6000),id=lm?.[1]||crypto.randomUUID();
  if(lm)await updateResult(db.prepare('UPDATE platform_lessons SET course_id=?,title=?,description=?,video_id=?,position=?,state=?,public_preview=?,revision=revision+1 WHERE id=? AND revision=?').bind(d.course_id,title,description,d.video_id,d.position,d.state,d.public_preview,id,revision(d.revision)));
  else await db.prepare('INSERT INTO platform_lessons(id,course_id,title,description,video_id,position,state,public_preview) VALUES (?,?,?,?,?,?,?,?)').bind(id,d.course_id,title,description,d.video_id,d.position,d.state,d.public_preview).run();await audit(db,staff.sub,'lesson.saved',id);return decode(await db.prepare('SELECT * FROM platform_lessons WHERE id=?').bind(id).first());
 }
 if(path==='materials'&&method==='GET')return {items:(await rows(db.prepare('SELECT * FROM platform_materials LIMIT 500'))).map(decode)};
 const mm=path.match(/^materials\/([a-f0-9-]{36})$/);
 if(path==='materials'&&method==='POST'||mm&&method==='PUT'){
  const d=await input(request,['lesson_id','title','content','revision']);if(!idPattern.test(d.lesson_id))deny(400,'invalid_lesson');const title=translations(d.title,300,true),content=text(d.content,20000,true),id=mm?.[1]||crypto.randomUUID();
  if(!await db.prepare('SELECT id FROM platform_lessons WHERE id=?').bind(d.lesson_id).first())deny(404,'lesson_not_found');
  if(mm)await updateResult(db.prepare('UPDATE platform_materials SET lesson_id=?,title=?,content=?,revision=revision+1 WHERE id=? AND revision=?').bind(d.lesson_id,title,content,id,revision(d.revision)));
  else await db.prepare('INSERT INTO platform_materials(id,lesson_id,title,content) VALUES (?,?,?,?)').bind(id,d.lesson_id,title,content).run();await audit(db,staff.sub,'material.saved',id);return {id,ok:true};
 }
 if(path==='grants'&&method==='GET')return {items:await rows(db.prepare('SELECT g.*,a.email,c.title AS course_title,v.title AS video_title FROM viewer_grants g JOIN viewer_accounts a ON a.id=g.viewer_id LEFT JOIN platform_courses c ON c.id=g.course_id LEFT JOIN videos v ON v.id=g.video_id ORDER BY g.created_at DESC LIMIT 200'))};
 if(path==='grants'&&method==='POST'){
  const d=await input(request,['viewer_id','kind','id','expires_at']),target=product(d),until=expiry(d.expires_at);if(!idPattern.test(d.viewer_id)||!await db.prepare("SELECT id FROM viewer_accounts WHERE id=? AND status='active'").bind(d.viewer_id).first()||!await db.prepare(`SELECT id FROM ${target.table} WHERE id=?`).bind(d.id).first())deny(404,'target_not_found');
  const id=crypto.randomUUID();await db.prepare(`INSERT INTO viewer_grants(id,viewer_id,${target.column},starts_at,expires_at,granted_by,created_at) VALUES (?,?,?,?,?,?,?)`).bind(id,d.viewer_id,d.id,time(),until,staff.sub,time()).run();await audit(db,staff.sub,'grant.created',id);return {id};
 }
 const revoke=path.match(/^grants\/([a-f0-9-]{36})\/revoke$/);if(revoke&&method==='POST'){await input(request,[]);await db.prepare('UPDATE viewer_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(time(),revoke[1]).run();await audit(db,staff.sub,'grant.revoked',revoke[1]);return {ok:true}}
 if(path==='orders'&&method==='GET')return {items:(await rows(db.prepare('SELECT o.*,a.email FROM viewer_orders o JOIN viewer_accounts a ON a.id=o.viewer_id ORDER BY o.created_at DESC LIMIT 200'))).map(decode)};
 const om=path.match(/^orders\/([a-f0-9-]{36})\/(approve|reject)$/);
 if(om&&method==='POST'){
  const d=await input(request,['revision','expires_at','confirm_received']),rev=revision(d.revision),approval=crypto.randomUUID();
  if(om[2]==='approve'){
   if(d.confirm_received!==true)deny(400,'payment_confirmation_required');const until=expiry(d.expires_at);
   const results=await db.batch([
    db.prepare("UPDATE viewer_orders SET status='paid',approval_id=?,access_expires_at=?,reviewed_by=?,updated_at=?,revision=revision+1 WHERE id=? AND status='in_review' AND revision=?").bind(approval,until,staff.sub,time(),om[1],rev),
    db.prepare("INSERT INTO viewer_grants(id,viewer_id,course_id,video_id,starts_at,expires_at,granted_by,source_order_id,created_at) SELECT ?,viewer_id,course_id,video_id,?,?,?,id,? FROM viewer_orders WHERE id=? AND approval_id=? AND status='paid'").bind(crypto.randomUUID(),time(),until,staff.sub,time(),om[1],approval),
    db.prepare("INSERT INTO platform_audit SELECT ?,?,'order.approved',id,? FROM viewer_orders WHERE id=? AND approval_id=?").bind(crypto.randomUUID(),staff.sub,time(),om[1],approval)
   ]);if(!results[0].meta.changes)deny(409,'revision_conflict');return {ok:true};
  }
  await updateResult(db.prepare("UPDATE viewer_orders SET status='rejected',reviewed_by=?,updated_at=?,revision=revision+1 WHERE id=? AND status IN ('pending_payment','in_review') AND revision=?").bind(staff.sub,time(),om[1],rev));await audit(db,staff.sub,'order.rejected',om[1]);return {ok:true};
 }
 if(path==='staff'&&method==='GET')return {items:await rows(db.prepare('SELECT * FROM platform_staff ORDER BY created_at'))};
 if(path==='staff'&&method==='PUT'){
  const d=await input(request,['access_sub','role','active']);if(!/^[a-zA-Z0-9_-]{16,128}$/.test(d.access_sub)||!['owner','publisher','uploader'].includes(d.role)||![0,1].includes(d.active))deny(400,'invalid_staff');
  // A single atomic statement prevents concurrent removal of the last owner.
  const result=await db.prepare(`INSERT INTO platform_staff VALUES (?,?,?,?,?) ON CONFLICT(access_sub) DO UPDATE SET role=excluded.role,active=excluded.active,updated_at=excluded.updated_at
   WHERE platform_staff.role!='owner' OR platform_staff.active=0 OR (excluded.role='owner' AND excluded.active=1) OR (SELECT COUNT(*) FROM platform_staff WHERE role='owner' AND active=1)>1`).bind(d.access_sub,d.role,d.active,time(),time()).run();
  if(!result.meta.changes)deny(409,'last_owner_required');await audit(db,staff.sub,'staff.updated',d.access_sub);return {ok:true};
 }
 deny(404,'not_found');
}
