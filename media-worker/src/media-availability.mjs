import {time,rows,activeGrantSQL} from './platform-data.mjs';
import {publicEnabled,automaticEnabled,dates} from './sales-core.mjs';
import {tributeRequest} from './sales-tribute.mjs';
export async function mediaAvailability(env,viewer){
 const db=env.MEDIA_DB,now=time(),available=await rows(db.prepare(`SELECT v.id,v.access,v.price_minor,v.currency,(v.source_type='youtube' OR (v.source_type='bunny' AND v.bunny_status=4)) AS playable,${viewer?`EXISTS(SELECT 1 FROM viewer_grants g WHERE ${activeGrantSQL} AND (g.video_id=v.id OR EXISTS(SELECT 1 FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.course_id=g.course_id AND l.video_id=v.id AND l.state='published' AND c.state IN ('published','archived'))))`:'0'} AS has_access FROM videos v WHERE v.state='published' AND v.publish_at<=? LIMIT 200`).bind(...(viewer?[viewer.id,now,now]:[]),new Date().toISOString()));
 let sales=[],paymentReady=env.MEDIA_PAID_ENABLED==='true'&&publicEnabled(env)&&automaticEnabled(env)&&/^[1-9]\d*$/.test(env.TRIBUTE_SHOP_ID||'')&&!!env.TRIBUTE_API_KEY;
 // Reuse the existing read-only shop method; flags alone do not prove readiness.
 // With automatic payments disabled this never contacts Tribute.
 if(paymentReady){try{const shops=await tributeRequest(env,'/shops');paymentReady=Array.isArray(shops)&&shops.some(s=>s.id===Number(env.TRIBUTE_SHOP_ID)&&s.status===1&&s.onlyStars===false)}catch{paymentReady=false}}
 if(paymentReady)sales=await rows(db.prepare("SELECT product_id,policy FROM sales_products WHERE kind='video' AND sale_enabled=1"));
 return {items:available.map(({playable,...v})=>({...v,has_access:v.access==='free'||!!v.has_access,can_buy:v.access==='paid'&&!v.has_access&&v.price_minor>0&&!!playable&&paymentReady&&sales.some(s=>{if(s.product_id!==v.id)return false;try{dates(s.policy);return true}catch{return false}})}))};
}
