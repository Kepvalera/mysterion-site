import {deny,time} from './platform-data.mjs';
import {input,revision} from './platform-http.mjs';
import {operation} from './sales-core.mjs';

export async function publicDigitalSettings(db){return db.prepare('SELECT * FROM digital_public_sales WHERE id=1').first()}
export function digitalRuntimeReady(env){return env.SALES_ENABLED==='true'&&env.MEDIA_PAID_ENABLED==='true'&&env.TRIBUTE_DIGITAL_ENABLED!=='false'&&!!env.TRIBUTE_API_KEY}
export function digitalPublicOpen(env,state){return digitalRuntimeReady(env)&&state?.enabled===1}
export function launchedPurchase(state,purchasedAt){return Number.isSafeInteger(state?.activated_at)&&state.activated_at>0&&Number.isSafeInteger(purchasedAt)&&purchasedAt>=state.activated_at}

// The caller enforces the existing owner role and same-origin mutation checks.
export async function changePublicDigitalSales(request,env,staff){
 const d=await input(request,['request_id','revision','enabled']);revision(d.revision);
 if(![0,1].includes(d.enabled))deny(400,'invalid_public_sales_state');
 if(d.enabled&&!digitalRuntimeReady(env))deny(503,'digital_runtime_not_ready');
 return operation(env.MEDIA_DB,staff.sub,'digital.public-sales','digital-public',d,{ok:true},q=>[
  q('UPDATE digital_public_sales SET enabled=?,revision=revision+1,updated_at=?,updated_by=?,activated_at=CASE WHEN ?=1 THEN COALESCE(activated_at,?) ELSE activated_at END WHERE id=1 AND $guard',[d.enabled,time(),staff.sub,d.enabled,time()])
 ],{sql:'EXISTS(SELECT 1 FROM digital_public_sales WHERE id=1 AND revision=?)',args:[d.revision]});
}
