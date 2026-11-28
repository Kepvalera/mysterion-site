import {deny,time,rows,decode,requireOwner} from './platform-data.mjs';
import {input,text,translations} from './platform-http.mjs';

const fields='s.id,s.course_id,s.title,s.position,s.starts_at,s.timezone,s.duration_minutes,s.speaker,s.zoom_opens_at,s.room_mode,s.lifecycle,s.revision';
export async function sessions(db,course,admin=false){return (await rows(db.prepare(`SELECT ${fields}${admin?',EXISTS(SELECT 1 FROM program_event_session_secrets z WHERE z.session_id=s.id) AS has_zoom':''} FROM program_event_sessions s WHERE s.course_id=? ORDER BY s.position,s.starts_at,s.id`).bind(course))).map(decode)}
export async function eventWindow(db,e){
 const s=await db.prepare("SELECT COUNT(*) n,MIN(CASE WHEN lifecycle!='cancelled' THEN starts_at END) first_at,MAX(CASE WHEN lifecycle!='cancelled' THEN starts_at+duration_minutes*60 END) ends_at FROM program_event_sessions WHERE course_id=?").bind(e.course_id).first();
 return s.n?{first_at:s.first_at,ends_at:s.ends_at,multi:true}:{first_at:e.starts_at,ends_at:e.starts_at+e.duration_minutes*60,multi:false};
}
export function zoomURL(value){const url=text(value||'',2048);if(url){let u;try{u=new URL(url)}catch{deny(400,'invalid_zoom_url')}if(u.protocol!=='https:'||!/(^|\.)zoom\.(us|com)$/.test(u.hostname)||u.username||u.password||u.port||u.hash||!/^\/(j|my|w)\//.test(u.pathname))deny(400,'invalid_zoom_url')}return url}
const history=`EXISTS(SELECT 1 FROM program_event_registrations WHERE course_id=?) OR EXISTS(SELECT 1 FROM viewer_orders WHERE course_id=?) OR EXISTS(SELECT 1 FROM viewer_grants WHERE course_id=?) OR EXISTS(SELECT 1 FROM access_blocks WHERE kind='course' AND product_id=?) OR EXISTS(SELECT 1 FROM sales_operations WHERE target=? AND action IN('event.register','event.grant','event.revoke','gp.checkout','gp.control.checkout','order.create','checkout'))`;
export async function sessionAdmin(request,db,staff,course,sessionId,method){
 requireOwner(staff);const e=await db.prepare('SELECT * FROM program_events WHERE course_id=?').bind(course).first();if(!e)deny(404,'event_not_found');
 if(method==='GET'&&!sessionId)return {items:await sessions(db,course,true),revision:e.revision};
 if(!['POST','PUT','DELETE'].includes(method)||method==='POST'&&sessionId||method!=='POST'&&!sessionId)deny(405,'method_not_allowed');
 const d=await input(request,['event_revision','revision','title','position','starts_at','timezone','duration_minutes','speaker','zoom_opens_at','room_mode','lifecycle','zoom_url','zoom_password']);
 if(d.event_revision!==e.revision)deny(409,'revision_conflict');
 const old=sessionId?await db.prepare('SELECT * FROM program_event_sessions WHERE id=? AND course_id=?').bind(sessionId,course).first():null;
 if(sessionId&&!old)deny(404,'event_session_not_found');if(old&&d.revision!==old.revision)deny(409,'revision_conflict');
 const before=await eventWindow(db,e),eligibilityEnd=before.ends_at??(await db.prepare('SELECT MAX(starts_at+duration_minutes*60) ends_at FROM program_event_sessions WHERE course_id=?').bind(course).first()).ends_at,now=time(),receipt=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM platform_audit WHERE id=?)';
 const editedId=sessionId||crypto.randomUUID();let deleting=method==='DELETE',cancel=false;
 if(deleting){
  if((await db.prepare('SELECT COUNT(*) n FROM program_event_sessions WHERE course_id=?').bind(course).first()).n<=1)deny(409,'event_last_session');
  cancel=!!(await db.prepare('SELECT ('+history+') AS n').bind(course,course,course,course,course).first()).n||old.starts_at<=now;
 }
 const statements=[db.prepare(`INSERT INTO platform_audit SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM program_events WHERE course_id=? AND revision=?)`).bind(receipt,staff.sub,deleting?(cancel?'event.session.cancel':'event.session.delete'):'event.session.save',sessionId||course,now,course,e.revision)];
 if(deleting&&!cancel)statements[0]=db.prepare(`INSERT INTO platform_audit SELECT ?,?,'event.session.delete',?,? WHERE EXISTS(SELECT 1 FROM program_events WHERE course_id=? AND revision=?) AND NOT (${history}) AND (SELECT COUNT(*) FROM program_event_sessions WHERE course_id=?)>1`).bind(receipt,staff.sub,sessionId,now,course,e.revision,course,course,course,course,course,course);
 const bind=(sql,args=[])=>db.prepare(sql+' AND '+guard).bind(...args,receipt);
 if(deleting){
  // History and last-row checks are repeated inside the same transaction.
  if(cancel)statements.push(bind("UPDATE program_event_sessions SET lifecycle='cancelled',revision=revision+1,updated_at=? WHERE id=? AND course_id=?",[now,sessionId,course]));
  else{
   const safe=` AND starts_at>? AND NOT (${history}) AND (SELECT COUNT(*) FROM program_event_sessions WHERE course_id=?)>1`;
   statements.push(db.prepare(`DELETE FROM program_event_session_secrets WHERE session_id=? AND EXISTS(SELECT 1 FROM program_event_sessions WHERE id=? AND course_id=? ${safe}) AND ${guard}`).bind(sessionId,sessionId,course,now,course,course,course,course,course,course,receipt));
   statements.push(db.prepare(`DELETE FROM program_event_sessions WHERE id=? AND course_id=? ${safe} AND ${guard}`).bind(sessionId,course,now,course,course,course,course,course,course,receipt));
  }
 }else{
  const title=translations(d.title,300,true),zone=text(d.timezone,80,true),speaker=text(d.speaker||'',180),url=zoomURL(d.zoom_url),password=text(d.zoom_password||'',128);
  try{new Intl.DateTimeFormat('en',{timeZone:zone})}catch{deny(400,'invalid_event_timezone')}
  if(!Number.isSafeInteger(d.starts_at)||d.starts_at<1||!Number.isInteger(d.position)||d.position<1||d.position>10000||!Number.isInteger(d.duration_minutes)||d.duration_minutes<1||d.duration_minutes>1440||!Number.isSafeInteger(d.zoom_opens_at)||d.zoom_opens_at<1||d.zoom_opens_at>d.starts_at+d.duration_minutes*60||!['common','own'].includes(d.room_mode)||!['scheduled','completed','cancelled'].includes(d.lifecycle))deny(400,'invalid_event_session');
  if(d.lifecycle==='scheduled'&&(d.room_mode==='common'?!await db.prepare('SELECT 1 FROM program_event_secrets WHERE course_id=?').bind(course).first():!url&&!await db.prepare('SELECT 1 FROM program_event_session_secrets WHERE session_id=?').bind(sessionId||'').first()))deny(409,'event_zoom_required');
  // First use explicitly promotes the legacy meeting, preserving its date and room.
  if(!before.multi){if(!await db.prepare('SELECT 1 FROM program_event_secrets WHERE course_id=?').bind(course).first())deny(409,'event_zoom_required');const firstId=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO program_event_sessions SELECT ?,?,?,1,?,?,?,?,?, 'common','scheduled',1,?,? WHERE ${guard}`).bind(firstId,course,JSON.stringify({ru:'Сессия 1',en:'Session 1'}),e.starts_at,e.timezone,e.duration_minutes,e.speaker,e.zoom_opens_at,now,now,receipt))}
  const id=editedId;
  statements.push(db.prepare(`INSERT INTO program_event_sessions(id,course_id,title,position,starts_at,timezone,duration_minutes,speaker,zoom_opens_at,room_mode,lifecycle,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET title=excluded.title,position=excluded.position,starts_at=excluded.starts_at,timezone=excluded.timezone,duration_minutes=excluded.duration_minutes,speaker=excluded.speaker,zoom_opens_at=excluded.zoom_opens_at,room_mode=excluded.room_mode,lifecycle=excluded.lifecycle,updated_at=excluded.updated_at,revision=program_event_sessions.revision+1`).bind(id,course,title,d.position,d.starts_at,zone,d.duration_minutes,speaker,d.zoom_opens_at,d.room_mode,d.lifecycle,now,now,receipt));
  if(url)statements.push(db.prepare(`INSERT INTO program_event_session_secrets SELECT ?,?,? WHERE ${guard} ON CONFLICT(session_id) DO UPDATE SET zoom_url=excluded.zoom_url,zoom_password=CASE WHEN excluded.zoom_password='' THEN program_event_session_secrets.zoom_password ELSE excluded.zoom_password END`).bind(id,url,password,receipt));
  else if(password)statements.push(bind('UPDATE program_event_session_secrets SET zoom_password=? WHERE session_id=?',[password,id]));
 }
 const snapshot=old?JSON.stringify(Object.fromEntries(['title','position','starts_at','timezone','duration_minutes','speaker','zoom_opens_at','room_mode','lifecycle','revision'].map(k=>[k,old[k]]))):null;
 statements.push(db.prepare(`INSERT INTO program_event_session_history SELECT ?,?,?,?,?,?,(SELECT json_object('title',title,'position',position,'starts_at',starts_at,'timezone',timezone,'duration_minutes',duration_minutes,'speaker',speaker,'zoom_opens_at',zoom_opens_at,'room_mode',room_mode,'lifecycle',lifecycle,'revision',revision) FROM program_event_sessions WHERE id=? AND course_id=?),?,(SELECT MAX(starts_at+duration_minutes*60) FROM program_event_sessions WHERE course_id=? AND lifecycle!='cancelled'),? WHERE ${guard}`).bind(crypto.randomUUID(),course,editedId,staff.sub,deleting?(cancel?'cancel':'delete'):'save',snapshot,editedId,course,before.ends_at,course,now,receipt));
 const last="(SELECT MAX(starts_at+duration_minutes*60) FROM program_event_sessions WHERE course_id=? AND lifecycle!='cancelled')";
 statements.push(bind(`UPDATE viewer_grants SET sales_revision=sales_revision+1,expires_at=${last} WHERE course_id=? AND revoked_at IS NULL AND expires_at>=? AND expires_at<${last} AND NOT EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=viewer_grants.viewer_id AND b.kind='course' AND b.product_id=viewer_grants.course_id) AND (source_order_id IS NULL OR (EXISTS(SELECT 1 FROM viewer_orders o WHERE o.id=source_order_id AND o.status='paid') AND NOT EXISTS(SELECT 1 FROM getplatinum_refunds r WHERE r.order_id=source_order_id AND r.status=4)))`,[course,course,eligibilityEnd||Number.MAX_SAFE_INTEGER,course]));
 statements.push(bind(`UPDATE program_events SET ${['starts_at','timezone','duration_minutes','zoom_opens_at'].map(field=>`${field}=COALESCE((SELECT ${field} FROM program_event_sessions WHERE course_id=? AND lifecycle!='cancelled' ORDER BY starts_at,id LIMIT 1),${field})`).join(',')},revision=revision+1 WHERE course_id=?`,[course,course,course,course,course]));
 const result=await db.batch(statements);if(!result[0].meta.changes)deny(409,deleting&&!cancel?'event_session_delete_conflict':'revision_conflict');if(deleting&&!cancel&&!result[2].meta.changes)deny(409,'event_session_delete_conflict');
 return {ok:true,action:deleting?(cancel?'cancelled':'deleted'):'saved',revision:e.revision+1};
}
export async function sessionZoom(db,viewer,course,id,access){
 const s=await db.prepare('SELECT s.*,e.lifecycle AS event_lifecycle FROM program_event_sessions s JOIN program_events e ON e.course_id=s.course_id WHERE s.id=? AND s.course_id=?').bind(id,course).first();if(!s)deny(404,'event_session_not_found');if(!access)deny(403,'event_access_required');
 if(s.event_lifecycle!=='scheduled'||s.lifecycle!=='scheduled'||time()<s.zoom_opens_at||time()>=s.starts_at+s.duration_minutes*60)deny(403,'event_zoom_not_open');
 const secret=s.room_mode==='common'?await db.prepare('SELECT zoom_url,zoom_password FROM program_event_secrets WHERE course_id=?').bind(course).first():await db.prepare('SELECT zoom_url,zoom_password FROM program_event_session_secrets WHERE session_id=?').bind(id).first();if(!secret)deny(409,'event_zoom_unavailable');return {url:secret.zoom_url,password:secret.zoom_password};
}
