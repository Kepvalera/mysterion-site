import {deny,time} from './platform-data.mjs';
import {hash,operation,dates} from './sales-core.mjs';
import {gpOrder} from './getplatinum-checkout.mjs';
const numeric=n=>Number.isSafeInteger(n)&&n>0;
const opId=async value=>{const h=await hash(value);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)};
function providerReceipt(event) {
 const keys={number:['receiptNumber','receipt_number','checkNumber','check_number','fiscalReceiptNumber','fiscal_receipt_number'],url:['receiptUrl','receipt_url','checkUrl','check_url','fiscalReceiptUrl','fiscal_receipt_url'],bank:['bankStatus','bank_status','paymentStatus','payment_status'],fiscal:['fiscalStatus','fiscal_status','receiptStatus','receipt_status']};
 const found={number:null,url:null,bank:null,fiscal:null};
 function walk(value){if(!value||typeof value!=='object'||Array.isArray(value))return;for(const [field,names]of Object.entries(keys)){if(found[field])continue;for(const name of names){if(typeof value[name]==='string'&&value[name].trim())found[field]=value[name].trim()}}for(const child of Object.values(value))walk(child)}
 walk(event);
 return found;
}
const refunded=alias=>`COALESCE((SELECT SUM(r.amount_minor) FROM getplatinum_refunds r WHERE r.order_id=${alias}.id AND r.status=4 AND r.currency='RUB' AND r.reason IS NULL),0)`;
export async function processGPEvent(env,event,bodyHash){
 if(!event||typeof event!=='object'||Array.isArray(event)||Object.hasOwn(event,'checksum'))deny(400,'gp_v2_callback_required');
 if(![1,9].includes(event.notificationType))return {ignored:true};
 const db=env.MEDIA_DB,o=await gpOrder(db,event.dealId);if(typeof event.isSuccess!=='boolean')deny(400,'gp_invalid_callback');
 if(event.notificationType===9)return refund(env,o,event,bodyHash);
 if(!event.isSuccess){if(event.paymentData!=null)deny(400,'gp_invalid_failed_callback');const key='gp.failed:'+o.id+':'+bodyHash,request_id=await opId(key);return operation(db,'getplatinum','gp.failed',o.id,{request_id,key},{ok:true},q=>[
  q('INSERT INTO getplatinum_events SELECT ?,?,1,?,?,NULL WHERE $guard',[key,o.id,bodyHash,time()]),
  q("UPDATE getplatinum_orders SET stage='failed',reason='payment_failed',revision=revision+1 WHERE order_id=? AND stage NOT IN('paid','refunded','review') AND $guard",[o.id]),
  q("UPDATE viewer_orders SET status='rejected',updated_at=? WHERE id=? AND status='pending_payment' AND NOT EXISTS(SELECT 1 FROM getplatinum_payments WHERE order_id=viewer_orders.id) AND $guard",[time(),o.id])
 ])}
 const p=event.paymentData;if(!p||!numeric(p.mdOrder)||!numeric(p.amount)||p.amount!==o.amount_minor||typeof p.currency!=='string'||p.currency.toUpperCase()!==o.currency)deny(400,'gp_payment_mismatch');
 const existing=await db.prepare('SELECT * FROM getplatinum_payments WHERE md_order=? OR order_id=?').bind(p.mdOrder,o.id).first();if(existing&&(existing.order_id!==o.id||existing.md_order!==p.mdOrder||existing.amount_minor!==p.amount||existing.currency!==o.currency))deny(409,'gp_payment_identity_conflict');
 if(o.md_order&&o.md_order!==p.mdOrder)deny(409,'gp_payment_identity_conflict');if(await db.prepare('SELECT 1 FROM getplatinum_refunds WHERE order_id=? AND md_order!=?').bind(o.id,p.mdOrder).first())deny(409,'gp_payment_identity_conflict');
 const key='gp.paid:'+p.mdOrder,request_id=await opId(key),confirmed=time();let start,end;try{[start,end]=dates(o.policy,confirmed)}catch{start=confirmed;end=confirmed;}
 const uncertainRefund=await db.prepare("SELECT 1 FROM getplatinum_refunds WHERE order_id=? AND status=4 AND reason IS NOT NULL").bind(o.id).first();
 const blocked= o.course_id
  ?await db.prepare("SELECT 1 FROM access_blocks WHERE viewer_id=? AND kind='course' AND product_id=?").bind(o.viewer_id,o.course_id).first()
  :await db.prepare("SELECT 1 FROM access_blocks b WHERE viewer_id=? AND ((kind='video' AND product_id=?) OR (kind='course' AND EXISTS(SELECT 1 FROM platform_lessons WHERE course_id=b.product_id AND video_id=?)))").bind(o.viewer_id,o.video_id,o.video_id).first();
 const reason=end<=start?'access_period_ended':uncertainRefund?'refund_details_missing':blocked?'access_restricted':null;
 const receipt=providerReceipt(event);
 return operation(db,'getplatinum','gp.paid',o.id,{request_id,mdOrder:p.mdOrder,amount:p.amount,currency:o.currency},{ok:true},q=>[
  q('INSERT INTO getplatinum_payments SELECT ?,?,?,?,? WHERE $guard',[p.mdOrder,o.id,p.amount,o.currency,confirmed]),
  q("INSERT INTO payment_receipts(id,order_id,provider,status,receipt_number,receipt_url,bank_status,fiscal_status,refund_status,amount_minor,currency,buyer_email,received_at,updated_at) SELECT 'gp:'+CAST(? AS TEXT),?, 'getplatinum', 'confirmed',?,?,?,?,'none',?,?,(SELECT email FROM viewer_accounts WHERE id=(SELECT viewer_id FROM viewer_orders WHERE id=?)),?,? WHERE $guard ON CONFLICT(id) DO UPDATE SET status='confirmed',receipt_number=COALESCE(payment_receipts.receipt_number,excluded.receipt_number),receipt_url=COALESCE(payment_receipts.receipt_url,excluded.receipt_url),bank_status=COALESCE(payment_receipts.bank_status,excluded.bank_status),fiscal_status=COALESCE(payment_receipts.fiscal_status,excluded.fiscal_status),refund_status='none',updated_at=excluded.updated_at",[p.mdOrder,o.id,receipt.number,receipt.url,receipt.bank,receipt.fiscal,p.amount,o.currency,o.id,confirmed,confirmed]),
  q('INSERT INTO getplatinum_events SELECT ?,?,1,?,?,? WHERE $guard',[key,o.id,bodyHash,confirmed,reason]),
  q("UPDATE getplatinum_orders SET md_order=?,paid_at=COALESCE(paid_at,?),stage=CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM getplatinum_refunds WHERE order_id=getplatinum_orders.order_id AND status=4 AND currency='RUB' AND reason IS NULL),0)>=? THEN 'refunded' WHEN ? IS NOT NULL THEN 'review' ELSE 'paid' END,reason=?,revision=revision+1 WHERE order_id=? AND $guard",[p.mdOrder,confirmed,o.amount_minor,reason,reason,o.id]),
  q(`UPDATE viewer_orders SET status=CASE WHEN ${refunded('viewer_orders')}>=amount_minor THEN 'rejected' ELSE 'paid' END,access_expires_at=?,updated_at=?,revision=revision+1 WHERE id=? AND $guard`,[end>start?end:null,confirmed,o.id]),
  q(`INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,source_order_id,created_at) SELECT ?,v.viewer_id,v.video_id,?,?,'getplatinum',v.id,? FROM viewer_orders v WHERE v.id=? AND ?>? AND ${refunded('v')}<v.amount_minor AND NOT EXISTS(SELECT 1 FROM getplatinum_refunds WHERE order_id=v.id AND status=4 AND reason IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=v.viewer_id AND ((b.kind='video' AND b.product_id=v.video_id) OR (b.kind='course' AND EXISTS(SELECT 1 FROM platform_lessons l WHERE l.course_id=b.product_id AND l.video_id=v.video_id)))) AND $guard`,[crypto.randomUUID(),start,end,confirmed,o.id,end,start])
  ,
   q(`INSERT INTO viewer_grants(id,viewer_id,course_id,starts_at,expires_at,granted_by,source_order_id,created_at) SELECT ?,v.viewer_id,v.course_id,?,?,'getplatinum',v.id,? FROM viewer_orders v WHERE v.id=? AND v.course_id IS NOT NULL AND ?>? AND ${refunded('v')}<v.amount_minor AND NOT EXISTS(SELECT 1 FROM getplatinum_refunds WHERE order_id=v.id AND status=4 AND reason IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=v.viewer_id AND b.kind='course' AND b.product_id=v.course_id) AND $guard`,[crypto.randomUUID(),start,end,confirmed,o.id,end,start])
 ],{sql:'NOT EXISTS(SELECT 1 FROM getplatinum_payments WHERE md_order=? OR order_id=?)',args:[p.mdOrder,o.id]});
}
async function refund(env,o,event,bodyHash){
 const r=event.refundData;if(!r||!numeric(r.refundId)||!numeric(r.mdOrder)||![2,4].includes(r.status)||event.isSuccess!==(r.status===4)||o.md_order&&o.md_order!==r.mdOrder)deny(400,'gp_refund_mismatch');
 const missing=r.amount==null||r.currency==null;if(!missing&&(!numeric(r.amount)||r.amount>o.amount_minor||typeof r.currency!=='string'||r.currency.toUpperCase()!==o.currency))deny(400,'gp_refund_mismatch');
 const old=await env.MEDIA_DB.prepare('SELECT * FROM getplatinum_refunds WHERE refund_id=?').bind(r.refundId).first();if(old&&(old.order_id!==o.id||old.md_order!==r.mdOrder||old.status!==r.status||old.amount_minor!==(missing?null:r.amount)||old.currency!==(missing?null:o.currency)))deny(409,'gp_refund_identity_conflict');
 if(!old&&r.status===4&&!missing){const total=await env.MEDIA_DB.prepare("SELECT COALESCE(SUM(amount_minor),0) total FROM getplatinum_refunds WHERE order_id=? AND status=4 AND currency='RUB' AND reason IS NULL").bind(o.id).first();if(total.total+r.amount>o.amount_minor)deny(400,'gp_refund_exceeds_payment')}
 const key='gp.refund:'+r.refundId,request_id=await opId(key),reason=missing?'refund_details_missing':null;
 return operation(env.MEDIA_DB,'getplatinum','gp.refund',o.id,{request_id,refundId:r.refundId,mdOrder:r.mdOrder,status:r.status,amount:missing?null:r.amount,currency:missing?null:o.currency},{ok:true},q=>[
  q('INSERT INTO getplatinum_refunds SELECT ?,?,?,?,?,?,?,?,? WHERE $guard',[r.refundId,o.id,r.mdOrder,r.status,missing?null:r.amount,missing?null:o.currency,bodyHash,time(),reason]),
  q("INSERT INTO payment_receipts(id,order_id,provider,status,receipt_number,receipt_url,bank_status,fiscal_status,refund_status,amount_minor,currency,buyer_email,received_at,updated_at) SELECT 'gp:'+CAST(? AS TEXT),?, 'getplatinum',CASE WHEN ?=4 THEN 'refunded' ELSE 'refund_pending' END,NULL,NULL,NULL,NULL,CASE WHEN ?=4 THEN 'refunded' ELSE 'pending' END,?,?,(SELECT email FROM viewer_accounts WHERE id=(SELECT viewer_id FROM viewer_orders WHERE id=?)),?,? WHERE $guard ON CONFLICT(id) DO UPDATE SET status=excluded.status,refund_status=excluded.refund_status,amount_minor=COALESCE(excluded.amount_minor,payment_receipts.amount_minor),updated_at=excluded.updated_at",[r.mdOrder,o.id,r.status,r.status,missing?null:r.amount,missing?null:o.currency,o.id,time(),time()]),
  q('INSERT INTO getplatinum_events SELECT ?,?,9,?,?,? WHERE $guard',[key,o.id,bodyHash,time(),reason]),
  q("UPDATE getplatinum_orders SET stage='review',reason='refund_details_missing',revision=revision+1 WHERE order_id=? AND ?=1 AND stage!='refunded' AND $guard",[o.id,missing&&r.status===4?1:0]),
  q(`UPDATE getplatinum_orders SET stage='refunded',reason=NULL,revision=revision+1 WHERE order_id=? AND COALESCE((SELECT SUM(amount_minor) FROM getplatinum_refunds WHERE order_id=getplatinum_orders.order_id AND status=4 AND currency='RUB' AND reason IS NULL),0)>=? AND $guard`,[o.id,o.amount_minor]),
  q(`UPDATE viewer_orders SET status='rejected',updated_at=?,revision=revision+1 WHERE id=? AND ${refunded('viewer_orders')}>=amount_minor AND $guard`,[time(),o.id]),
  q("UPDATE viewer_grants SET revoked_at=?,sales_revision=sales_revision+1 WHERE source_order_id=? AND revoked_at IS NULL AND COALESCE((SELECT SUM(amount_minor) FROM getplatinum_refunds WHERE order_id=viewer_grants.source_order_id AND status=4 AND currency='RUB' AND reason IS NULL),0)>=? AND $guard",[time(),o.id,o.amount_minor])
 ],{sql:"NOT EXISTS(SELECT 1 FROM getplatinum_refunds WHERE refund_id=?) AND (?!=4 OR ? IS NULL OR COALESCE((SELECT SUM(amount_minor) FROM getplatinum_refunds WHERE order_id=? AND status=4 AND currency='RUB' AND reason IS NULL),0)+?<=?)",args:[r.refundId,r.status,missing?null:r.amount,o.id,missing?0:r.amount,o.amount_minor]});
}
