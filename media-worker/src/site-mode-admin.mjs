import {requireOwner,deny,time} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';
import {operation} from './sales-core.mjs';
import {siteDisplayState,serviceFieldNames,serviceContent} from './site-display-mode.mjs';
export async function siteModeAdmin(request,env,staff,path,method){
 requireOwner(staff);const db=env.MEDIA_DB;
 if(path===''&&method==='GET'){const s=await siteDisplayState(env),sales=await db.prepare('SELECT enabled FROM digital_public_sales WHERE id=1').first();return {...s,content:serviceContent(s),publicSalesEnabled:sales?.enabled===1}}
 if(path===''&&method==='PUT'){
  const d=await input(request,['request_id','revision','mode']);revision(d.revision);if(!['main','services'].includes(d.mode))deny(400,'invalid_site_mode');
  return operation(db,staff.sub,'site.mode','site-display',d,{ok:true},q=>[q("UPDATE site_display_settings SET mode=?,purchases_paused=CASE WHEN ?='services' THEN 1 ELSE purchases_paused END,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard",[d.mode,d.mode,time(),staff.sub])],{sql:'EXISTS(SELECT 1 FROM site_display_settings WHERE id=1 AND revision=?)',args:[d.revision]});
 }
 if(path==='resume-sales'&&method==='PUT'){
  const d=await input(request,['request_id','revision']);revision(d.revision);
  return operation(db,staff.sub,'site.sales-resume','site-display',d,{ok:true},q=>[q('UPDATE site_display_settings SET purchases_paused=0,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[time(),staff.sub])],{sql:"EXISTS(SELECT 1 FROM site_display_settings WHERE id=1 AND mode='main' AND revision=?)",args:[d.revision]});
 }
 if(path==='content'&&method==='PUT'){
  const d=await input(request,['request_id','revision','content','npd_confirmed']);revision(d.revision);if(!d.content||typeof d.content!=='object'||Array.isArray(d.content)||Object.keys(d.content).some(k=>!serviceFieldNames.includes(k))||![0,1].includes(d.npd_confirmed))deny(400,'invalid_service_content');
  const content={};for(const key of serviceFieldNames){const value=d.content[key]??'';if(typeof value!=='string'||value.length>4000||/[\p{Cc}]/u.test(value.replace(/[\r\n\t]/g,'')))deny(400,'invalid_service_content');content[key]=value.trim()}
  if(content.contact_email&&!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(content.contact_email))deny(400,'invalid_service_email');
  if(content.contact_phone&&!/^[+\d ()-]{5,40}$/.test(content.contact_phone))deny(400,'invalid_service_phone');
  return operation(db,staff.sub,'site.content','site-display',d,{ok:true},q=>[q('UPDATE site_display_settings SET content=?,npd_confirmed=?,npd_confirmed_at=CASE WHEN ?=1 THEN ? ELSE NULL END,npd_confirmed_by=CASE WHEN ?=1 THEN ? ELSE NULL END,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND $guard',[JSON.stringify(content),d.npd_confirmed,d.npd_confirmed,time(),d.npd_confirmed,staff.sub,time(),staff.sub])],{sql:'EXISTS(SELECT 1 FROM site_display_settings WHERE id=1 AND revision=?)',args:[d.revision]});
 }
 deny(404,'not_found');
}
