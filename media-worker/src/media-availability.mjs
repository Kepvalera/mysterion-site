import {time,rows,activeGrantSQL} from './platform-data.mjs';
import {publicEnabled,automaticEnabled,dates} from './sales-core.mjs';
import {tributeRequest} from './sales-tribute.mjs';
import {digitalProductRequest} from './digital-product-api.mjs';
export async function mediaAvailability(env,viewer){
 const db=env.MEDIA_DB,now=time(),available=await rows(db.prepare(`SELECT v.id,v.access,v.price_minor,v.currency,(v.source_type='youtube' OR (v.source_type='bunny' AND v.bunny_status=4)) AS playable,${viewer?`EXISTS(SELECT 1 FROM viewer_grants g WHERE ${activeGrantSQL} AND (g.video_id=v.id OR EXISTS(SELECT 1 FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.course_id=g.course_id AND l.video_id=v.id AND l.state='published' AND c.state IN ('published','archived'))))`:'0'} AS has_access FROM videos v WHERE v.state='published' AND v.publish_at<=? LIMIT 200`).bind(...(viewer?[viewer.id,now,now]:[]),new Date().toISOString()));
 let sales=[],paymentReady=env.MEDIA_PAID_ENABLED==='true'&&publicEnabled(env)&&automaticEnabled(env)&&/^[1-9]\d*$/.test(env.TRIBUTE_SHOP_ID||'')&&!!env.TRIBUTE_API_KEY;
 // Reuse the existing read-only shop method; flags alone do not prove readiness.
 // With automatic payments disabled this never contacts Tribute.
 if(paymentReady){try{const shops=await tributeRequest(env,'/shops');paymentReady=Array.isArray(shops)&&shops.some(s=>s.id===Number(env.TRIBUTE_SHOP_ID)&&s.status===1&&s.onlyStars===false)}catch{paymentReady=false}}
 if(paymentReady)sales=await rows(db.prepare("SELECT product_id,policy FROM sales_products WHERE kind='video' AND sale_enabled=1"));
 const digitalReady=new Set();
 if(env.MEDIA_PAID_ENABLED==='true'&&publicEnabled(env)&&env.TRIBUTE_DIGITAL_LIVE_ENABLED==='true'){
  const settings=await db.prepare('SELECT mode FROM digital_integration_settings WHERE id=1').first();
  if(settings?.mode==='live')try{
   const mappings=await rows(db.prepare("SELECT m.* FROM digital_product_mappings m JOIN sales_products s ON s.kind='video' AND s.product_id=m.video_id AND s.sale_enabled=1 WHERE m.active=1"));
   if(mappings.length){const remote=await digitalProductRequest(env,'/products?type=digital&size=100&page=1'),items=Array.isArray(remote.rows)?remote.rows:[];for(const m of mappings){const p=items.find(p=>p.id===m.product_id);if(p?.type==='digital'&&p.status==='approved'&&p.currency?.toUpperCase()==='RUB'&&p.amount===m.amount_minor&&p.webLink===m.payment_url&&available.some(v=>v.id===m.video_id&&v.currency==='RUB'&&v.price_minor===m.amount_minor))digitalReady.add(m.video_id)}}
  }catch{} // Provider errors never expose a purchase button that cannot work.
 }
 const blocked=viewer?new Set((await rows(db.prepare("SELECT product_id FROM access_blocks WHERE viewer_id=? AND kind='video'").bind(viewer.id))).map(b=>b.product_id)):new Set();
 return {items:available.map(({playable,...v})=>({...v,has_access:v.access==='free'||!!v.has_access&&!blocked.has(v.id),can_buy:!blocked.has(v.id)&&v.access==='paid'&&!v.has_access&&v.price_minor>0&&!!playable&&(digitalReady.has(v.id)||paymentReady&&sales.some(s=>{if(s.product_id!==v.id)return false;try{dates(s.policy);return true}catch{return false}}))}))};
}
