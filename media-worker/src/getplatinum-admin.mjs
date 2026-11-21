import {requireOwner,deny,rows,decode,time} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';
import {operation} from './sales-core.mjs';
import {paymentProviderSettings} from './payment-provider.mjs';
import {gpLiveReady,gpOrganization,getplatinumTerminal} from './getplatinum-api.mjs';
export async function gpAdmin(request,env,staff,path,method){
 requireOwner(staff);const db=env.MEDIA_DB;
 if(path===''&&method==='GET')return {settings:await paymentProviderSettings(db),configured:!!env.GETPLATINUM_API_KEY,live_ready:gpLiveReady(env),terminal:getplatinumTerminal,orders:(await rows(db.prepare("SELECT o.id,o.viewer_id,o.title,o.amount_minor,o.currency,o.created_at,g.stage,g.reason,g.md_order,g.paid_at,COALESCE((SELECT SUM(r.amount_minor) FROM getplatinum_refunds r WHERE r.order_id=o.id AND r.status=4 AND r.reason IS NULL),0) AS refunded_minor,(SELECT COUNT(*) FROM getplatinum_refunds r WHERE r.order_id=o.id) AS refund_count FROM viewer_orders o JOIN getplatinum_orders g ON g.order_id=o.id ORDER BY o.created_at DESC LIMIT 100"))).map(decode)};
 if(path==='check'&&method==='POST'){await input(request,[]);try{const org=await gpOrganization(env);await db.prepare('UPDATE payment_provider_settings SET checked_at=?,check_status=? WHERE id=1').bind(time(),org.isActive?'active':'inactive').run();return {ok:true,...org}}catch(e){await db.prepare("UPDATE payment_provider_settings SET checked_at=?,check_status='unavailable' WHERE id=1").bind(time()).run();throw e}}
 if(path===''&&method==='PUT'){
  const d=await input(request,['request_id','revision','active_provider','gp_enabled','gp_vat']);revision(d.revision);
  if(!['tribute','getplatinum'].includes(d.active_provider)||![0,1].includes(d.gp_enabled)||d.gp_vat!==null&&!['none','0','5','7','10','22'].includes(d.gp_vat))deny(400,'gp_invalid_settings');
  if(d.active_provider==='getplatinum'&&!d.gp_enabled)deny(409,'gp_provider_disabled');
  if(d.gp_enabled){if(!gpLiveReady(env))deny(409,'gp_server_activation_required');if(!d.gp_vat)deny(409,'gp_vat_required');const org=await gpOrganization(env);if(!org.isActive||!org.allowedVats.includes(d.gp_vat))deny(409,'gp_organization_or_vat_unavailable')}
  return operation(db,staff.sub,'gp.settings','1',d,{ok:true},q=>[q('UPDATE payment_provider_settings SET active_provider=?,gp_enabled=?,gp_vat=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[d.active_provider,d.gp_enabled,d.gp_vat,time(),staff.sub])],{sql:'EXISTS(SELECT 1 FROM payment_provider_settings WHERE id=1 AND revision=?)',args:[d.revision]});
 }
 deny(404,'not_found');
}
