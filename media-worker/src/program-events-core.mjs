import {eventWindow} from './program-event-sessions.mjs';
import {deny,time,courseAccess,videoAccess} from './platform-data.mjs';
export const recordingScopeSQL="NOT EXISTS(SELECT 1 FROM program_events pe WHERE pe.course_id=c.id)";
export async function eventSettings(db,id){return db.prepare('SELECT * FROM program_events WHERE course_id=?').bind(id).first()}
export async function eventCheckout(db,id){const e=await eventSettings(db,id);const w=e?await eventWindow(db,e):null;if(e&&(e.registration_open!==1||e.lifecycle!=='scheduled'||!w.first_at||w.first_at<=time()))deny(409,'event_registration_closed');return e}
export async function eventLessonAccess(db,viewerId,courseId,videoId){
 if(await eventSettings(db,courseId)&&(!viewerId||!videoId||!(await videoAccess(db,viewerId,videoId))?.expires_at))deny(403,'event_recording_access_required');
}
export function eventError(error){const value=String(error?.message||'');for(const code of ['event_capacity_full','event_capacity_below_reserved','event_registration_closed','event_order_exists'])if(value.includes(code))deny(409,code);throw error}
export async function eventAccess(db,viewer,id){return !!(await courseAccess(db,viewer.id,id))?.expires_at}
