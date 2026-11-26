import {selectedPaymentProvider,paymentProviderSettings} from './payment-provider.mjs';
import {gpCheckoutReady,gpPublicProduct} from './getplatinum-checkout.mjs';
import {temporarySite,newPurchasesAllowed} from './site-display-mode.mjs';
import {publicDigitalSettings,digitalPublicOpen} from './digital-public-sales.mjs';
import {time,rows,activeGrantSQL} from './platform-data.mjs';
import {publicEnabled,automaticEnabled,dates} from './sales-core.mjs';
import {tributeRequest} from './sales-tribute.mjs';
import {digitalProductRequest} from './digital-product-api.mjs';
export async function mediaAvailability(env,viewer){
 if(await temporarySite(env))return {site_mode:'services',public_sales_enabled:false,public_sales_paused:true,items:[]};
 const buyingAllowed=await newPurchasesAllowed(env);
 const db=env.MEDIA_DB,now=time(),available=await rows(db.prepare(`SELECT v.id,v.access,v.price_minor,v.currency,(v.source_type='youtube' OR (v.source_type='bunny' AND v.bunny_status=4)) AS playable,${viewer?`EXISTS(SELECT 1 FROM viewer_grants g WHERE ${activeGrantSQL} AND (g.video_id=v.id OR EXISTS(SELECT 1 FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.course_id=g.course_id AND l.video_id=v.id AND l.state='published' AND c.state IN ('published','archived'))))`:'0'} AS has_access FROM videos v WHERE NOT EXISTS(SELECT 1 FROM video_archives va WHERE va.video_id=v.id) AND v.state='published' AND v.publish_at<=? LIMIT 200`).bind(...(viewer?[viewer.id,now,now]:[]),new Date().toISOString()));
 if(await selectedPaymentProvider(db)==='getplatinum'){
  const ready=await gpCheckoutReady(env),settings=await paymentProviderSettings(db);let organizationReady=false;
  if(ready&&settings.gp_vat)try{const org=await (await import('./getplatinum-api.mjs')).gpOrganization(env);organizationReady=org.isActive&&org.allowedVats.includes(settings.gp_vat)}catch{}
  const items=[];for(const {playable,...v} of available){let terms=false;if(organizationReady&&v.access==='paid'&&!v.has_access)try{await gpPublicProduct(db,v.id,env);terms=true}catch{}
   let blocked=false;if(viewer)blocked=!!await db.prepare("SELECT 1 FROM access_blocks b WHERE viewer_id=? AND ((kind='video' AND product_id=?) OR (kind='course' AND EXISTS(SELECT 1 FROM platform_lessons WHERE course_id=b.product_id AND video_id=?)))").bind(viewer.id,v.id,v.id).first();
   items.push({...v,provider:'getplatinum',has_access:v.access==='free'||!!v.has_access&&!blocked,can_buy:!blocked&&!v.has_access&&v.access==='paid'&&!!playable&&terms});}
  if(!await gpCheckoutReady(env))for(const item of items)item.can_buy=false;
  return {public_sales_enabled:ready,public_sales_paused:!ready,items};
 }
 const publicState=await publicDigitalSettings(db),publicOpen=buyingAllowed&&digitalPublicOpen(env,publicState);
 let sales=[],paymentReady=buyingAllowed&&publicState?.enabled===1&&env.MEDIA_PAID_ENABLED==='true'&&publicEnabled(env)&&automaticEnabled(env)&&/^[1-9]\d*$/.test(env.TRIBUTE_SHOP_ID||'')&&!!env.TRIBUTE_API_KEY;
 // Reuse the existing read-only shop method; flags alone do not prove readiness.
 // With automatic payments disabled this never contacts Tribute.
 if(paymentReady){try{const shops=await tributeRequest(env,'/shops');paymentReady=Array.isArray(shops)&&shops.some(s=>s.id===Number(env.TRIBUTE_SHOP_ID)&&s.status===1&&s.onlyStars===false)}catch{paymentReady=false}}
 if(paymentReady)sales=await rows(db.prepare("SELECT product_id,policy FROM sales_products WHERE kind='video' AND sale_enabled=1"));
 const digitalReady=new Set();
 if(publicOpen)try{
  const mappings=await rows(db.prepare('SELECT * FROM digital_product_mappings WHERE active=1'));
  if(mappings.length){const remote=await digitalProductRequest(env,'/products?type=digital&size=100&page=1'),items=Array.isArray(remote.rows)?remote.rows:[];for(const m of mappings){const p=items.find(p=>p.id===m.product_id);if(p?.type==='digital'&&p.status==='approved'&&p.currency?.toUpperCase()==='RUB'&&p.amount===m.amount_minor&&p.webLink===m.payment_url&&available.some(v=>v.id===m.video_id&&v.currency==='RUB'&&v.price_minor===m.amount_minor))digitalReady.add(m.video_id)}}
 }catch{} // Provider errors fail closed; no unusable buy button.
 const latest=await publicDigitalSettings(db),allowedNow=await newPurchasesAllowed(env);if(!allowedNow||latest?.enabled!==1||latest.revision!==publicState?.revision){digitalReady.clear();paymentReady=false}
 const blocked=viewer?new Set((await rows(db.prepare("SELECT product_id FROM access_blocks WHERE viewer_id=? AND kind='video'").bind(viewer.id))).map(b=>b.product_id)):new Set();
 return {public_sales_enabled:allowedNow&&digitalPublicOpen(env,latest),public_sales_paused:!allowedNow||latest?.enabled!==1,items:available.map(({playable,...v})=>({...v,has_access:v.access==='free'||!!v.has_access&&!blocked.has(v.id),can_buy:!blocked.has(v.id)&&v.access==='paid'&&!v.has_access&&v.price_minor>0&&!!playable&&(digitalReady.has(v.id)||paymentReady&&sales.some(s=>{if(s.product_id!==v.id)return false;try{dates(s.policy);return true}catch{return false}}))}))};
}
