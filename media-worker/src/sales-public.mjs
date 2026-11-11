import {deny,time,rows,decode,videoAccess,courseAccess} from './platform-data.mjs';
import {input} from './platform-http.mjs';
import {publicEnabled,automaticEnabled,products,item,participant,amount,dates,operation} from './sales-core.mjs';
import {createTributePayment} from './sales-tribute.mjs';
import {telegramViewer} from './telegram-access.mjs';
import {digitalProductRequest} from './digital-product-api.mjs';
export async function publicSales(env){
 if(!publicEnabled(env))return {enabled:false,items:[]};
 const available=(await products(env.MEDIA_DB)).filter(p=>{
  if(!p.sale_enabled||p.state!=='published'||p.access!=='paid'||p.currency!=='RUB'||p.product_kind==='video'&&(!['bunny','youtube'].includes(p.source_type)||p.source_type==='bunny'&&p.bunny_status!==4||p.publish_at>new Date().toISOString()))return false;
  if(p.kind==='school'&&(p.price_minor!==3000000||p.policy?.mode!=='school'))return false;
  try{dates(p.policy);return true}catch{return false}
 });
 return {enabled:true,tribute:automaticEnabled(env),items:available.map(p=>({id:p.id,kind:p.product_kind,title:decode(p).title,description:decode(p).description,price_minor:p.price_minor,currency:p.currency,policy:p.policy}))};
}
export async function viewerSales(request,env,viewer,path,method){
 const db=env.MEDIA_DB;if(env.SALES_ENABLED!=='true')deny(404,'not_found');
 const digital=path.match(/^digital-offer\/([a-f0-9-]{36})$/);
 if(digital&&method==='GET'){
  const videoId=digital[1];if((await videoAccess(db,viewer.id,videoId))?.expires_at)return {available:false,has_access:true};
  const settings=await db.prepare('SELECT * FROM digital_integration_settings WHERE id=1').first();
  if(!(settings.mode==='test'&&settings.test_viewer_id===viewer.id||settings.mode==='live'&&env.TRIBUTE_DIGITAL_LIVE_ENABLED==='true'&&publicEnabled(env)))return {available:false,reason:'sales_disabled'};
  if(!await db.prepare('SELECT 1 FROM telegram_account_links WHERE viewer_id=?').bind(viewer.id).first())return {available:false,reason:'telegram_required'};
  if(await db.prepare("SELECT 1 FROM access_blocks b WHERE b.viewer_id=? AND ((b.kind='video' AND b.product_id=?) OR (b.kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=?)))").bind(viewer.id,videoId,videoId).first())return {available:false,reason:'access_restricted'};
  const p=await db.prepare("SELECT m.*,v.state,v.price_minor,v.currency AS video_currency,v.source_type,v.bunny_status,v.publish_at FROM digital_product_mappings m JOIN videos v ON v.id=m.video_id WHERE m.video_id=? AND m.active=1 ORDER BY m.product_id LIMIT 1").bind(videoId).first();
  if(!p||p.state!=='published'||p.currency!=='RUB'||p.video_currency!=='RUB'||p.amount_minor!==p.price_minor||!['bunny','youtube'].includes(p.source_type)||p.source_type==='bunny'&&p.bunny_status!==4||p.publish_at>new Date().toISOString())return {available:false,reason:'product_unavailable'};
  const remote=await digitalProductRequest(env,'/products/'+p.product_id);
  if(remote.id!==p.product_id||remote.status!=='approved'||remote.type!=='digital'||remote.amount!==p.amount_minor||remote.currency?.toUpperCase()!=='RUB'||remote.webLink!==p.payment_url)return {available:false,reason:'product_changed'};
  return {available:true,payment_url:p.payment_url,amount_minor:p.amount_minor,currency:'RUB'};
 }
 if(path==='telegram'||path.startsWith('telegram/'))return telegramViewer(request,env,viewer,path);
 if(path==='history'&&method==='GET')return {orders:(await rows(db.prepare('SELECT o.id,o.title,o.amount_minor,o.currency,o.created_at,o.access_expires_at,s.state,s.source,s.last_payment_status,s.payment_url FROM viewer_orders o JOIN sales_orders s ON s.order_id=o.id WHERE o.viewer_id=? ORDER BY o.created_at DESC LIMIT 200').bind(viewer.id))).map(decode)};
 if(path==='checkout'&&method==='POST'){
  if(!publicEnabled(env))deny(503,'public_sales_disabled');const d=await input(request,['request_id','kind','id','method']);if(!['manual','tribute'].includes(d.method))deny(400,'invalid_payment_method');if(d.method==='tribute'&&!automaticEnabled(env))deny(503,'automatic_payments_disabled');
  await participant(db,viewer.id);const p=await item(db,d.kind,d.id),s=await db.prepare('SELECT * FROM sales_products WHERE kind=? AND product_id=? AND sale_enabled=1').bind(d.kind,p.id).first();
  if(!s||p.state!=='published'||p.access!=='paid'||p.currency!=='RUB'||env.MEDIA_PAID_ENABLED!=='true'||d.kind==='video'&&(p.source_type==='bunny'&&p.bunny_status!==4||!['bunny','youtube'].includes(p.source_type)||p.publish_at>new Date().toISOString()))deny(400,'not_for_sale');amount(p.price_minor);dates(s.policy);
  if(p.kind==='school'&&(p.price_minor!==3000000||JSON.parse(s.policy).mode!=='school'))deny(400,'school_terms_required');
  const oldOperation=await db.prepare('SELECT 1 FROM sales_operations WHERE id=? AND actor=?').bind(d.request_id,viewer.id).first();
  if(!oldOperation&&(await (d.kind==='video'?videoAccess:courseAccess)(db,viewer.id,p.id))?.expires_at)deny(409,'access_already_available');
  const id=crypto.randomUUID(),created=await operation(db,viewer.id,'checkout',p.id,d,{id},q=>[
   q(`INSERT INTO viewer_orders(id,viewer_id,${p.column},title,amount_minor,currency,status,created_at,updated_at) SELECT ?,?,?,?,?,'RUB','pending_payment',?,? WHERE $guard`,[id,viewer.id,p.id,p.title,p.price_minor,time(),time()]),
   q('INSERT INTO sales_orders(order_id,source,state,policy) SELECT ?,?,\'pending\',? WHERE $guard',[id,d.method,s.policy])
  ],{sql:`NOT EXISTS(SELECT 1 FROM viewer_orders WHERE viewer_id=? AND ${p.column}=? AND status IN ('pending_payment','in_review')) AND EXISTS(SELECT 1 FROM ${p.table} WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM sales_products WHERE kind=? AND product_id=? AND revision=? AND sale_enabled=1)`,args:[viewer.id,p.id,p.id,p.revision,d.kind,p.id,s.revision]});
  if(d.method==='tribute')return createTributePayment(env,created.id,viewer,new URL(request.url).origin);return {...created,state:'pending'};
 }
 deny(404,'not_found');
}
