import {deny,time,rows,decode,requireOwner,courseAccess,audit,idPattern} from './platform-data.mjs';
import {input,text,revision} from './platform-http.mjs';
import {operation,participant} from './sales-core.mjs';
import {eventSettings,eventCheckout,eventError,eventAccess} from './program-events-core.mjs';
const validId=id=>{if(!idPattern.test(id||''))deny(400,'invalid_identifier')};
const publicFields='e.course_id,e.starts_at,e.timezone,e.duration_minutes,e.speaker,e.speaker_photo,e.capacity,e.registration_open,e.show_home,e.lifecycle,e.zoom_opens_at,e.revision';
export async function publicEvent(db,id){return db.prepare('SELECT '+publicFields+' FROM program_events e WHERE e.course_id=?').bind(id).first()}
export async function publicEventList(db,home=false){return {items:(await rows(db.prepare(`SELECT ${publicFields},c.title,c.description,c.access,c.price_minor,c.currency,EXISTS(SELECT 1 FROM course_covers cc WHERE cc.course_id=c.id) AS has_cover FROM program_events e JOIN platform_courses c ON c.id=e.course_id WHERE c.state='published' ${home?"AND e.show_home=1 AND e.lifecycle='scheduled' AND e.starts_at>?":''} ORDER BY e.starts_at LIMIT 200`).bind(...(home?[time()]:[])))).map(decode)}}
async function state(db,viewer,id){
 const e=await publicEvent(db,id);if(!e)deny(404,'event_not_found');const r=await db.prepare('SELECT * FROM program_event_registrations WHERE course_id=? AND viewer_id=?').bind(id,viewer.id).first(),access=await eventAccess(db,viewer,id);
 const o=r?.order_id?await db.prepare('SELECT o.status,g.stage,g.payment_url,COALESCE((SELECT SUM(amount_minor) FROM getplatinum_refunds WHERE order_id=o.id AND status=4 AND reason IS NULL),0) AS refunded_minor FROM viewer_orders o LEFT JOIN getplatinum_orders g ON g.order_id=o.id WHERE o.id=? AND o.viewer_id=?').bind(r.order_id,viewer.id).first():null;
 return {...e,registered:!!r,has_access:access,registration_status:access?'confirmed':o?.refunded_minor>0?'refunded':o?.stage|| (r?'restricted':'not_registered'),order_id:r?.order_id||null,zoom_available:access&&e.lifecycle==='scheduled'&&time()>=e.zoom_opens_at&&time()<e.starts_at+e.duration_minutes*60,recordings_separate:true};
}
export async function viewerEvents(request,env,viewer,path,method){
 const db=env.MEDIA_DB;if(!path&&method==='GET'){const list=await rows(db.prepare('SELECT DISTINCT e.course_id,c.title,c.description FROM program_events e JOIN platform_courses c ON c.id=e.course_id LEFT JOIN program_event_registrations r ON r.course_id=e.course_id AND r.viewer_id=? WHERE r.id IS NOT NULL OR EXISTS(SELECT 1 FROM viewer_grants g WHERE g.course_id=e.course_id AND g.viewer_id=?) ORDER BY e.starts_at').bind(viewer.id,viewer.id));const items=[];for(const row of list)items.push({...decode(row),...await state(db,viewer,row.course_id)});return {items}}
 const m=path.match(/^([a-f0-9-]{36})(?:\/(register|zoom|payment))?$/);if(!m)deny(404,'not_found');const id=m[1];validId(id);
 const course=await db.prepare("SELECT * FROM platform_courses WHERE id=? AND state IN('published','archived')").bind(id).first();if(!course)deny(404,'event_not_found');
 if(!m[2]&&method==='GET')return state(db,viewer,id);
 if(m[2]==='payment'&&method==='POST'){
  await input(request,[]);const {gpCheckoutReady}=await import('./getplatinum-checkout.mjs');if(!await gpCheckoutReady(env))deny(503,'gp_checkout_disabled');
  const o=await db.prepare("SELECT g.payment_url,o.amount_minor,o.currency FROM program_event_registrations r JOIN viewer_orders o ON o.id=r.order_id JOIN getplatinum_orders g ON g.order_id=o.id WHERE r.course_id=? AND r.viewer_id=? AND o.viewer_id=? AND g.stage='ready' AND o.status='pending_payment'").bind(id,viewer.id,viewer.id).first();
  if(!o)deny(409,'event_payment_not_ready');if(await eventAccess(db,viewer,id))deny(409,'access_already_available');return o;
 }
 if(m[2]==='register'&&method==='POST'){
  const d=await input(request,['request_id']);await participant(db,viewer.id);await eventCheckout(db,id);if(course.state!=='published')deny(409,'event_registration_closed');
  const old=await db.prepare('SELECT 1 FROM program_event_registrations WHERE course_id=? AND viewer_id=?').bind(id,viewer.id).first();if(old)return state(db,viewer,id);
  if(course.access!=='free')deny(409,'event_payment_required');const e=await eventSettings(db,id),until=Math.max(e.starts_at+e.duration_minutes*60,time()+1);
  try{await operation(db,viewer.id,'event.register',id,d,{ok:true},q=>[
   q('INSERT INTO program_event_registrations(id,course_id,viewer_id,registered_at) SELECT ?,?,?,? WHERE $guard ON CONFLICT(course_id,viewer_id) DO NOTHING',[crypto.randomUUID(),id,viewer.id,time()]),
   q("INSERT INTO viewer_grants(id,viewer_id,course_id,starts_at,expires_at,granted_by,created_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM viewer_grants WHERE viewer_id=? AND course_id=? AND granted_by='event.free') AND $guard",[crypto.randomUUID(),viewer.id,id,time(),until,'event.free',time(),viewer.id,id])
  ],{sql:"EXISTS(SELECT 1 FROM program_events e JOIN platform_courses c ON c.id=e.course_id WHERE e.course_id=? AND e.revision=? AND e.registration_open=1 AND e.lifecycle='scheduled' AND e.starts_at>? AND c.state='published' AND c.access='free')",args:[id,e.revision,time()]})}catch(error){eventError(error)}return state(db,viewer,id);
 }
 if(m[2]==='zoom'&&method==='POST'){
  await input(request,[]);const e=await eventSettings(db,id);if(!e||!await eventAccess(db,viewer,id))deny(403,'event_access_required');
  if(e.lifecycle!=='scheduled'||time()<e.zoom_opens_at||time()>=e.starts_at+e.duration_minutes*60)deny(403,'event_zoom_not_open');
  const secret=await db.prepare('SELECT zoom_url,zoom_password FROM program_event_secrets WHERE course_id=?').bind(id).first();if(!secret)deny(409,'event_zoom_unavailable');
  // Closed, authenticated response only; never included in public state or audit.
  return {url:secret.zoom_url,password:secret.zoom_password};
 }
 deny(405,'method_not_allowed');
}
const csvCell=v=>{let value=String(v??'');if(/^(?:\s*[=+@\-]|[\t\r\n])/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"'};
export async function eventAdmin(request,env,staff,path,method){
 requireOwner(staff);const db=env.MEDIA_DB,m=path.match(/^([a-f0-9-]{36})(?:\/(participants|csv|grant|revoke|recording|speaker-photo))?$/);if(!m)deny(404,'not_found');const id=m[1];validId(id);
 const course=await db.prepare("SELECT c.*,p.program_type FROM platform_courses c LEFT JOIN program_settings p ON p.course_id=c.id WHERE c.id=?").bind(id).first();if(!course)deny(404,'course_not_found');
 if(!m[2]&&method==='GET')return {event:await publicEvent(db,id),has_zoom:!!await db.prepare('SELECT 1 FROM program_event_secrets WHERE course_id=?').bind(id).first()};
 if(m[2]==='speaker-photo'&&method==='PUT'){
  if(!await eventSettings(db,id))deny(404,'event_not_found');const mime=request.headers.get('Content-Type');if(!['image/jpeg','image/png','image/webp'].includes(mime))deny(415,'invalid_cover');
  const reader=request.body?.getReader();if(!reader)deny(400,'invalid_cover');let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();deny(413,'cover_too_large')}chunks.push(value)}if(size<12)deny(400,'invalid_cover');const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}
  await db.batch([db.prepare('INSERT INTO program_event_images VALUES(?,?,?) ON CONFLICT(course_id) DO UPDATE SET mime=excluded.mime,bytes=excluded.bytes').bind(id,mime,bytes),db.prepare('UPDATE program_events SET speaker_photo=?,revision=revision+1 WHERE course_id=?').bind('/api/platform/event-images/'+id,id)]);await audit(db,staff.sub,'event.speaker_photo',id);return {ok:true};
 }
 if(!m[2]&&method==='PUT'){
  if((course.program_type||course.kind)!=='seminar')deny(400,'event_seminar_required');const d=await input(request,['revision','starts_at','timezone','duration_minutes','speaker','speaker_photo','capacity','registration_open','show_home','lifecycle','zoom_opens_at','zoom_url','zoom_password','clear_zoom']);
  if(!Number.isSafeInteger(d.starts_at)||d.starts_at<1||!Number.isInteger(d.duration_minutes)||d.duration_minutes<1||d.duration_minutes>1440||d.capacity!==null&&(!Number.isInteger(d.capacity)||d.capacity<1||d.capacity>100000)||![0,1].includes(d.registration_open)||![0,1].includes(d.show_home)||!['scheduled','completed'].includes(d.lifecycle)||!Number.isSafeInteger(d.zoom_opens_at)||d.zoom_opens_at<1||d.zoom_opens_at>d.starts_at+d.duration_minutes*60)deny(400,'invalid_event_settings');
  if(typeof d.timezone!=='string'||!d.timezone.trim()||d.timezone.length>80)deny(400,'invalid_event_timezone');const zone=text(d.timezone,80,true);try{new Intl.DateTimeFormat('en',{timeZone:zone})}catch{deny(400,'invalid_event_timezone')}
  const speaker=text(d.speaker||'',180),photo=text(d.speaker_photo||'',1024);if(photo&&photo!=='/api/platform/event-images/'+id&&(!photo.startsWith('/assets/')||photo.includes('..')||/[?#]/.test(photo)))deny(400,'invalid_speaker_photo');
  const old=await eventSettings(db,id);if(!old&&await db.prepare("SELECT 1 FROM platform_lessons l JOIN videos v ON v.id=l.video_id WHERE l.course_id=? AND v.access='free' LIMIT 1").bind(id).first())deny(409,'event_public_recording');if(!old&&(await db.prepare('SELECT 1 FROM viewer_orders WHERE course_id=? UNION ALL SELECT 1 FROM viewer_grants WHERE course_id=? LIMIT 1').bind(id,id).first()))deny(409,'event_existing_rights');if((old?.revision||0)!==d.revision)deny(409,'revision_conflict');
  const url=text(d.zoom_url||'',2048),password=text(d.zoom_password||'',128);if(url){let u;try{u=new URL(url)}catch{deny(400,'invalid_zoom_url')}if(u.protocol!=='https:'||!/(^|\.)zoom\.(us|com)$/.test(u.hostname)||u.username||u.password||u.port||u.hash||!/^\/(j|my|w)\//.test(u.pathname))deny(400,'invalid_zoom_url')}
  if(d.registration_open&&!url&&!await db.prepare('SELECT 1 FROM program_event_secrets WHERE course_id=?').bind(id).first())deny(409,'event_zoom_required');if(d.registration_open&&d.clear_zoom)deny(400,'event_zoom_required');
  const receipt=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM platform_audit WHERE id=?)',statements=[db.prepare(`INSERT INTO platform_audit SELECT ?,?,'event.settings',?,? WHERE COALESCE((SELECT revision FROM program_events WHERE course_id=?),0)=? AND (EXISTS(SELECT 1 FROM program_events WHERE course_id=?) OR (NOT EXISTS(SELECT 1 FROM viewer_orders WHERE course_id=?) AND NOT EXISTS(SELECT 1 FROM viewer_grants WHERE course_id=?)))`).bind(receipt,staff.sub,id,time(),id,d.revision,id,id,id),db.prepare(`INSERT INTO program_events(course_id,starts_at,timezone,duration_minutes,speaker,speaker_photo,capacity,registration_open,show_home,lifecycle,zoom_opens_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(course_id) DO UPDATE SET starts_at=excluded.starts_at,timezone=excluded.timezone,duration_minutes=excluded.duration_minutes,speaker=excluded.speaker,speaker_photo=excluded.speaker_photo,capacity=excluded.capacity,registration_open=excluded.registration_open,show_home=excluded.show_home,lifecycle=excluded.lifecycle,zoom_opens_at=excluded.zoom_opens_at,revision=program_events.revision+1`).bind(id,d.starts_at,zone,d.duration_minutes,speaker,photo,d.capacity,d.registration_open,d.show_home,d.lifecycle,d.zoom_opens_at,receipt)];
  if(d.clear_zoom)statements.push(db.prepare(`DELETE FROM program_event_secrets WHERE course_id=? AND ${guard}`).bind(id,receipt));else if(url)statements.push(db.prepare(`INSERT INTO program_event_secrets SELECT ?,?,? WHERE ${guard} ON CONFLICT(course_id) DO UPDATE SET zoom_url=excluded.zoom_url,zoom_password=CASE WHEN excluded.zoom_password='' THEN program_event_secrets.zoom_password ELSE excluded.zoom_password END`).bind(id,url,password,receipt));else if(password)statements.push(db.prepare(`UPDATE program_event_secrets SET zoom_password=? WHERE course_id=? AND ${guard}`).bind(password,id,receipt));
  try{const result=await db.batch(statements);if(!result[0].meta.changes)deny(409,'revision_conflict')}catch(error){eventError(error)}return {ok:true,revision:(old?.revision||0)+1};
 }
 if(['participants','csv'].includes(m[2])&&method==='GET'){
  const params=new URL(request.url).searchParams,page=Number(params.get('page')||1);if(!Number.isInteger(page)||page<1)deny(400,'invalid_query');
  const items=await rows(db.prepare(`SELECT r.id,r.viewer_id,r.registered_at,r.order_id,r.seat_held,a.first_name,a.last_name,CASE WHEN a.telegram_only=1 THEN NULL ELSE a.email END AS email,t.telegram_id,o.status AS payment_status,g.stage AS provider_status,COALESCE((SELECT SUM(amount_minor) FROM getplatinum_refunds WHERE order_id=o.id AND status=4 AND reason IS NULL),0) AS refunded_minor,(SELECT MAX(expires_at) FROM viewer_grants vg WHERE vg.viewer_id=r.viewer_id AND vg.course_id=r.course_id AND vg.revoked_at IS NULL AND (vg.source_order_id IS NULL OR EXISTS(SELECT 1 FROM viewer_orders vo WHERE vo.id=vg.source_order_id AND vo.status='paid'))) AS expires_at,EXISTS(SELECT 1 FROM access_blocks b WHERE b.viewer_id=r.viewer_id AND b.kind='course' AND b.product_id=r.course_id) AS blocked FROM program_event_registrations r JOIN viewer_accounts a ON a.id=r.viewer_id LEFT JOIN telegram_account_links t ON t.viewer_id=a.id LEFT JOIN viewer_orders o ON o.id=r.order_id LEFT JOIN getplatinum_orders g ON g.order_id=o.id WHERE r.course_id=? ORDER BY r.registered_at,r.id LIMIT ? OFFSET ?`).bind(id,m[2]==='csv'?10001:25,m[2]==='csv'?0:(page-1)*25));
  const count=(await db.prepare('SELECT COUNT(*) n FROM program_event_registrations WHERE course_id=?').bind(id).first()).n;
  if(m[2]==='csv'){if(count>10000)deny(413,'event_export_limit');const columns=['first_name','last_name','email','telegram_id','registered_at','payment_status','provider_status','refunded_minor','expires_at','blocked'];return new Response('\uFEFF'+columns.join(',')+'\r\n'+items.map(r=>columns.map(k=>csvCell(r[k])).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="event-participants.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}return {items,count,page,page_size:25};
 }
 if(['grant','revoke','recording'].includes(m[2])&&method==='POST'){
  const d=await input(request,['request_id','viewer_id','expires_at','video_id']);await participant(db,d.viewer_id);const e=await eventSettings(db,id);if(!e)deny(404,'event_not_found');
  if(m[2]==='recording'){
   validId(d.video_id);if(!await db.prepare("SELECT 1 FROM platform_lessons l JOIN videos v ON v.id=l.video_id WHERE l.course_id=? AND v.id=? AND v.state='published'").bind(id,d.video_id).first())deny(400,'event_recording_not_linked');if(!Number.isSafeInteger(d.expires_at)||d.expires_at<=time())deny(400,'invalid_expiry');
   return operation(db,staff.sub,'event.recording.grant',id,d,{ok:true},q=>[q('INSERT INTO viewer_grants(id,viewer_id,video_id,starts_at,expires_at,granted_by,created_at) SELECT ?,?,?,?,?,?,? WHERE $guard',[crypto.randomUUID(),d.viewer_id,d.video_id,time(),d.expires_at,staff.sub,time()])]);
  }
  try{return await operation(db,staff.sub,'event.'+m[2],id,d,{ok:true},q=>m[2]==='revoke'?[q("INSERT INTO access_blocks SELECT ?,'course',?,?,? WHERE $guard ON CONFLICT(viewer_id,kind,product_id) DO UPDATE SET actor=excluded.actor,created_at=excluded.created_at",[d.viewer_id,id,staff.sub,time()])]:[
   q('INSERT INTO program_event_registrations(id,course_id,viewer_id,registered_at) SELECT ?,?,?,? WHERE $guard ON CONFLICT(course_id,viewer_id) DO NOTHING',[crypto.randomUUID(),id,d.viewer_id,time()]),
   q("DELETE FROM access_blocks WHERE viewer_id=? AND kind='course' AND product_id=? AND $guard",[d.viewer_id,id]),
   q('INSERT INTO viewer_grants(id,viewer_id,course_id,starts_at,expires_at,granted_by,created_at) SELECT ?,?,?,?,?,?,? WHERE $guard',[crypto.randomUUID(),d.viewer_id,id,time(),Math.max(e.starts_at+e.duration_minutes*60,time()+1),staff.sub,time()])])}catch(error){eventError(error)}
 }
 deny(405,'method_not_allowed');
}
