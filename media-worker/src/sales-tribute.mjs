import {deny,time,localized} from './platform-data.mjs';
import {automaticEnabled,publicEnabled,order,hash,operation,dates,createGrant,uuid} from './sales-core.mjs';
const base='https://tribute.tg/api/v1';
export async function tributeRequest(env,path,body){
 if(!env.TRIBUTE_API_KEY)deny(503,'tribute_not_configured');let response;
 try{response=await fetch(base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Api-Key':env.TRIBUTE_API_KEY,'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}catch{deny(502,'tribute_unavailable')}
 if(!response.ok)deny(502,'tribute_request_failed');try{return await response.json()}catch{deny(502,'tribute_invalid_response')}
}
export function paymentURL(value){try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='web.tribute.tg'&&!u.port&&!u.username&&!u.password&&/^\/shop\/pay\/[a-f0-9-]{36}\/?$/.test(u.pathname)&&!u.search&&!u.hash)return u.href}catch{}deny(502,'tribute_invalid_payment_url')}
export async function createTributePayment(env,orderId,viewer,origin){
 if(!automaticEnabled(env)||!publicEnabled(env))deny(503,'automatic_payments_disabled');const db=env.MEDIA_DB,o=await order(db,orderId);
 if(o.viewer_id!==viewer.id||o.source!=='tribute')deny(403,'order_owner_required');if(o.state!=='pending')deny(409,'payment_not_pending');if(o.provider_stage==='ready')return {id:o.id,payment_url:paymentURL(o.payment_url)};
 if(o.provider_stage!=='new')deny(409,'payment_reconciliation_required');
 const shopId=Number(env.TRIBUTE_SHOP_ID);if(!Number.isSafeInteger(shopId)||shopId<1)deny(503,'tribute_shop_not_configured');
 const shops=await tributeRequest(env,'/shops'),shop=Array.isArray(shops)?shops.find(s=>s.id===shopId):null;if(!shop||shop.status!==1||shop.onlyStars!==false)deny(503,'tribute_rub_shop_not_ready');
 const reserved=await db.prepare("UPDATE sales_orders SET provider_stage='creating',shop_id=?,revision=revision+1 WHERE order_id=? AND provider_stage='new' AND state='pending'").bind(shopId,o.id).run();if(!reserved.meta.changes)deny(409,'payment_reconciliation_required');
 try{
  const title=localized(o.title),remote=await tributeRequest(env,'/shop/orders',{shopId,amount:o.amount_minor,currency:'rub',title:(title.ru||title.en).slice(0,100),description:(title.ru||title.en).slice(0,300),period:'onetime',customerId:viewer.id,email:viewer.email,comment:'mysterion-order:'+o.id,successUrl:origin+'/viewer-account.html',failUrl:origin+'/viewer-account.html'});
  if(typeof remote.uuid!=='string'||!/^[a-f0-9-]{36}$/.test(remote.uuid)||remote.shopId!==shopId||remote.amount!==o.amount_minor||remote.currency!=='rub'||remote.period!=='onetime'||remote.onlyStars===true||remote.comment!=='mysterion-order:'+o.id)deny(502,'tribute_invalid_order');
  const url=paymentURL(remote.paymentUrl);
  await db.prepare("UPDATE sales_orders SET provider_uuid=?,payment_url=?,provider_stage='ready',revision=revision+1 WHERE order_id=? AND provider_stage='creating'").bind(remote.uuid,url,o.id).run();return {id:o.id,payment_url:url};
 }catch(error){await db.prepare("UPDATE sales_orders SET provider_stage='uncertain',revision=revision+1 WHERE order_id=? AND provider_stage='creating'").bind(o.id).run();throw error}
}
export async function reconcileTributePayment(env,staff,data){
 if(!automaticEnabled(env))deny(503,'automatic_payments_disabled');const db=env.MEDIA_DB,o=await order(db,data.id);if(o.source!=='tribute'||!['creating','uncertain'].includes(o.provider_stage))deny(409,'reconciliation_not_required');
 const providerId=uuid(data.provider_uuid),remote=await tributeRequest(env,'/shop/orders/'+providerId+'?shopId='+o.shop_id),account=await db.prepare('SELECT email FROM viewer_accounts WHERE id=?').bind(o.viewer_id).first();
 if(remote.uuid!==providerId||remote.shopId!==o.shop_id||remote.amount!==o.amount_minor||remote.currency!=='rub'||remote.period!=='onetime'||remote.onlyStars===true||remote.comment!=='mysterion-order:'+o.id||remote.email!==account?.email)deny(400,'payment_order_mismatch');
 const url=paymentURL(remote.paymentUrl);
 // This recovers a lost creation response, never marks payment as received.
 return operation(db,staff.sub,'tribute.reconcile',o.id,data,{ok:true},q=>[q("UPDATE sales_orders SET provider_uuid=?,payment_url=?,provider_stage='ready',revision=revision+1 WHERE order_id=? AND $guard",[providerId,url,o.id])],{sql:"EXISTS(SELECT 1 FROM sales_orders WHERE order_id=? AND revision=? AND provider_stage IN ('creating','uncertain'))",args:[o.id,o.sales_revision]});
}
// Called ONLY after raw-body HMAC verification. Redirects never enter here.
export async function processTributeEvent(env,event){
 if(!automaticEnabled(env))return;
 if(!['shop_order','shop_order_payment_failed','shop_order_refunded'].includes(event.name))return;
 const p=event.payload,db=env.MEDIA_DB;
 if(typeof p.uuid!=='string')deny(400,'invalid_payment_event');
 const found=await db.prepare("SELECT order_id FROM sales_orders WHERE provider_uuid=? AND source='tribute' AND provider_stage='ready'").bind(p.uuid).first();
 if(!found){
  // A webhook can beat the create response. Do not acknowledge our in-flight
  // payment until its provider UUID has been stored; Tribute will retry it.
  if(typeof p.customerId==='string'&&Number.isSafeInteger(p.shopId)&&Number.isSafeInteger(p.amount)&&await db.prepare("SELECT 1 FROM sales_orders s JOIN viewer_orders o ON o.id=s.order_id WHERE s.source='tribute' AND s.provider_stage IN ('creating','uncertain') AND s.shop_id=? AND o.viewer_id=? AND o.amount_minor=?").bind(p.shopId,p.customerId,p.amount).first())deny(503,'payment_mapping_pending');
  return; // Unrelated shop orders / owner self-test: no mutation.
 }
 const o=await order(db,found.order_id),refund=event.name==='shop_order_refunded';
 if(p.shopId!==o.shop_id||p.currency!=='rub'||!Number.isSafeInteger(p.amount)||p.amount<=0||(!refund&&p.amount!==o.amount_minor)||(refund&&p.amount>o.amount_minor)||p.customerId!==o.viewer_id||p.isRecurrent===true||p.onlyStars===true||p.isTrial===true||p.firstPeriodAmount!=null||p.period&&p.period!=='onetime')deny(400,'payment_order_mismatch');
 if(event.name==='shop_order'&&(p.status!=='paid'||p.isRecurrent!==false||!Number.isSafeInteger(p.fee)||p.fee<0))deny(400,'invalid_payment_event');
 if(refund&&(!['initiated','completed'].includes(p.status)||!Number.isSafeInteger(p.transactionId)||p.transactionId<1))deny(400,'invalid_payment_event');
 const key=event.name==='shop_order'?'paid:'+p.uuid:refund?'refund:'+p.uuid+':'+p.transactionId+':'+p.status:'failure:'+p.uuid+':'+event.created_at;
 if(await db.prepare('SELECT 1 FROM sales_events WHERE event_key=?').bind(key).first())return;
 if(refund&&p.status==='completed'){const refunded=(await db.prepare("SELECT COALESCE(SUM(amount_minor),0) n FROM sales_payments WHERE order_id=? AND direction='refunded'").bind(o.id).first()).n;if(refunded+p.amount>o.amount_minor)deny(400,'payment_order_mismatch')}
 const digest=await hash(key),requestId=digest.slice(0,8)+'-'+digest.slice(8,12)+'-'+digest.slice(12,16)+'-'+digest.slice(16,20)+'-'+digest.slice(20,32);
 const data={request_id:requestId,key},result={ok:true};let access;
 // A completed refund is terminal, including when delivered before payment.
 const deliver=event.name==='shop_order'&&!['refunded','cancelled','granted'].includes(o.state);
 if(deliver){const at=Math.floor(Date.parse(event.created_at)/1000);if(!Number.isSafeInteger(at)||at<1||at>time()+300)deny(400,'invalid_payment_event');access=dates(o.policy,at)}
 const condition={sql:'NOT EXISTS(SELECT 1 FROM sales_events WHERE event_key=?) AND EXISTS(SELECT 1 FROM sales_orders WHERE order_id=? AND revision=?)',args:[key,o.id,o.sales_revision]};
 try{await operation(db,'tribute','webhook.'+event.name,o.id,data,result,q=>{
  const statements=[q('INSERT INTO sales_events SELECT ?,?,?,?,? WHERE $guard',[key,o.id,event.name,digest,time()])];
  if(deliver){const [start,end]=access,kind=o.course_id?'course':'video';statements.push(q("INSERT INTO sales_payments SELECT ?,?,?,'Tribute','received',? WHERE $guard",[requestId,o.id,o.amount_minor,time()]),q("UPDATE viewer_orders SET status='paid',access_expires_at=?,updated_at=?,revision=revision+1 WHERE id=? AND $guard",[end,time(),o.id]),createGrant(q,o.viewer_id,kind,o.course_id||o.video_id,start,end,'tribute',o.id),q("UPDATE sales_orders SET state='granted',last_payment_status='paid',revision=revision+1 WHERE order_id=? AND $guard",[o.id]))}
  else if(refund&&p.status==='completed')statements.push(q("INSERT INTO sales_payments SELECT ?,?,?,'Tribute','refunded',? WHERE $guard",[requestId,o.id,p.amount,time()]),q("UPDATE sales_orders SET state='refunded',last_payment_status='refunded',revision=revision+1 WHERE order_id=? AND $guard",[o.id]),q("UPDATE viewer_orders SET status='rejected',updated_at=?,revision=revision+1 WHERE id=? AND $guard",[time(),o.id]),q('UPDATE viewer_grants SET revoked_at=?,sales_revision=sales_revision+1 WHERE source_order_id=? AND revoked_at IS NULL AND $guard',[time(),o.id]));
  else if(event.name==='shop_order_payment_failed')statements.push(q("UPDATE sales_orders SET last_payment_status='failed',revision=revision+1 WHERE order_id=? AND state IN ('pending','partial') AND $guard",[o.id]));
  return statements;
 },condition)}catch(error){if(error.message==='revision_conflict'&&await db.prepare('SELECT 1 FROM sales_events WHERE event_key=?').bind(key).first())return;throw error}
}
