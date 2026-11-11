import {HttpError,verifyRequestAccess} from './auth.mjs';
export const time=()=>Math.floor(Date.now()/1000);
export const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const deny=(status,code)=>{throw new HttpError(status,code)};
export const rows=async statement=>(await statement.all()).results;
export const localized=value=>{try{const v=JSON.parse(value);return {ru:v.ru||'',en:v.en||''}}catch{return {ru:'',en:''}}};
export const decode=row=>({...row,title:localized(row.title),description:row.description===undefined?undefined:localized(row.description)});
export async function staffIdentity(request,env){
 if(!env.MEDIA_ACCESS_ISSUER||!env.MEDIA_ACCESS_AUD)deny(503,'staff_identity_not_configured');
 const claims=await verifyRequestAccess(request,env);
 const staff=await env.MEDIA_DB.prepare('SELECT access_sub,role FROM platform_staff WHERE access_sub=? AND active=1').bind(claims.sub).first();
 if(!staff||!['owner','publisher','uploader'].includes(staff.role))deny(403,'staff_required');
 return {sub:staff.access_sub,role:staff.role};
}
export function requireOwner(staff){if(staff.role!=='owner')deny(403,'owner_required')}
export function canEditVideo(staff,video){if(staff.role==='uploader'&&(video.created_by!==staff.sub||video.state!=='draft'))deny(403,'draft_owner_required')}
export async function audit(db,actor,action,target){await db.prepare('INSERT INTO platform_audit VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,time()).run()}
export const activeGrantSQL=`g.viewer_id=? AND g.revoked_at IS NULL AND g.starts_at<=? AND g.expires_at>?
 AND (g.source_order_id IS NULL OR EXISTS(SELECT 1 FROM viewer_orders o WHERE o.id=g.source_order_id AND o.viewer_id=g.viewer_id AND o.status='paid' AND o.course_id IS g.course_id AND o.video_id IS g.video_id))`;
export async function courseAccess(db,viewerId,courseId){
 return db.prepare(`SELECT MAX(g.expires_at) AS expires_at FROM viewer_grants g WHERE ${activeGrantSQL} AND g.course_id=?`).bind(viewerId,time(),time(),courseId).first();
}
export async function videoAccess(db,viewerId,videoId){
 return db.prepare(`SELECT MAX(g.expires_at) AS expires_at FROM viewer_grants g WHERE ${activeGrantSQL}
 AND (g.video_id=? OR EXISTS(SELECT 1 FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id
 WHERE l.course_id=g.course_id AND l.video_id=? AND l.state='published' AND c.state IN ('published','archived')))`).bind(viewerId,time(),time(),videoId,videoId).first();
}
export async function viewerLibrary(db,viewerId,salesEnabled=false){
 const courses=await rows(db.prepare(`SELECT c.*,MAX(g.expires_at) AS expires_at FROM platform_courses c JOIN viewer_grants g ON g.course_id=c.id
 WHERE ${activeGrantSQL} AND c.state IN ('published','archived') GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 200`).bind(viewerId,time(),time()));
 const videos=await rows(db.prepare(`SELECT v.id,v.title,v.description,v.category,v.year,v.access,MAX(g.expires_at) AS expires_at FROM videos v JOIN viewer_grants g
 ON g.video_id=v.id OR EXISTS(SELECT 1 FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.course_id=g.course_id AND l.video_id=v.id AND l.state='published' AND c.state IN ('published','archived'))
 WHERE ${activeGrantSQL} AND v.state='published' AND v.publish_at<=? GROUP BY v.id ORDER BY v.publish_at DESC LIMIT 200`).bind(viewerId,time(),time(),new Date().toISOString()));
 const purchases=await rows(db.prepare('SELECT id,course_id,video_id,title,amount_minor,currency,status,revision,created_at,access_expires_at FROM viewer_orders WHERE viewer_id=?'+(salesEnabled?' AND NOT EXISTS(SELECT 1 FROM sales_orders WHERE order_id=viewer_orders.id)':'')+' ORDER BY created_at DESC LIMIT 200').bind(viewerId));
 const progress=await rows(db.prepare(`SELECT p.*,l.title,l.course_id FROM platform_progress p JOIN platform_lessons l ON l.id=p.lesson_id JOIN platform_courses c ON c.id=l.course_id
 WHERE p.viewer_id=? AND l.state='published' AND c.state IN ('published','archived') AND ((c.access='free' AND c.state='published') OR EXISTS(SELECT 1 FROM viewer_grants g WHERE ${activeGrantSQL} AND g.course_id=c.id))
 ORDER BY p.updated_at DESC LIMIT 6`).bind(viewerId,viewerId,time(),time()));
 return {courses:courses.map(decode),videos:videos.map(decode),purchases:purchases.map(decode),continueLearning:progress.map(decode)};
}
