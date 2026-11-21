import {requireOwner,deny,time} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';
import {operation} from './sales-core.mjs';
import {gpLiveReady,gpOrganization} from './getplatinum-api.mjs';
import {gpPublicProduct} from './getplatinum-checkout.mjs';
export async function gpLaunch(request,env,staff,method){
 requireOwner(staff);const db=env.MEDIA_DB,s=await db.prepare('SELECT mode,purchases_paused,revision FROM site_display_settings WHERE id=1').first();
 if(method==='GET')return {...s,public_env_enabled:env.SALES_PUBLIC_ENABLED==='true'};
 if(method!=='PUT')deny(405,'method_not_allowed');const d=await input(request,['request_id','revision','enabled']);revision(d.revision);if(typeof d.enabled!=='boolean')deny(400,'invalid_fields');if(s.mode!=='services')deny(409,'gp_services_mode_required');
 if(d.enabled){if(!gpLiveReady(env)||env.SALES_PUBLIC_ENABLED!=='true')deny(409,'gp_public_server_activation_required');const settings=await db.prepare('SELECT active_provider,gp_enabled,gp_vat FROM payment_provider_settings WHERE id=1').first(),pub=await db.prepare('SELECT enabled FROM digital_public_sales WHERE id=1').first();if(settings.active_provider!=='getplatinum'||!settings.gp_enabled||settings.gp_vat!=='none'||!pub?.enabled)deny(409,'gp_public_settings_required');const org=await gpOrganization(env);if(!org.isActive||!org.allowedVats.includes('none'))deny(409,'gp_organization_or_vat_unavailable');const ids=(await db.prepare("SELECT product_id FROM sales_products WHERE kind='video' AND sale_enabled=1").all()).results;let ready=false;for(const {product_id}of ids)try{const p=await gpPublicProduct(db,product_id,env);if(p.policy.mode==='days')ready=true}catch{}if(!ready)deny(409,'gp_no_ready_products')}
 return operation(db,staff.sub,d.enabled?'gp.services.open':'gp.services.pause','site-display',d,{ok:true},q=>[q('UPDATE site_display_settings SET purchases_paused=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[d.enabled?0:1,time(),staff.sub])],{sql:"EXISTS(SELECT 1 FROM site_display_settings WHERE id=1 AND mode='services' AND revision=?)",args:[d.revision]});
}
