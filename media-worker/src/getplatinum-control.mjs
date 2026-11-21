import {deny,time,requireOwner,videoAccess,decode} from './platform-data.mjs';
import {participant,operation} from './sales-core.mjs';
import {input,revision} from './platform-http.mjs';
import {gpLiveReady,gpOrganization} from './getplatinum-api.mjs';
export const controlVideoId='fdebdb45-5504-49ad-8fac-208adc958959';
export const controlLink='/viewer-account.html?gp_control=1#gp-control';
export async function controlSettings(db){return db.prepare('SELECT * FROM getplatinum_control WHERE id=1').first()}
export async function controlAllowed(env,viewerId,orderId=null){
 const s=await controlSettings(env.MEDIA_DB);return !!(gpLiveReady(env)&&s?.enabled===1&&s.viewer_id===viewerId&&s.armed_until>time()&&(orderId?s.order_id===orderId:s.order_id===null));
}
export async function controlOffer(env,viewer){
 const s=await controlSettings(env.MEDIA_DB);if(!s?.viewer_id||s.viewer_id!==viewer.id)deny(403,'gp_control_participant_mismatch');await participant(env.MEDIA_DB,viewer.id);
 const video=await env.MEDIA_DB.prepare("SELECT id,title,price_minor,currency FROM videos WHERE id=? AND state='published' AND access='paid'").bind(controlVideoId).first();
 if(!video||video.price_minor!==10000||video.currency!=='RUB')deny(409,'gp_control_product_changed');
 return {provider:'getplatinum',video_id:video.id,title:decode(video).title,amount_minor:10000,currency:'RUB',policy:{mode:'days',days:60},receipt_contact_required:true,available:!s.order_id&&await controlAllowed(env,viewer.id),reason:s.order_id?'gp_control_consumed':!gpLiveReady(env)?'gp_control_live_disabled':s.enabled!==1?'gp_control_not_armed':s.armed_until<=time()?'gp_control_expired':null,order_id:s.order_id};
}
export async function controlAdmin(request,env,staff,path,method){
 requireOwner(staff);const db=env.MEDIA_DB,s=await controlSettings(db);
 if(path==='control'&&method==='GET'){const a=s.viewer_id?await db.prepare('SELECT email FROM viewer_accounts WHERE id=?').bind(s.viewer_id).first():null;return {control:s,email:a?.email||null,link:controlLink,video_id:controlVideoId,amount_minor:10000,days:60,live_enabled:env.GETPLATINUM_LIVE_ENABLED==='true'}}
 if(path==='control'&&method==='PUT'){
  const d=await input(request,['request_id','revision','email']);revision(d.revision);if(typeof d.email!=='string'||d.email.length>254)deny(400,'gp_control_email_required');if(s.order_id)deny(409,'gp_control_consumed');
  const a=await db.prepare('SELECT id FROM viewer_accounts WHERE email=? COLLATE NOCASE').bind(d.email.trim()).first();if(!a)deny(404,'gp_control_account_not_found');await participant(db,a.id);if((await videoAccess(db,a.id,controlVideoId))?.expires_at)deny(409,'access_already_available');
  return operation(db,staff.sub,'gp.control.prepare','1',d,{ok:true},q=>[q('UPDATE getplatinum_control SET viewer_id=?,enabled=0,armed_until=0,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[a.id,time(),staff.sub])],{sql:'EXISTS(SELECT 1 FROM getplatinum_control WHERE id=1 AND revision=? AND order_id IS NULL)',args:[d.revision]});
 }
 if(path==='control/arm'&&method==='POST'){
  const d=await input(request,['request_id','revision']);revision(d.revision);if(!gpLiveReady(env))deny(409,'gp_server_activation_required');if(!s.viewer_id)deny(409,'gp_control_account_required');await participant(db,s.viewer_id);const org=await gpOrganization(env);if(!org.isActive||!org.allowedVats.includes('none'))deny(409,'gp_organization_or_vat_unavailable');
  return operation(db,staff.sub,'gp.control.arm','1',d,{ok:true,expires_at:time()+1800},q=>[q('UPDATE getplatinum_control SET enabled=1,armed_until=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[time()+1800,time(),staff.sub])],{sql:'EXISTS(SELECT 1 FROM getplatinum_control WHERE id=1 AND revision=? AND viewer_id=? AND order_id IS NULL)',args:[d.revision,s.viewer_id]});
 }
 if(path==='control/close'&&method==='POST'){
  const d=await input(request,['request_id','revision']);revision(d.revision);return operation(db,staff.sub,'gp.control.close','1',d,{ok:true},q=>[q('UPDATE getplatinum_control SET enabled=0,armed_until=0,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[time(),staff.sub])],{sql:'EXISTS(SELECT 1 FROM getplatinum_control WHERE id=1 AND revision=?)',args:[d.revision]});
 }
 deny(404,'not_found');
}
