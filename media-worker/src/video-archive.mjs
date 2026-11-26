import {deny,time} from './platform-data.mjs';
export const notArchived=(alias='videos')=>`NOT EXISTS(SELECT 1 FROM video_archives va WHERE va.video_id=${alias}.id)`;
export async function ensureDeletable(db,id){
 if(await db.prepare('SELECT 1 FROM viewer_orders WHERE video_id=? UNION ALL SELECT 1 FROM viewer_grants WHERE video_id=? UNION ALL SELECT 1 FROM platform_lessons WHERE video_id=? LIMIT 1').bind(id,id,id).first())deny(409,'video_has_dependencies');
}
export async function archiveVideo(db,staff,id,revision,restore=false){
 const nonce=crypto.randomUUID(),now=time(),guard='EXISTS(SELECT 1 FROM videos WHERE id=? AND mutation_id=?)';
 const result=await db.batch([
 db.prepare("UPDATE videos SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state!='deleted' AND NOT EXISTS(SELECT 1 FROM bunny_leases WHERE video_id=videos.id AND expires_at>?)").bind(nonce,new Date().toISOString(),id,revision,now),
 restore?db.prepare(`DELETE FROM video_archives WHERE video_id=? AND ${guard}`).bind(id,id,nonce):db.prepare(`INSERT INTO video_archives SELECT ?,?,? WHERE ${guard} ON CONFLICT(video_id) DO NOTHING`).bind(id,now,staff.sub,id,nonce),
 db.prepare(`INSERT INTO platform_audit SELECT ?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),staff.sub,restore?'video.restored':'video.archived',id,now,id,nonce)]);
 if(!result[0].meta.changes)deny(409,'revision_conflict');return {ok:true,archived:!restore};
}
