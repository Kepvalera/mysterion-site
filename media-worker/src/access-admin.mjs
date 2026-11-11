import {deny,time,rows,decode,requireOwner} from './platform-data.mjs';
import {input,revision,text} from './platform-http.mjs';
import {manager,operation,uuid,dates} from './sales-core.mjs';
export async function accessAdmin(request,env,staff,path,method){
 if(staff.role!=='owner'&&!await manager(env,staff))deny(403,'sales_manager_required');
 const db=env.MEDIA_DB;
 if(method==='GET'){
  const params=new URL(request.url).searchParams,filter=params.get('filter')||'active',query=text(params.get('q')||'',100),page=Number(params.get('page')||1),viewer=params.get('viewer');
  if(!['active','expired','revoked','all'].includes(filter)||!Number.isInteger(page)||page<1||page>100000)deny(400,'invalid_query');if(viewer)uuid(viewer);
  const at=time(),status="CASE WHEN g.revoked_at IS NOT NULL OR EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=g.viewer_id AND b.kind=CASE WHEN g.course_id IS NULL THEN 'video' ELSE 'course' END AND b.product_id=COALESCE(g.course_id,g.video_id)) THEN 'revoked' WHEN g.expires_at<=? THEN 'expired' ELSE 'active' END";
  const where=`(?='' OR instr(lower(a.email),lower(?))>0 OR instr(lower(a.first_name||' '||a.last_name),lower(?))>0 OR instr(a.first_name||' '||a.last_name,?)>0)${viewer?' AND g.viewer_id=?':''}`;
  // SQLite lower() is ASCII-only; additionally compare normalized Cyrillic.
  const ruUpper='АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',ruLower='абвгдеёжзийклмнопрстуфхцчшщъыьэюя';let name="lower(a.first_name||' '||a.last_name)";
  for(let i=0;i<ruUpper.length;i++)name=`replace(${name},'${ruUpper[i]}','${ruLower[i]}')`;
  const predicate=where.replace("instr(a.first_name||' '||a.last_name,?)",`instr(${name},?)`),args=[at,query,query,query,query.toLocaleLowerCase('ru'),...(viewer?[viewer]:[])];
  const base=`SELECT g.*,a.email,a.first_name,a.last_name,COALESCE(v.title,c.title) AS title,${status} AS access_status FROM viewer_grants g JOIN viewer_accounts a ON a.id=g.viewer_id LEFT JOIN videos v ON v.id=g.video_id LEFT JOIN platform_courses c ON c.id=g.course_id WHERE ${predicate}`;
  const tail=filter==='all'?'':' WHERE access_status=?',values=[...args,...(filter==='all'?[]:[filter])];
  const total=(await db.prepare(`SELECT COUNT(*) n FROM (${base})${tail}`).bind(...values).first()).n;
  const items=await rows(db.prepare(`SELECT * FROM (${base})${tail} ORDER BY created_at DESC,id LIMIT 25 OFFSET ?`).bind(...values,(page-1)*25));
  const participant=viewer?await db.prepare('SELECT id,email,first_name,last_name FROM viewer_accounts WHERE id=?').bind(viewer).first():null;
  return {items:items.map(decode),participant,page,pages:Math.max(1,Math.ceil(total/25)),total,filter};
 }
 const match=path.match(/^([a-f0-9-]{36})\/(revoke|restore|extend)$/);if(!match||method!=='POST')deny(404,'not_found');
 const data=await input(request,['request_id','revision','dates']),id=uuid(match[1]),action=match[2],old=await db.prepare('SELECT * FROM viewer_grants WHERE id=?').bind(id).first();if(!old)deny(404,'grant_not_found');
 const condition={sql:'EXISTS(SELECT 1 FROM viewer_grants WHERE id=? AND sales_revision=?)',args:[id,revision(data.revision)]},kind=old.course_id?'course':'video',target=old.course_id||old.video_id;
 if(action==='restore'){
  if(old.source_order_id&&!await db.prepare("SELECT 1 FROM viewer_orders WHERE id=? AND viewer_id=? AND status='paid'").bind(old.source_order_id,old.viewer_id).first())deny(409,'paid_order_required');
  if(old.expires_at<=time())deny(409,'extend_before_restore');
  condition.sql="EXISTS(SELECT 1 FROM viewer_grants g WHERE g.id=? AND g.sales_revision=? AND (g.source_order_id IS NULL OR EXISTS(SELECT 1 FROM viewer_orders o WHERE o.id=g.source_order_id AND o.viewer_id=g.viewer_id AND o.status='paid')))";
 }
 let range;if(action==='extend'){range=dates(null,time(),data.dates);if(range[1]<=old.expires_at)deny(400,'extension_required')}
 return operation(db,staff.sub,'access.'+action,id,data,{ok:true},q=>{
  if(action==='revoke')return [q('UPDATE viewer_grants SET revoked_at=?,sales_revision=sales_revision+1 WHERE id=? AND $guard',[time(),id]),q('INSERT INTO access_blocks SELECT ?,?,?,?,? WHERE $guard ON CONFLICT(viewer_id,kind,product_id) DO UPDATE SET actor=excluded.actor,created_at=excluded.created_at',[old.viewer_id,kind,target,staff.sub,time()])];
  if(action==='restore')return [q('UPDATE viewer_grants SET revoked_at=NULL,sales_revision=sales_revision+1 WHERE id=? AND $guard',[id]),q('DELETE FROM access_blocks WHERE viewer_id=? AND kind=? AND product_id=? AND $guard',[old.viewer_id,kind,target])];
  return [q('UPDATE viewer_grants SET starts_at=?,expires_at=?,sales_revision=sales_revision+1 WHERE id=? AND $guard',[...range,id])];
 },condition);
}
export async function currencyRates(request,env,staff){
 if(request.method==='GET')return env.MEDIA_DB.prepare('SELECT eur_rub,usd_rub,revision FROM display_currency_rates WHERE id=1').first();
 if(request.method!=='PUT')deny(405,'method_not_allowed');
 requireOwner(staff);const d=await input(request,['request_id','revision','eur_rub','usd_rub']);
 for(const value of [d.eur_rub,d.usd_rub])if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0.0001||value>1000000))deny(400,'invalid_exchange_rate');
 return operation(env.MEDIA_DB,staff.sub,'currency.rates','display',d,{ok:true},q=>[q('UPDATE display_currency_rates SET eur_rub=?,usd_rub=?,revision=revision+1 WHERE id=1 AND $guard',[d.eur_rub,d.usd_rub])],{sql:'EXISTS(SELECT 1 FROM display_currency_rates WHERE id=1 AND revision=?)',args:[revision(d.revision)]});
}
