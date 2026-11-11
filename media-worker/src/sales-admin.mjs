import {deny,time,rows,decode} from './platform-data.mjs';
import {input,text,revision} from './platform-http.mjs';
import {reconcileTributePayment} from './sales-tribute.mjs';
import {manager,item,policy,amount,participant,operation,dates,createGrant,order,balanceSQL,products,uuid,hash,enabled,publicEnabled,automaticEnabled} from './sales-core.mjs';
export async function salesAdmin(request,env,staff,path,method){
 if(!await manager(env,staff))deny(403,'sales_manager_required');const db=env.MEDIA_DB;
 if(method!=='GET'){
  const d=await input(request.clone(),['request_id','kind','id','revision','policy_revision','access','price_minor','sale_enabled','policy','viewer_id','amount_minor','method','confirm_received','dates','reason','access_sub','active','provider_uuid']);uuid(d.request_id);
  const old=await db.prepare('SELECT * FROM sales_operations WHERE id=?').bind(d.request_id).first();
  if(old){const m=path.match(/^(orders|grants)\/([a-f0-9-]{36})\/(payment|grant|cancel|refund|extend|revoke)$/),action=path==='products'?'product.save':path==='orders'?'order.create':path==='grants'?'access.'+d.reason:path==='managers'?'manager.set':path==='reconcile'?'tribute.reconcile':m?({payment:'payment.received',grant:'access.paid',cancel:'order.cancel',refund:'payment.refunded',extend:'access.extend',revoke:'access.revoke'})[m[3]]:null,target=m?m[2]:path==='managers'?d.access_sub:d.id;if(['managers','reconcile'].includes(path)&&staff.role!=='owner')deny(403,'owner_required');if(old.actor!==staff.sub||old.action!==action||old.target!==target||old.request_hash!==await hash(d))deny(409,'request_conflict');return JSON.parse(old.result)}
 }
 if(path==='reconcile'&&method==='POST'){if(staff.role!=='owner')deny(403,'owner_required');return reconcileTributePayment(env,staff,await input(request,['request_id','id','provider_uuid']))}
 if(path===''&&method==='GET'){
  const raw=new URL(request.url).searchParams.get('page')||'1';if(!/^[1-9][0-9]{0,4}$/.test(raw))deny(400,'invalid_query');const page=Number(raw),offset=(page-1)*50,paged=sql=>rows(db.prepare(sql+' LIMIT 50 OFFSET ?').bind(offset));
  const pagination={page};for(const [name,table] of Object.entries({orders:'sales_orders',payments:'sales_payments',grants:'viewer_grants',history:'sales_operations'}))pagination[name]=Math.max(1,Math.ceil((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n/50));
  return {
  products:(await products(db)).map(decode),
  orders:(await paged('SELECT o.*,s.state,s.source,s.policy AS access_policy,s.provider_stage,s.revision AS sales_revision,s.last_payment_status,a.email FROM sales_orders s JOIN viewer_orders o ON o.id=s.order_id JOIN viewer_accounts a ON a.id=o.viewer_id ORDER BY o.created_at DESC,o.id')).map(decode),
  payments:await paged('SELECT p.*,o.title,a.email FROM sales_payments p JOIN viewer_orders o ON o.id=p.order_id JOIN viewer_accounts a ON a.id=o.viewer_id ORDER BY p.created_at DESC,p.id'),
  grants:await paged('SELECT g.*,a.email,COALESCE(v.title,c.title) AS title FROM viewer_grants g JOIN viewer_accounts a ON a.id=g.viewer_id LEFT JOIN videos v ON v.id=g.video_id LEFT JOIN platform_courses c ON c.id=g.course_id ORDER BY g.created_at DESC,g.id'),
  history:await paged(`SELECT h.action,h.target,h.actor,h.created_at,st.role AS actor_role,COALESCE(o.title,v.title,c.title,gv.title,gc.title) AS title,a.email
   FROM sales_operations h LEFT JOIN platform_staff st ON st.access_sub=h.actor
   LEFT JOIN viewer_orders o ON o.id=h.target OR (h.action IN ('order.create','checkout') AND o.id=json_extract(h.result,'$.id')) LEFT JOIN viewer_grants g ON g.id=h.target OR g.id=json_extract(h.result,'$.id')
   LEFT JOIN videos v ON v.id=h.target LEFT JOIN platform_courses c ON c.id=h.target
   LEFT JOIN videos gv ON gv.id=g.video_id LEFT JOIN platform_courses gc ON gc.id=g.course_id
   LEFT JOIN viewer_accounts a ON a.id=COALESCE(o.viewer_id,g.viewer_id) ORDER BY h.created_at DESC,h.id`),
  pagination,manualEnabled:enabled(env),publicEnabled:publicEnabled(env),automaticEnabled:automaticEnabled(env),canDelegate:staff.role==='owner'
 };
 }
 if(path==='participants'&&method==='GET'){const search=text(new URL(request.url).searchParams.get('q')||'',100).toLowerCase();if(search.length<3)return {items:[]};return {items:await rows(db.prepare("SELECT id,email,first_name,last_name FROM viewer_accounts WHERE status='active' AND email_verified_at IS NOT NULL AND instr(lower(email),?)>0 ORDER BY email LIMIT 25").bind(search))}}
 if(path==='managers'&&method==='PUT'){
  if(staff.role!=='owner')deny(403,'owner_required');const d=await input(request,['request_id','access_sub','active']),sub=text(d.access_sub,256,true);if(![0,1].includes(d.active))deny(400,'invalid_fields');
  return operation(db,staff.sub,'manager.set',sub,d,{ok:true},q=>[q('INSERT INTO sales_managers SELECT ?,? WHERE $guard ON CONFLICT(access_sub) DO UPDATE SET active=excluded.active',[sub,d.active])],{sql:"EXISTS(SELECT 1 FROM platform_staff WHERE access_sub=? AND role='publisher' AND active=1)",args:[sub]});
 }
 if(path==='products'&&method==='PUT'){
  const d=await input(request,['request_id','kind','id','revision','policy_revision','access','price_minor','sale_enabled','policy']),p=await item(db,d.kind,d.id);revision(d.revision);
  if(!['free','paid'].includes(d.access)||![0,1].includes(d.sale_enabled))deny(400,'invalid_price');const price=d.access==='free'?0:amount(d.price_minor);if(d.access==='free'&&(d.price_minor!==0||d.sale_enabled))deny(400,'invalid_price');
  if(p.kind==='school'&&d.access==='paid'&&price!==3000000)deny(400,'school_price_fixed');
  if(d.access==='paid'&&d.kind==='video'&&(p.source_type!=='bunny'||!p.source_ref))deny(400,'protected_storage_required');
  if(d.sale_enabled&&(p.state!=='published'||d.kind==='video'&&(p.bunny_status!==4||p.publish_at>new Date().toISOString())||env.MEDIA_PAID_ENABLED!=='true'))deny(409,'product_not_ready');
  const terms=policy(d.policy,p);if(d.sale_enabled)dates(terms);const previous=await db.prepare('SELECT revision FROM sales_products WHERE kind=? AND product_id=?').bind(d.kind,p.id).first();if((previous?.revision||0)!==d.policy_revision)deny(409,'revision_conflict');
  return operation(db,staff.sub,'product.save',p.id,d,{ok:true},q=>[
   q(`UPDATE ${p.table} SET access=?,price_minor=?,currency='RUB',revision=revision+1,updated_at=? WHERE id=? AND $guard`,[d.access,price,d.kind==='video'?new Date().toISOString():time(),p.id]),
   q('INSERT INTO sales_products(kind,product_id,sale_enabled,policy) SELECT ?,?,?,? WHERE $guard ON CONFLICT(kind,product_id) DO UPDATE SET sale_enabled=excluded.sale_enabled,policy=excluded.policy,revision=sales_products.revision+1',[d.kind,p.id,d.sale_enabled,JSON.stringify(terms)])
  ],{sql:`EXISTS(SELECT 1 FROM ${p.table} WHERE id=? AND revision=?) AND COALESCE((SELECT revision FROM sales_products WHERE kind=? AND product_id=?),0)=?`,args:[p.id,d.revision,d.kind,p.id,d.policy_revision]});
 }
 if(path==='orders'&&method==='POST'){
  const d=await input(request,['request_id','viewer_id','kind','id','amount_minor']),p=await item(db,d.kind,d.id);await participant(db,d.viewer_id);
  const configured=await db.prepare('SELECT policy,revision FROM sales_products WHERE kind=? AND product_id=?').bind(d.kind,p.id).first();if(p.state!=='published'||p.access!=='paid'||!configured||p.currency!=='RUB')deny(400,'not_for_sale');
  if(p.kind==='school'&&JSON.parse(configured.policy).mode!=='school')deny(400,'school_dates_required');
  const price=amount(d.amount_minor??p.price_minor),id=crypto.randomUUID();if(p.kind==='school'&&price!==3000000)deny(400,'school_price_fixed');dates(configured.policy);
  return operation(db,staff.sub,'order.create',p.id,d,{id},q=>[
   q(`INSERT INTO viewer_orders(id,viewer_id,${p.column},title,amount_minor,currency,status,created_at,updated_at) SELECT ?,?,?,?,?,'RUB','pending_payment',?,? WHERE $guard`,[id,d.viewer_id,p.id,p.title,price,time(),time()]),
   q("INSERT INTO sales_orders(order_id,source,state,policy) SELECT ?,'manual','pending',? WHERE $guard",[id,configured.policy])
  ],{sql:`NOT EXISTS(SELECT 1 FROM viewer_orders WHERE viewer_id=? AND ${p.column}=? AND status IN ('pending_payment','in_review')) AND EXISTS(SELECT 1 FROM sales_products WHERE kind=? AND product_id=? AND revision=?)`,args:[d.viewer_id,p.id,d.kind,p.id,configured.revision]});
 }
 const match=path.match(/^orders\/([a-f0-9-]{36})\/(payment|grant|cancel|refund)$/);
 if(match&&method==='POST'){
  const d=await input(request,['request_id','revision','amount_minor','method','confirm_received','dates']),o=await order(db,match[1]),expected=revision(d.revision),action=match[2];
  if(o.source!=='manual')deny(409,'manual_order_required');const cond={sql:'EXISTS(SELECT 1 FROM sales_orders WHERE order_id=? AND revision=? AND state=?)',args:[o.id,expected,o.state]};
  if(action==='payment'){
   if(!['pending','partial'].includes(o.state)||d.confirm_received!==true)deny(400,'payment_confirmation_required');const sum=amount(d.amount_minor),methodName=text(d.method,80,true),paid=(await db.prepare("SELECT COALESCE(SUM(CASE direction WHEN 'received' THEN amount_minor ELSE -amount_minor END),0) n FROM sales_payments WHERE order_id=?").bind(o.id).first()).n;if(sum+paid>o.amount_minor)deny(400,'overpayment');
   return operation(db,staff.sub,'payment.received',o.id,d,{ok:true},q=>[q("INSERT INTO sales_payments SELECT ?,?,?,?,'received',? WHERE $guard",[crypto.randomUUID(),o.id,sum,methodName,time()]),q(`UPDATE sales_orders SET state=CASE WHEN ${balanceSQL}>=? THEN 'paid' ELSE 'partial' END,revision=revision+1 WHERE order_id=? AND $guard`,[o.amount_minor,o.id])],cond);
  }
  if(action==='grant'){
   if(o.state!=='paid')deny(409,'full_payment_required');const [start,end]=dates(o.policy,time(),d.dates),kind=o.course_id?'course':'video';
   return operation(db,staff.sub,'access.paid',o.id,d,{ok:true},q=>[q("UPDATE viewer_orders SET status='paid',access_expires_at=?,reviewed_by=?,updated_at=?,revision=revision+1 WHERE id=? AND $guard",[end,staff.sub,time(),o.id]),createGrant(q,o.viewer_id,kind,o.course_id||o.video_id,start,end,staff.sub,o.id),q("UPDATE sales_orders SET state='granted',revision=revision+1 WHERE order_id=? AND $guard",[o.id])],cond);
  }
  if(action==='cancel'){
   if(!['pending','partial'].includes(o.state))deny(409,'cannot_cancel');const paid=(await db.prepare("SELECT COUNT(*) n FROM sales_payments WHERE order_id=?").bind(o.id).first()).n;if(paid)deny(409,'refund_required');
   return operation(db,staff.sub,'order.cancel',o.id,d,{ok:true},q=>[q("UPDATE viewer_orders SET status='rejected',updated_at=?,revision=revision+1 WHERE id=? AND $guard",[time(),o.id]),q("UPDATE sales_orders SET state='cancelled',revision=revision+1 WHERE order_id=? AND $guard",[o.id])],cond);
  }
  if(action==='refund'){
   if(!['partial','paid','granted'].includes(o.state)||d.confirm_received!==true)deny(409,'refund_confirmation_required');const sum=(await db.prepare("SELECT COALESCE(SUM(CASE direction WHEN 'received' THEN amount_minor ELSE -amount_minor END),0) n FROM sales_payments WHERE order_id=?").bind(o.id).first()).n;if(sum<=0)deny(409,'nothing_to_refund');
   return operation(db,staff.sub,'payment.refunded',o.id,d,{ok:true},q=>[q("INSERT INTO sales_payments SELECT ?,?,?,?,'refunded',? WHERE $guard",[crypto.randomUUID(),o.id,sum,text(d.method,80,true),time()]),q("UPDATE sales_orders SET state='refunded',revision=revision+1 WHERE order_id=? AND $guard",[o.id]),q("UPDATE viewer_orders SET status='rejected',updated_at=?,revision=revision+1 WHERE id=? AND $guard",[time(),o.id]),q('UPDATE viewer_grants SET revoked_at=?,sales_revision=sales_revision+1 WHERE source_order_id=? AND revoked_at IS NULL AND $guard',[time(),o.id])],cond);
  }
 }
 if(path==='grants'&&method==='POST'){
  const d=await input(request,['request_id','viewer_id','kind','id','reason','dates']),p=await item(db,d.kind,d.id);await participant(db,d.viewer_id);if(!['gift','free'].includes(d.reason)||p.state!=='published')deny(400,'invalid_grant');if(d.kind==='video'&&p.access==='paid'&&p.source_type!=='bunny')deny(400,'protected_storage_required');const [start,end]=dates(null,time(),d.dates),id=crypto.randomUUID();
  return operation(db,staff.sub,'access.'+d.reason,p.id,d,{id},q=>[createGrant(q,d.viewer_id,d.kind,p.id,start,end,staff.sub,null,id)]);
 }
 const grant=path.match(/^grants\/([a-f0-9-]{36})\/(extend|revoke)$/);
 if(grant&&method==='POST'){
  const d=await input(request,['request_id','revision','dates']),id=uuid(grant[1]),old=await db.prepare('SELECT * FROM viewer_grants WHERE id=?').bind(id).first();if(!old)deny(404,'grant_not_found');
  const condition={sql:'EXISTS(SELECT 1 FROM viewer_grants WHERE id=? AND sales_revision=? AND revoked_at IS NULL)',args:[id,revision(d.revision)]};
  if(grant[2]==='revoke')return operation(db,staff.sub,'access.revoke',id,d,{ok:true},q=>[q('UPDATE viewer_grants SET revoked_at=?,sales_revision=sales_revision+1 WHERE id=? AND $guard',[time(),id])],condition);
  const [start,end]=dates(null,time(),d.dates);if(end<=old.expires_at)deny(400,'extension_required');
  return operation(db,staff.sub,'access.extend',id,d,{ok:true},q=>[q('UPDATE viewer_grants SET starts_at=?,expires_at=?,sales_revision=sales_revision+1 WHERE id=? AND $guard',[start,end,id])],condition);
 }
 deny(404,'not_found');
}
