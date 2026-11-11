import {deny,time,rows,decode,videoAccess,courseAccess} from './platform-data.mjs';
import {input} from './platform-http.mjs';
import {publicEnabled,automaticEnabled,products,item,participant,amount,dates,operation} from './sales-core.mjs';
import {createTributePayment} from './sales-tribute.mjs';
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
