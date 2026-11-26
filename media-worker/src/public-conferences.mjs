import {rows,decode,courseAccess,deny} from './platform-data.mjs';
import {gpCheckoutReady,gpCoursePublicProduct} from './getplatinum-checkout.mjs';
export async function publicConferences(env,viewer,id){
 const db=env.MEDIA_DB,items=[];const found=await rows(db.prepare(`SELECT c.*,(SELECT COUNT(*) FROM course_covers x WHERE x.course_id=c.id) AS has_cover,(SELECT policy FROM sales_products s WHERE s.kind='course' AND s.product_id=c.id) AS policy FROM platform_courses c WHERE c.kind='conference' AND c.access='paid' AND c.state='published' ${id?'AND c.id=?':''} ORDER BY c.updated_at DESC`).bind(...(id?[id]:[])));
 const ready=await gpCheckoutReady(env);
 for(const row of found){const lessons=await rows(db.prepare("SELECT l.id,l.title,l.description,l.position FROM platform_lessons l JOIN videos v ON v.id=l.video_id WHERE l.course_id=? AND l.state='published' AND v.state='published' AND (v.source_type!='bunny' OR v.bunny_status=4) ORDER BY l.position,l.id").bind(row.id));if(!lessons.length)continue;
  let policy;try{policy=JSON.parse(row.policy)}catch{policy=null}const access=viewer?await courseAccess(db,viewer.id,row.id):null;let canBuy=false;if(ready&&!access?.expires_at)try{await gpCoursePublicProduct(db,row.id);canBuy=true}catch{}
  const blocked=viewer?await db.prepare("SELECT 1 FROM access_blocks WHERE viewer_id=? AND kind='course' AND product_id=?").bind(viewer.id,row.id).first():false;
  items.push({id:row.id,title:decode(row).title,description:decode(row).description,price_minor:row.price_minor,currency:row.currency,has_cover:!!row.has_cover,policy,lessons:lessons.map(decode),has_access:!!access?.expires_at,can_buy:canBuy&&!blocked,provider:'getplatinum'});
 }if(id){if(!items.length)deny(404,'conference_not_found');return items[0]}return {items};
}
