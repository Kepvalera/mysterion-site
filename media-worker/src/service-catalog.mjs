import {gpCheckoutReady,gpPublicProduct} from './getplatinum-checkout.mjs';
import {decode,videoAccess} from './platform-data.mjs';
import {loadServiceExample,serviceExampleSection} from './service-example.mjs';
export async function serviceCatalog(env,viewer=null){
 const db=env.MEDIA_DB,ids=(await db.prepare("SELECT v.id FROM videos v JOIN sales_products s ON s.product_id=v.id AND s.kind='video' WHERE s.sale_enabled=1 AND v.state='published' AND v.access='paid' ORDER BY v.publish_at DESC LIMIT 200").all()).results,items=[];
 for(const {id}of ids)try{const v=await gpPublicProduct(db,id,env);if(v.policy.mode!=='days')continue;const d=decode(v);items.push({id:v.id,title:d.title,description:d.description,access:'paid',price_minor:v.price_minor,currency:v.currency,access_days:v.policy.days,cover_url:'/api/media/videos/'+v.id+'/cover',sale_enabled:true})}catch{}
 const featured=await loadServiceExample(env);if(featured&&!items.some(v=>v.id===featured.id))items.unshift({...featured,sale_enabled:false});
 const ready=await gpCheckoutReady(env);for(const v of items){v.has_access=!!(viewer&&(await videoAccess(db,viewer.id,v.id))?.expires_at);v.can_buy=ready&&v.sale_enabled&&!v.has_access;if(viewer&&await db.prepare("SELECT 1 FROM access_blocks b WHERE viewer_id=? AND ((kind='video' AND product_id=?) OR (kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=?)))").bind(viewer.id,v.id,v.id).first())v.can_buy=false}
 return {provider:'getplatinum',payment_enabled:ready,items};
}
export function serviceCatalogSections(catalog,lang){
 return '<div id="video-materials">'+(catalog?.items||[]).map(v=>serviceExampleSection(v,lang).replace('id="video-materials"','id="video-'+v.id+'"').replaceAll('service-example-checkout-heading','service-example-checkout-heading-'+v.id)).join('')+'</div>';
}
