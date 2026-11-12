import {deny,time,rows,decode,requireOwner,audit} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';
import {hash,operation,createGrant,uuid,participant} from './sales-core.mjs';
import {digitalProductRequest as tributeRequest} from './digital-product-api.mjs';
import {verifiedIdentitySQL} from './viewer-identity.mjs';
const numeric=value=>Number.isSafeInteger(value)&&value>0;
const stamp=value=>typeof value==='string'&&value.length<=64&&/^\d{4}-\d{2}-\d{2}T/.test(value)?Math.floor(Date.parse(value)/1000):NaN;
const operationId=async key=>{const h=await hash(key);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)};
export async function digitalSettings(db){return db.prepare('SELECT * FROM digital_integration_settings WHERE id=1').first()}
function enabledFor(env,settings,viewer){return settings.mode==='test'&&settings.test_viewer_id===viewer||settings.mode==='live'&&env.TRIBUTE_DIGITAL_LIVE_ENABLED==='true'}
function validateEvent(event){
 const p=event.payload,refund=event.name==='digital_product_refunded';
 // Dashboard probes / the old guide's minimal example have no unique purchase
 // identity. Acknowledge these without fabricating a financial transaction.
 if(!p||!numeric(p.purchase_id))return null;
 if(!numeric(p.product_id)||!numeric(p.transaction_id)||!numeric(p.amount)||typeof p.currency!=='string'||!['rub','usd','eur','xtr'].includes(p.currency.toLowerCase()))deny(400,'invalid_digital_event');
 const at=stamp(refund?p.refunded_at:p.purchase_created_at);if(!Number.isSafeInteger(at)||at<1||at>time()+300)deny(400,'invalid_digital_event');
 if(p.telegram_user_id!=null&&!numeric(p.telegram_user_id))deny(400,'invalid_digital_event');
 // trb_user_id / user_id identify Tribute accounts, NOT Telegram users.
 const telegram=numeric(p.telegram_user_id)&&!(typeof p.trb_user_id==='string'&&p.trb_user_id.startsWith('W-'))?String(p.telegram_user_id):null;
 return {purchase:String(p.purchase_id),product:p.product_id,transaction:String(p.transaction_id),amount:p.amount,currency:p.currency.toUpperCase(),at,telegram,refund};
}
function compatible(old,e){return old.product_id===e.product&&old.transaction_id===e.transaction&&old.currency===e.currency&&(!old.telegram_id||!e.telegram||old.telegram_id===e.telegram)}
export async function processDigitalEvent(env,event){
 if(env.SALES_ENABLED!=='true'||env.TRIBUTE_DIGITAL_ENABLED==='false')return;
 const e=validateEvent(event);if(!e)return;const db=env.MEDIA_DB,old=await db.prepare('SELECT * FROM digital_purchase_receipts WHERE purchase_id=?').bind(e.purchase).first();
 if(old&&!compatible(old,e))deny(400,'digital_purchase_conflict');
 const field=e.refund?'refund_hash':'purchase_hash',digest=await hash(e);if(old?.[field]&&old[field]!==digest)deny(400,'digital_purchase_conflict');
 const mapping=await db.prepare('SELECT * FROM digital_product_mappings WHERE product_id=?').bind(e.product).first();
 const link=!e.refund&&e.telegram?await db.prepare('SELECT viewer_id FROM telegram_account_links WHERE telegram_id=? AND linked_at<=?').bind(e.telegram,e.at).first():null;
 const request_id=await operationId('digital.receipt:'+event.name+':'+e.purchase),data={request_id,digest};
 try{await operation(db,'tribute-digital','digital.receipt.'+event.name,e.purchase,data,{ok:true},q=>[
  q(`INSERT INTO digital_purchase_receipts(purchase_id,product_id,transaction_id,telegram_id,currency,amount_minor,purchased_at,purchase_hash,refund_amount_minor,refunded_at,refund_hash,viewer_id,video_id,mapping_revision,days,expected_amount_minor,reason,received_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',? WHERE $guard
   ON CONFLICT(purchase_id) DO UPDATE SET
   telegram_id=COALESCE(digital_purchase_receipts.telegram_id,excluded.telegram_id),
   amount_minor=COALESCE(digital_purchase_receipts.amount_minor,excluded.amount_minor),purchased_at=COALESCE(digital_purchase_receipts.purchased_at,excluded.purchased_at),purchase_hash=COALESCE(digital_purchase_receipts.purchase_hash,excluded.purchase_hash),
   refund_amount_minor=COALESCE(digital_purchase_receipts.refund_amount_minor,excluded.refund_amount_minor),refunded_at=COALESCE(digital_purchase_receipts.refunded_at,excluded.refunded_at),refund_hash=COALESCE(digital_purchase_receipts.refund_hash,excluded.refund_hash),
   viewer_id=CASE WHEN digital_purchase_receipts.purchase_hash IS NULL THEN excluded.viewer_id ELSE digital_purchase_receipts.viewer_id END,
   video_id=COALESCE(digital_purchase_receipts.video_id,excluded.video_id),mapping_revision=COALESCE(digital_purchase_receipts.mapping_revision,excluded.mapping_revision),days=COALESCE(digital_purchase_receipts.days,excluded.days),expected_amount_minor=COALESCE(digital_purchase_receipts.expected_amount_minor,excluded.expected_amount_minor)`,
   [e.purchase,e.product,e.transaction,e.telegram,e.currency,e.refund?null:e.amount,e.refund?null:e.at,e.refund?null:digest,e.refund?e.amount:null,e.refund?e.at:null,e.refund?digest:null,link?.viewer_id||null,mapping?.video_id||null,mapping?.revision||null,mapping?.days||null,mapping?.amount_minor||null,time()])
 ],{sql:`NOT EXISTS(SELECT 1 FROM digital_purchase_receipts WHERE purchase_id=? AND (product_id!=? OR transaction_id!=? OR currency!=? OR (telegram_id IS NOT NULL AND ? IS NOT NULL AND telegram_id!=?) OR (${field} IS NOT NULL AND ${field}!=?)))`,args:[e.purchase,e.product,e.transaction,e.currency,e.telegram,e.telegram,digest]})}catch(error){if(error.message==='revision_conflict')deny(400,'digital_purchase_conflict');throw error}
 await settleDigitalPurchase(env,e.purchase);
}
export async function settleDigitalPurchase(env,purchaseId){
 const db=env.MEDIA_DB,r=await db.prepare('SELECT * FROM digital_purchase_receipts WHERE purchase_id=?').bind(purchaseId).first();if(!r)return;
 const reason=async code=>{await db.prepare('UPDATE digital_purchase_receipts SET reason=? WHERE purchase_id=? AND order_id IS NULL').bind(code,purchaseId).run()};
 if(r.order_id){if(r.refunded_at)await refundDigitalOrder(env,r);return}
 if(!r.purchase_hash){await reason('refund_before_purchase');return}
 if(r.refunded_at){await reason('refunded_before_grant');return} // Terminal tombstone: a late purchase never re-grants.
 if(!r.viewer_id||!r.telegram_id){await reason('unlinked_buyer');return}
 const m=await db.prepare('SELECT * FROM digital_product_mappings WHERE product_id=?').bind(r.product_id).first();if(!m||!r.video_id){await reason('unmapped_product');return}
 if(!m.active||m.revision!==r.mapping_revision||m.video_id!==r.video_id){await reason('mapping_changed');return}
 if(r.currency!=='RUB'||r.amount_minor!==r.expected_amount_minor||r.amount_minor!==m.amount_minor){await reason('price_mismatch');return}
 const settings=await digitalSettings(db);if(!enabledFor(env,settings,r.viewer_id)){await reason('issuance_disabled');return}
 const account=await db.prepare(`SELECT 1 FROM viewer_accounts a WHERE a.id=? AND a.status='active' AND ${verifiedIdentitySQL('a')}`).bind(r.viewer_id).first();if(!account){await reason('account_unavailable');return}
 const v=await db.prepare("SELECT * FROM videos WHERE id=? AND state='published' AND access='paid' AND currency='RUB' AND price_minor=? AND publish_at<=?").bind(r.video_id,r.amount_minor,new Date().toISOString()).first();if(!v||!['bunny','youtube'].includes(v.source_type)||v.source_type==='bunny'&&v.bunny_status!==4){await reason('video_unavailable');return}
 const block=await db.prepare("SELECT 1 FROM access_blocks b WHERE b.viewer_id=? AND ((b.kind='video' AND b.product_id=?) OR (b.kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=?)))").bind(r.viewer_id,r.video_id,r.video_id).first();if(block){await reason('administratively_blocked');return}
 const end=r.purchased_at+r.days*86400;if(end<=time()){await reason('period_expired');return}
 const orderId=crypto.randomUUID(),request_id=await operationId('digital.grant:'+purchaseId),policy=JSON.stringify({mode:'days',days:r.days}),data={request_id,purchase:purchaseId};
 const condition={sql:`EXISTS(SELECT 1 FROM digital_purchase_receipts WHERE purchase_id=? AND order_id IS NULL AND refunded_at IS NULL AND purchase_hash=?)
 AND EXISTS(SELECT 1 FROM digital_product_mappings WHERE product_id=? AND revision=? AND active=1)
 AND EXISTS(SELECT 1 FROM digital_integration_settings WHERE id=1 AND revision=?)
 AND EXISTS(SELECT 1 FROM telegram_account_links WHERE viewer_id=? AND telegram_id=? AND linked_at<=?)
 AND EXISTS(SELECT 1 FROM viewer_accounts a WHERE a.id=? AND a.status='active' AND ${verifiedIdentitySQL('a')})
 AND EXISTS(SELECT 1 FROM videos WHERE id=? AND revision=? AND state='published' AND access='paid' AND currency='RUB' AND price_minor=?)
 AND NOT EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=? AND ((b.kind='video' AND b.product_id=?) OR (b.kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=?))))`,args:[purchaseId,r.purchase_hash,r.product_id,m.revision,settings.revision,r.viewer_id,r.telegram_id,r.purchased_at,r.viewer_id,r.video_id,v.revision,r.amount_minor,r.viewer_id,r.video_id,r.video_id]};
 try{await operation(db,'tribute-digital','digital.access',purchaseId,data,{ok:true},q=>[
  q("INSERT INTO viewer_orders(id,viewer_id,video_id,title,amount_minor,currency,status,access_expires_at,created_at,updated_at) SELECT ?,?,?,?,?,'RUB','paid',?,?,? WHERE $guard",[orderId,r.viewer_id,r.video_id,v.title,r.amount_minor,end,r.purchased_at,time()]),
  q("INSERT INTO sales_orders(order_id,source,state,policy,provider_uuid,provider_stage,last_payment_status) SELECT ?,'tribute','granted',?,?,'ready','paid' WHERE $guard",[orderId,policy,'digital:'+purchaseId]),
  q("INSERT INTO sales_payments SELECT ?,?,?,'Tribute Digital','received',? WHERE $guard",[request_id,orderId,r.amount_minor,r.purchased_at]),
  createGrant(q,r.viewer_id,'video',r.video_id,r.purchased_at,end,'tribute-digital',orderId),
  q('INSERT INTO sales_events SELECT ?,?,?,?,? WHERE $guard',['digital.paid:'+purchaseId,orderId,'new_digital_product',r.purchase_hash,time()]),
  q("UPDATE digital_purchase_receipts SET order_id=?,reason='granted' WHERE purchase_id=? AND $guard",[orderId,purchaseId])
 ],condition)}catch(error){if(error.message==='revision_conflict'&&(await db.prepare('SELECT order_id FROM digital_purchase_receipts WHERE purchase_id=?').bind(purchaseId).first())?.order_id)return;throw error}
}
async function refundDigitalOrder(env,r){
 const db=env.MEDIA_DB;if(r.refund_amount_minor>r.amount_minor)deny(400,'digital_refund_mismatch');
 const key='digital.refund:'+r.purchase_id,request_id=await operationId(key),data={request_id,purchase:r.purchase_id};
 await operation(db,'tribute-digital','digital.refund',r.purchase_id,data,{ok:true},q=>[
  q('INSERT INTO sales_events SELECT ?,?,?,?,? WHERE $guard',[key,r.order_id,'digital_product_refunded',r.refund_hash,time()]),
  q("INSERT INTO sales_payments SELECT ?,?,?,'Tribute Digital','refunded',? WHERE $guard",[request_id,r.order_id,r.refund_amount_minor,r.refunded_at]),
  q("UPDATE sales_orders SET state='refunded',last_payment_status='refunded',revision=revision+1 WHERE order_id=? AND $guard",[r.order_id]),
  q("UPDATE viewer_orders SET status='rejected',revision=revision+1,updated_at=? WHERE id=? AND $guard",[time(),r.order_id]),
  q('UPDATE viewer_grants SET revoked_at=?,sales_revision=sales_revision+1 WHERE source_order_id=? AND revoked_at IS NULL AND $guard',[time(),r.order_id]),
  q("UPDATE digital_purchase_receipts SET reason='refunded' WHERE purchase_id=? AND $guard",[r.purchase_id])
 ],{sql:"EXISTS(SELECT 1 FROM digital_purchase_receipts WHERE purchase_id=? AND order_id=? AND refunded_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM sales_events WHERE event_key=?)",args:[r.purchase_id,r.order_id,key]});
}
export async function digitalAdmin(request,env,staff,path,method){
 requireOwner(staff);const db=env.MEDIA_DB;
 if(path===''&&method==='GET')return {settings:await digitalSettings(db),mappings:await rows(db.prepare('SELECT m.*,v.title FROM digital_product_mappings m JOIN videos v ON v.id=m.video_id ORDER BY m.product_id')),videos:(await rows(db.prepare("SELECT id,title,price_minor,currency FROM videos WHERE state='published' AND access='paid' ORDER BY updated_at DESC LIMIT 200"))).map(decode),receipts:await rows(db.prepare('SELECT r.*,a.email FROM digital_purchase_receipts r LEFT JOIN viewer_accounts a ON a.id=r.viewer_id ORDER BY received_at DESC LIMIT 50')),liveAvailable:env.TRIBUTE_DIGITAL_LIVE_ENABLED==='true'};
 if(path==='products'&&method==='POST'){await input(request,[]);const result=await tributeRequest(env,'/products?type=digital&size=100&page=1');return {items:(Array.isArray(result.rows)?result.rows:[]).map(p=>({id:p.id,name:p.name,amount:p.amount,currency:p.currency,status:p.status,webLink:p.webLink}))}}
 if(path==='mapping'&&method==='PUT'){
  const d=await input(request,['request_id','product_id','video_id','days','active','revision']);if(!numeric(d.product_id)||!Number.isInteger(d.days)||d.days<1||d.days>3660||![0,1].includes(d.active))deny(400,'invalid_digital_mapping');uuid(d.video_id);
  const remote=await tributeRequest(env,'/products/'+d.product_id),v=await db.prepare("SELECT * FROM videos WHERE id=? AND state='published' AND access='paid'").bind(d.video_id).first();
  if(remote.id!==d.product_id)deny(400,'digital_product_id_mismatch');
  if(remote.type!=='digital')deny(400,'digital_product_type_mismatch');
  // Mapping is configuration, not checkout approval. A new/pending product may
  // be prepared before moderation or its first purchase. Checkout retains its
  // independent approved-product and issuance gates.
  if(!['new','pending','approved'].includes(remote.status))deny(400,'digital_product_status_unavailable');
  if(remote.currency?.toUpperCase()!=='RUB')deny(400,'digital_product_currency_mismatch');
  if(!numeric(remote.amount))deny(400,'digital_product_amount_invalid');
  if(!v)deny(400,'digital_video_unavailable');
  if(v.currency!=='RUB'||v.price_minor!==remote.amount)deny(400,'digital_price_mismatch');
  let url;try{url=new URL(remote.webLink)}catch{deny(400,'invalid_digital_product_url')}if(url.origin!=='https://web.tribute.tg'||!/^\/p\/[A-Za-z0-9]+\/?$/.test(url.pathname)||url.search||url.hash||url.username||url.password)deny(400,'invalid_digital_product_url');
  const old=await db.prepare('SELECT * FROM digital_product_mappings WHERE product_id=?').bind(d.product_id).first();if((old?.revision||0)!==d.revision)deny(409,'revision_conflict');
  if(old&&(old.video_id!==d.video_id||old.days!==d.days||old.amount_minor!==remote.amount)&&await db.prepare('SELECT 1 FROM digital_purchase_receipts WHERE product_id=?').bind(d.product_id).first())deny(409,'digital_mapping_has_purchases');
  return operation(db,staff.sub,'digital.mapping',String(d.product_id),d,{ok:true},q=>[q('INSERT INTO digital_product_mappings SELECT ?,?,?,\'RUB\',?,?,?,1 WHERE $guard ON CONFLICT(product_id) DO UPDATE SET video_id=excluded.video_id,amount_minor=excluded.amount_minor,days=excluded.days,active=excluded.active,payment_url=excluded.payment_url,revision=digital_product_mappings.revision+1',[d.product_id,d.video_id,remote.amount,d.days,d.active,url.href])],{sql:'COALESCE((SELECT revision FROM digital_product_mappings WHERE product_id=?),0)=?',args:[d.product_id,d.revision]});
 }
 if(path==='settings'&&method==='PUT'){
  const d=await input(request,['request_id','revision','mode','test_viewer_id']);if(!['off','test','live'].includes(d.mode)||d.mode==='live'&&env.TRIBUTE_DIGITAL_LIVE_ENABLED!=='true')deny(400,'digital_live_disabled');if(d.mode==='test')await participant(db,d.test_viewer_id);
  return operation(db,staff.sub,'digital.settings','digital',d,{ok:true},q=>[q('UPDATE digital_integration_settings SET mode=?,test_viewer_id=?,revision=revision+1 WHERE id=1 AND $guard',[d.mode,d.mode==='test'?d.test_viewer_id:null])],{sql:'EXISTS(SELECT 1 FROM digital_integration_settings WHERE id=1 AND revision=?)',args:[revision(d.revision)]});
 }
 if(path==='retry'&&method==='POST'){const d=await input(request,['purchase_id']);if(!numeric(d.purchase_id))deny(400,'invalid_purchase_id');await audit(db,staff.sub,'digital.review',String(d.purchase_id));await settleDigitalPurchase(env,String(d.purchase_id));return {ok:true}}
 deny(404,'not_found');
}
