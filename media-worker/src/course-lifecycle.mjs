import {deny,time} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';
export async function courseLifecycle(request,env,staff,id,restore=false){
 const db=env.MEDIA_DB,d=await input(request,['revision']),rev=revision(d.revision),course=await db.prepare('SELECT * FROM platform_courses WHERE id=?').bind(id).first();if(!course)deny(404,'course_not_found');
 const related="EXISTS(SELECT 1 FROM platform_lessons WHERE course_id=platform_courses.id) OR EXISTS(SELECT 1 FROM viewer_orders WHERE course_id=platform_courses.id) OR EXISTS(SELECT 1 FROM viewer_grants WHERE course_id=platform_courses.id)";
 const dependency=await db.prepare(`SELECT (${related}) AS linked FROM platform_courses WHERE id=?`).bind(id).first(),archive=!restore&&!!dependency.linked;
 if(restore&&course.state!=='archived')deny(409,'course_not_archived');
 const receipt=crypto.randomUUID(),action=restore?'course.restored':archive?'course.archived':'course.deleted',condition=restore?"state='archived'":archive?'1=1':`NOT (${related})`,guard='EXISTS(SELECT 1 FROM platform_audit WHERE id=?)';
 const statements=[db.prepare(`INSERT INTO platform_audit SELECT ?,?,?,id,? FROM platform_courses WHERE id=? AND revision=? AND ${condition}`).bind(receipt,staff.sub,action,time(),id,rev)];
 if(env.SALES_ENABLED==='true')statements.push(db.prepare(`${!restore&&!archive?'DELETE FROM sales_products':'UPDATE sales_products SET sale_enabled=0,revision=revision+1'} WHERE kind='course' AND product_id=? AND ${guard}`).bind(id,receipt));
 if(restore||archive)statements.push(db.prepare(`UPDATE platform_courses SET state=?,revision=revision+1,updated_at=? WHERE id=? AND ${guard}`).bind(restore?'published':'archived',time(),id,receipt));
 else statements.push(db.prepare(`DELETE FROM platform_courses WHERE id=? AND ${guard}`).bind(id,receipt));
 const result=await db.batch(statements);if(!result[0].meta.changes)deny(409,'revision_conflict');return {ok:true,action:restore?'restored':archive?'archived':'deleted'};
}
