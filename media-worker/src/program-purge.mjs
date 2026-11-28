import {deny,time,requireOwner} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';

// Configuration is removable; participant, financial and material history is not.
// Keep the same predicate in the atomic receipt, not only in a preflight read.
const dependencies={
 payments:"EXISTS(SELECT 1 FROM viewer_orders o WHERE o.course_id=platform_courses.id AND (EXISTS(SELECT 1 FROM sales_payments p WHERE p.order_id=o.id) OR EXISTS(SELECT 1 FROM getplatinum_payments p WHERE p.order_id=o.id) OR EXISTS(SELECT 1 FROM getplatinum_refunds r WHERE r.order_id=o.id) OR EXISTS(SELECT 1 FROM payment_receipts r WHERE r.order_id=o.id)))",
 orders:'EXISTS(SELECT 1 FROM viewer_orders WHERE course_id=platform_courses.id)',
 registrations:'EXISTS(SELECT 1 FROM program_event_registrations WHERE course_id=platform_courses.id)',
 grants:'EXISTS(SELECT 1 FROM viewer_grants WHERE course_id=platform_courses.id)',
 lessons:'EXISTS(SELECT 1 FROM platform_lessons WHERE course_id=platform_courses.id)',
 streams:'EXISTS(SELECT 1 FROM program_settings WHERE parent_id=platform_courses.id)',
 access_history:"EXISTS(SELECT 1 FROM access_blocks WHERE kind='course' AND product_id=platform_courses.id) OR EXISTS(SELECT 1 FROM sales_operations WHERE target=platform_courses.id AND action IN('order.create','checkout','gp.checkout','gp.control.checkout','event.register','event.grant','event.revoke','event.recording.grant'))"
};
const related=Object.values(dependencies).map(sql=>'('+sql+')').join(' OR ');

export async function purgeProgram(request,env,staff,id){
 requireOwner(staff);const db=env.MEDIA_DB,d=await input(request,['revision','confirm_title']),rev=revision(d.revision),course=await db.prepare('SELECT * FROM platform_courses WHERE id=?').bind(id).first();
 if(!course)deny(404,'course_not_found');if(course.state!=='archived')deny(409,'course_archive_required');if(course.revision!==rev)deny(409,'revision_conflict');
 let title;try{title=JSON.parse(course.title)}catch{deny(409,'course_title_unavailable')}
 if(typeof d.confirm_title!=='string'||!d.confirm_title.trim()||![title.ru,title.en].includes(d.confirm_title))deny(400,'course_purge_confirmation_required');
 const linked=await db.prepare('SELECT '+Object.entries(dependencies).map(([key,sql])=>'('+sql+') AS '+key).join(',')+' FROM platform_courses WHERE id=?').bind(id).first();
 for(const key of Object.keys(dependencies))if(linked[key])deny(409,'course_purge_has_'+key);
 const receipt=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM platform_audit WHERE id=?)';
 const statements=[db.prepare(`INSERT INTO platform_audit SELECT ?,?,'course.purged',id,? FROM platform_courses WHERE id=? AND state='archived' AND revision=? AND NOT (${related})`).bind(receipt,staff.sub,time(),id,rev)];
 // No video, lesson, grant, account, order, payment or provider object is deleted.
 statements.push(db.prepare(`DELETE FROM program_event_session_secrets WHERE session_id IN(SELECT id FROM program_event_sessions WHERE course_id=?) AND ${guard}`).bind(id,receipt));
 for(const table of ['program_event_session_history','program_event_sessions','program_event_secrets','program_event_images','program_events','course_covers','program_settings'])statements.push(db.prepare(`DELETE FROM ${table} WHERE course_id=? AND ${guard}`).bind(id,receipt));
 statements.push(db.prepare(`DELETE FROM sales_products WHERE kind='course' AND product_id=? AND ${guard}`).bind(id,receipt));
 statements.push(db.prepare(`DELETE FROM platform_courses WHERE id=? AND ${guard}`).bind(id,receipt));
 const result=await db.batch(statements);if(!result[0].meta.changes)deny(409,'course_purge_conflict');if(!result.at(-1).meta.changes)deny(409,'course_purge_conflict');return {ok:true,action:'purged'};
}
