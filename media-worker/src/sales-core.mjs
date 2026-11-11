import {deny,time,rows} from './platform-data.mjs';
import {verifiedIdentitySQL} from './viewer-identity.mjs';
import {product} from './platform-http.mjs';
export const FOREVER=253402300799;
export function enabled(env){return env.SALES_ENABLED==='true'}
export function publicEnabled(env){return enabled(env)&&env.SALES_PUBLIC_ENABLED==='true'}
export function automaticEnabled(env){return enabled(env)&&env.TRIBUTE_PAYMENTS_ENABLED==='true'}
export function uuid(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value))deny(400,'invalid_identifier');return value}
export function amount(value){if(!Number.isSafeInteger(value)||value<1||value>100000000)deny(400,'invalid_price');return value}
export function date(value){if(!Number.isSafeInteger(value)||value<1||value>FOREVER)deny(400,'invalid_dates');return value}
export function addMonths(seconds,months){const d=new Date(seconds*1000),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return Math.floor(d.getTime()/1000)}
export function policy(value,item){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','days','starts_at','ends_at'].includes(k)))deny(400,'invalid_policy');
 if(item?.kind==='school'){
  if(value.mode!=='school')deny(400,'school_dates_required');const starts=date(value.starts_at);return {mode:'school',starts_at:starts,training_ends_at:addMonths(starts,3),ends_at:addMonths(addMonths(starts,3),6)};
 }
 if(value.mode==='days'&&Number.isInteger(value.days)&&value.days>0&&value.days<=3660)return {mode:'days',days:value.days};
 if(value.mode==='lifetime')return {mode:'lifetime'};
 if(value.mode==='absolute'){const starts=date(value.starts_at),ends=date(value.ends_at);if(ends<=starts)deny(400,'invalid_dates');return {mode:'absolute',starts_at:starts,ends_at:ends}}
 deny(400,'invalid_policy');
}
export function dates(snapshot,at=time(),override){
 if(override){if(Object.keys(override).some(k=>!['starts_at','ends_at'].includes(k)))deny(400,'invalid_dates');const start=date(override.starts_at),end=date(override.ends_at);if(end<=start||end<=at)deny(400,'invalid_dates');return [start,end]}
 const p=typeof snapshot==='string'?JSON.parse(snapshot):snapshot;if(!p||typeof p!=='object')deny(400,'invalid_dates');
 const start=['school','absolute'].includes(p.mode)?p.starts_at:at,end=p.mode==='lifetime'?FOREVER:p.mode==='days'?start+p.days*86400:p.ends_at;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end<=at)deny(409,'access_period_ended');return [start,end];
}
export async function item(db,kind,id){const target=product({kind,id}),row=await db.prepare(`SELECT * FROM ${target.table} WHERE id=? AND state!='${kind==='video'?'deleted':'archived'}'`).bind(id).first();if(!row)deny(404,'product_not_found');return {...row,product_kind:kind,column:target.column,table:target.table}}
export async function participant(db,id){uuid(id);const row=await db.prepare(`SELECT a.id,CASE WHEN a.telegram_only=1 THEN NULL ELSE a.email END AS email FROM viewer_accounts a WHERE a.id=? AND a.status='active' AND ${verifiedIdentitySQL('a')}`).bind(id).first();if(!row)deny(400,'active_participant_required');return row}
export async function manager(env,staff){if(!enabled(env))return false;if(staff.role==='owner')return true;if(staff.role!=='publisher')return false;return !!(await env.MEDIA_DB.prepare('SELECT 1 FROM sales_managers WHERE access_sub=? AND active=1').bind(staff.sub).first())}
export async function order(db,id){uuid(id);const row=await db.prepare('SELECT o.*,s.source,s.state,s.policy,s.revision AS sales_revision,s.provider_uuid,s.shop_id,s.provider_stage,s.payment_url,s.last_payment_status FROM viewer_orders o JOIN sales_orders s ON s.order_id=o.id WHERE o.id=?').bind(id).first();if(!row)deny(404,'sales_order_not_found');return row}
export const balanceSQL="COALESCE((SELECT SUM(CASE direction WHEN 'received' THEN amount_minor ELSE -amount_minor END) FROM sales_payments WHERE order_id=sales_orders.order_id),0)";
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(canonical(value)))))].map(v=>v.toString(16).padStart(2,'0')).join('')}
// Every mutation is conditional on a nonce inserted by THIS atomic batch.
// A concurrent replay cannot apply its own statements using a previous receipt.
export async function operation(db,actor,action,target,data,result,build,condition={sql:'1=1',args:[]}){
 const id=uuid(data.request_id),digest=await hash(data),old=await db.prepare('SELECT * FROM sales_operations WHERE id=?').bind(id).first();
 const replay=row=>{if(row.actor!==actor||row.action!==action||row.target!==target||row.request_hash!==digest)deny(409,'request_conflict');return JSON.parse(row.result)};
 if(old)return replay(old);
 const nonce=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM sales_operations WHERE id=? AND nonce=?)',g=[id,nonce];
 const q=(sql,args=[])=>db.prepare(sql.replaceAll('$guard',guard)).bind(...args,...g);
 const first=db.prepare(`INSERT INTO sales_operations SELECT ?,?,?,?,?,?,?,? WHERE ${condition.sql} ON CONFLICT(id) DO NOTHING`).bind(id,nonce,actor,action,target,digest,JSON.stringify(result),time(),...condition.args);
 const applied=await db.batch([first,...build(q)]);
 if(!applied[0].meta.changes){const row=await db.prepare('SELECT * FROM sales_operations WHERE id=?').bind(id).first();if(row)return replay(row);deny(409,'revision_conflict')}
 return result;
}
export function createGrant(q,viewer,kind,id,start,end,actor,source=null,grantId=crypto.randomUUID()){
 return q(`INSERT INTO viewer_grants(id,viewer_id,${kind==='course'?'course_id':'video_id'},starts_at,expires_at,granted_by,source_order_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE $guard`,[grantId,viewer,id,start,end,actor,source,time()]);
}
export async function products(db){
 const result=[];for(const kind of ['video','course']){const table=kind==='video'?'videos':'platform_courses',column=kind+'_id';
  const found=await rows(db.prepare(`SELECT '${kind}' AS product_kind,p.id,p.title,p.description,${kind==='course'?'p.kind,':'p.publish_at,p.source_type,p.bunny_status,'}p.access,p.price_minor,p.currency,p.state,p.revision,s.policy,s.sale_enabled,s.revision AS policy_revision,
   (SELECT COUNT(*) FROM viewer_orders o WHERE o.${column}=p.id AND o.status='paid') AS purchases,
   (SELECT COUNT(*) FROM viewer_grants g WHERE g.${column}=p.id AND g.revoked_at IS NULL AND g.expires_at>?) AS grants
   FROM ${table} p LEFT JOIN sales_products s ON s.kind=? AND s.product_id=p.id WHERE p.state!=? ORDER BY p.updated_at DESC LIMIT 200`).bind(time(),kind,kind==='video'?'deleted':'archived'));
  result.push(...found.map(p=>({...p,policy:p.policy?JSON.parse(p.policy):null})));
 }return result;
}
