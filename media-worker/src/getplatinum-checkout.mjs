import {boundVideo} from './bunny.mjs';
import {youtubeId} from './video-source.mjs';
import {deny,decode,time,videoAccess,courseAccess} from './platform-data.mjs';
import {controlAllowed,controlSettings,controlVideoId} from './getplatinum-control.mjs';
import {input} from './platform-http.mjs';
import {uuid,amount,dates,operation,participant} from './sales-core.mjs';
export async function gpPublicSiteAllowed(env){if(env.SALES_PUBLIC_ENABLED!=='true')return false;const s=await env.MEDIA_DB.prepare('SELECT mode,purchases_paused FROM site_display_settings WHERE id=1').first();return !!(s&&['main','services'].includes(s.mode)&&s.purchases_paused===0)}
import {paymentProviderSettings} from './payment-provider.mjs';
import {gpLiveReady,gpRequest,gpOrganization,gpPaymentURL} from './getplatinum-api.mjs';
export async function gpCheckoutReady(env){const settings=await paymentProviderSettings(env.MEDIA_DB),sales=await env.MEDIA_DB.prepare('SELECT enabled FROM digital_public_sales WHERE id=1').first();return !!(gpLiveReady(env)&&settings?.gp_enabled===1&&settings.active_provider==='getplatinum'&&sales?.enabled===1&&await gpPublicSiteAllowed(env))}
export async function gpProduct(db,id){
 uuid(id);const v=await db.prepare("SELECT * FROM videos WHERE NOT EXISTS(SELECT 1 FROM video_archives va WHERE va.video_id=videos.id) AND id=? AND state='published' AND access='paid' AND publish_at<=?").bind(id,new Date().toISOString()).first();
 if(!v||v.currency!=='RUB'||!['youtube','bunny'].includes(v.source_type)||v.source_type==='bunny'&&v.bunny_status!==4)deny(409,'gp_video_unavailable');amount(v.price_minor);
 const mappings=(await db.prepare('SELECT DISTINCT days FROM digital_product_mappings WHERE video_id=? AND active=1').bind(id).all()).results,s=await db.prepare("SELECT * FROM sales_products WHERE kind='video' AND product_id=? AND sale_enabled=1").bind(id).first();
 let policy;if(mappings.length===1)policy={mode:'days',days:mappings[0].days};else if(mappings.length>1)deny(409,'gp_access_terms_conflict');else if(s){try{policy=JSON.parse(s.policy)}catch{deny(409,'gp_access_terms_missing')}}else deny(409,'gp_access_terms_missing');
 dates(policy);return {...v,policy};
}
export async function gpPublicProduct(db,id,env){
 uuid(id);if(await db.prepare("SELECT 1 FROM platform_lessons l JOIN platform_courses c ON c.id=l.course_id WHERE l.video_id=? AND NOT EXISTS(SELECT 1 FROM sales_products s WHERE s.kind='video' AND s.product_id=? AND s.sale_enabled=1)").bind(id,id).first())deny(409,'gp_conference_bundle_required');const p=await gpProduct(db,id);if(!await db.prepare("SELECT 1 FROM sales_products WHERE kind='video' AND product_id=? AND sale_enabled=1").bind(id).first())deny(409,'gp_product_sale_disabled');
 if(await db.prepare("SELECT 1 FROM videos WHERE id!=? AND access='free' AND state!='deleted' AND source_type=? AND lower(source_ref)=lower(?) AND bunny_library_id IS ?").bind(id,p.source_type,p.source_ref,p.bunny_library_id).first())deny(409,'gp_duplicate_free_source');if(p.source_type==='youtube')youtubeId(p.source_ref);if(env&&p.source_type==='bunny')boundVideo(env,p);return p;
}
export async function gpCoursePublicProduct(db,id){
 uuid(id);const c=await db.prepare("SELECT * FROM platform_courses WHERE id=? AND state='published' AND access='paid'").bind(id).first();
 if(!c||c.currency!=='RUB')deny(409,'gp_conference_unavailable');
 amount(c.price_minor);const s=await db.prepare("SELECT * FROM sales_products WHERE kind='course' AND product_id=? AND sale_enabled=1").bind(id).first();if(!s)deny(409,'gp_product_sale_disabled');
 let policy;try{policy=JSON.parse(s.policy)}catch{deny(409,'gp_access_terms_missing')}if(policy.mode!=='days'||!Number.isInteger(policy.days)||policy.days<1)deny(409,'gp_access_terms_missing');
 const count=(await db.prepare("SELECT COUNT(*) AS n FROM platform_lessons l JOIN videos v ON v.id=l.video_id WHERE l.course_id=? AND l.state='published' AND v.state='published' AND (v.source_type!='bunny' OR v.bunny_status=4)").bind(id).first())?.n||0;if(count<1)deny(409,'gp_conference_empty');
 dates(policy);return {...c,policy};
}
export async function gpCourseOffer(env,viewer,id){
 if((await courseAccess(env.MEDIA_DB,viewer.id,id))?.expires_at)return {available:false,has_access:true};
 if(!await gpCheckoutReady(env))return {available:false,reason:'gp_checkout_disabled'};
 const p=await gpCoursePublicProduct(env.MEDIA_DB,id),s=await paymentProviderSettings(env.MEDIA_DB);if(!s.gp_vat)deny(409,'gp_vat_required');
 const blocked=await env.MEDIA_DB.prepare("SELECT 1 FROM access_blocks WHERE viewer_id=? AND kind='course' AND product_id=?").bind(viewer.id,id).first();if(blocked)deny(403,'access_restricted');
 const a=await env.MEDIA_DB.prepare('SELECT email,telegram_only,email_verified_at FROM viewer_accounts WHERE id=?').bind(viewer.id).first();
 return {provider:'getplatinum',available:true,kind:'course',course_id:id,title:decode(p).title,amount_minor:p.price_minor,currency:'RUB',policy:p.policy,receipt_email:a?.telegram_only!==1&&a?.email_verified_at?a.email:'',receipt_contact_required:true};
}
export async function gpOffer(env,viewer,id){
 if((await videoAccess(env.MEDIA_DB,viewer.id,id))?.expires_at)return {available:false,has_access:true};
 if(!await gpCheckoutReady(env))return {available:false,reason:'gp_checkout_disabled'};
 const p=await gpPublicProduct(env.MEDIA_DB,id,env),blocked=await env.MEDIA_DB.prepare("SELECT 1 FROM access_blocks b WHERE viewer_id=? AND ((kind='video' AND product_id=?) OR (kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=?)))").bind(viewer.id,id,id).first();if(blocked)deny(403,'access_restricted');
 const s=await paymentProviderSettings(env.MEDIA_DB);if(!s.gp_vat)deny(409,'gp_vat_required');const a=await env.MEDIA_DB.prepare('SELECT email,telegram_only,email_verified_at FROM viewer_accounts WHERE id=?').bind(viewer.id).first();
 return {provider:'getplatinum',available:true,video_id:id,title:decode(p).title,amount_minor:p.price_minor,currency:'RUB',policy:p.policy,receipt_email:a?.telegram_only!==1&&a?.email_verified_at?a.email:'',receipt_contact_required:true};
}
export async function gpOrder(db,id){uuid(id);const o=await db.prepare('SELECT o.*,g.policy,g.stage,g.payment_url,g.md_order,g.paid_at,g.reason,g.video_revision,g.vat,g.provider_revision FROM viewer_orders o JOIN getplatinum_orders g ON g.order_id=o.id WHERE o.id=?').bind(id).first();if(!o)deny(404,'gp_order_not_found');return o}
export async function gpCheckout(request,env,viewer,controlled=false){
 if(controlled?!await controlAllowed(env,viewer.id):!await gpCheckoutReady(env))deny(503,controlled?'gp_control_closed':'gp_checkout_disabled');if(controlled)await participant(env.MEDIA_DB,viewer.id); const d=await input(request,['request_id','kind','id','receipt_email','receipt_phone']);uuid(d.request_id);uuid(d.id);
 if(d.kind!==undefined&&d.kind!==null&&d.kind!=='video'&&d.kind!=='course')deny(400,'invalid_product_kind');
 const kind=d.kind||'video';
 const p=kind==='course'?(await gpCoursePublicProduct(env.MEDIA_DB,d.id)):(await (controlled?gpProduct:gpPublicProduct)(env.MEDIA_DB,d.id,env));
 if(controlled&&kind==='video'&&(p.id!==controlVideoId||p.price_minor!==10000||p.currency!=='RUB'||p.policy.mode!=='days'||p.policy.days!==60))deny(409,'gp_control_product_changed');
 if(kind==='course'?!!(await courseAccess(env.MEDIA_DB,viewer.id,d.id))?.expires_at:!!(await videoAccess(env.MEDIA_DB,viewer.id,d.id))?.expires_at)deny(409,'access_already_available');
 if(!controlled)kind==='course'?await gpCourseOffer(env,viewer,d.id):await gpOffer(env,viewer,d.id);else if(await env.MEDIA_DB.prepare("SELECT 1 FROM access_blocks b WHERE viewer_id=? AND ((kind='video' AND product_id=?) OR (kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=?)))").bind(viewer.id,p.id,p.id).first())deny(403,'access_restricted');
 const a=await env.MEDIA_DB.prepare('SELECT email,telegram_only,email_verified_at FROM viewer_accounts WHERE id=?').bind(viewer.id).first(),email=d.receipt_email??(a.telegram_only!==1&&a.email_verified_at?a.email:''),phone=d.receipt_phone??'';
 if(typeof email!=='string'||typeof phone!=='string'||email.length>254||phone.length>20||email&&!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)||phone&&!/^\+\d{7,15}$/.test(phone))deny(400,'gp_receipt_contact_invalid');if(!email&&!phone)deny(400,'gp_receipt_contact_required');
 const control=controlled?await controlSettings(env.MEDIA_DB):null,settings=controlled?{gp_vat:'none',revision:control.revision}:await paymentProviderSettings(env.MEDIA_DB),id=crypto.randomUUID(),now=time();let saved;
 try{saved=await operation(env.MEDIA_DB,viewer.id,controlled?'gp.control.checkout':'gp.checkout',d.id,d,{id},q=>[
  kind==='course'
   ?q("INSERT INTO viewer_orders(id,viewer_id,course_id,title,amount_minor,currency,status,created_at,updated_at) SELECT ?,?,?,?,?,'RUB','pending_payment',?,? WHERE $guard",[id,viewer.id,p.id,p.title,p.price_minor,now,now])
   :q("INSERT INTO viewer_orders(id,viewer_id,video_id,title,amount_minor,currency,status,created_at,updated_at) SELECT ?,?,?,?,?,'RUB','pending_payment',?,? WHERE $guard",[id,viewer.id,p.id,p.title,p.price_minor,now,now]),
  q('INSERT INTO getplatinum_orders(order_id,policy,video_revision,vat,provider_revision) SELECT ?,?,?,?,? WHERE $guard',[id,JSON.stringify(p.policy),p.revision,settings.gp_vat,settings.revision]),
  ...(controlled?[q('UPDATE getplatinum_control SET order_id=?,revision=revision+1,updated_at=? WHERE id=1 AND $guard',[id,now])]:[])
 ],controlled?{sql:"EXISTS(SELECT 1 FROM videos WHERE id=? AND revision=? AND state='published' AND access='paid' AND price_minor=10000 AND currency='RUB') AND EXISTS(SELECT 1 FROM getplatinum_control WHERE id=1 AND viewer_id=? AND enabled=1 AND armed_until>? AND order_id IS NULL AND revision=?)",args:[p.id,p.revision,viewer.id,now,control.revision]}:kind==='course'?{sql:"EXISTS(SELECT 1 FROM platform_courses WHERE id=? AND revision=? AND state='published' AND access='paid' AND currency='RUB') AND EXISTS(SELECT 1 FROM payment_provider_settings WHERE id=1 AND revision=? AND gp_enabled=1 AND active_provider='getplatinum') AND EXISTS(SELECT 1 FROM site_display_settings WHERE id=1 AND mode IN('main','services') AND purchases_paused=0) AND EXISTS(SELECT 1 FROM digital_public_sales WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM sales_products WHERE kind='course' AND product_id=? AND sale_enabled=1)",args:[p.id,p.revision,settings.revision,p.id]}:{sql:"EXISTS(SELECT 1 FROM videos WHERE id=? AND revision=? AND state='published') AND EXISTS(SELECT 1 FROM payment_provider_settings WHERE id=1 AND revision=? AND gp_enabled=1 AND active_provider='getplatinum') AND EXISTS(SELECT 1 FROM site_display_settings WHERE id=1 AND mode IN('main','services') AND purchases_paused=0) AND EXISTS(SELECT 1 FROM digital_public_sales WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM sales_products WHERE kind='video' AND product_id=? AND sale_enabled=1)",args:[p.id,p.revision,settings.revision,p.id]})}catch(e){if(e.status)throw e;if(await env.MEDIA_DB.prepare(kind==='course'?"SELECT 1 FROM viewer_orders WHERE viewer_id=? AND course_id=? AND status IN('pending_payment','in_review')":"SELECT 1 FROM viewer_orders WHERE viewer_id=? AND video_id=? AND status IN('pending_payment','in_review')").bind(viewer.id,d.id).first())deny(409,'gp_pending_order_exists');throw e}
 let o=await gpOrder(env.MEDIA_DB,saved.id);if(o.stage!=='new')return {id:o.id,state:o.stage,...(o.stage==='ready'&&(controlled?await controlAllowed(env,viewer.id,o.id):await gpCheckoutReady(env))?{payment_url:o.payment_url}:{})};
 const reserved=await env.MEDIA_DB.prepare("UPDATE getplatinum_orders SET stage='creating',revision=revision+1 WHERE order_id=? AND stage='new'").bind(o.id).run();if(!reserved.meta.changes)return {id:o.id,state:'creating'};
 try{
  const org=await gpOrganization(env);if(!org.isActive||!org.allowedVats.includes(o.vat))deny(409,'gp_organization_or_vat_unavailable');if(controlled?!await controlAllowed(env,viewer.id,o.id):!await gpCheckoutReady(env))deny(503,'gp_checkout_disabled');
  const title=decode(o).title,titleText=(title.ru||title.en||'').replace(/<[^>]*>/g,'').trim();if(titleText.replace(/\s/g,'').length<5)deny(409,'gp_receipt_name_invalid');const origin=env.MEDIA_PUBLIC_ORIGIN;
  const result=await gpRequest(env,'/init-payment-url',{dealId:o.id,amount:o.amount_minor,currency:o.currency,positions:[{prefix:kind==='course'||p.category==='conference'?4:40,name:titleText.slice(0,255),price:o.amount_minor,quantity:1,vat:o.vat}],clientParams:{clientId:viewer.id,...(email?{email}:{}),...(phone?{phone}:{})},notificationUrl:origin+'/api/getplatinum/webhook',successUrl:origin+'/viewer-account.html?gp_order='+o.id+'&gp_result=success',failUrl:origin+'/viewer-account.html?gp_order='+o.id+'&gp_result=failed'});
  if(result.dealId!==o.id)deny(502,'gp_deal_id_mismatch');const url=gpPaymentURL(env,result.formUrl);await env.MEDIA_DB.prepare("UPDATE getplatinum_orders SET stage='ready',payment_url=?,revision=revision+1 WHERE order_id=? AND stage='creating'").bind(url,o.id).run();o=await gpOrder(env.MEDIA_DB,o.id);
  return {id:o.id,state:o.stage,...(o.stage==='ready'&&(controlled?await controlAllowed(env,viewer.id,o.id):await gpCheckoutReady(env))?{payment_url:url}:{})};
 }catch(e){const rejected=['gp_api_rejected','gp_organization_or_vat_unavailable','gp_checkout_disabled','gp_receipt_name_invalid'].includes(e.message);await env.MEDIA_DB.batch([env.MEDIA_DB.prepare("UPDATE getplatinum_orders SET stage=?,reason=?,revision=revision+1 WHERE order_id=? AND stage='creating'").bind(rejected?'failed':'uncertain',e.status?e.message:'gp_api_uncertain',o.id),...(rejected?[env.MEDIA_DB.prepare("UPDATE viewer_orders SET status='rejected',updated_at=? WHERE id=? AND status='pending_payment'").bind(time(),o.id)]:[])]);throw e}
}
