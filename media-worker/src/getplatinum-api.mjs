import {deny} from './platform-data.mjs';
export const getplatinumTerminal='156040';
export function gpKeyState(env){return typeof env.GETPLATINUM_API_KEY!=='string'||!env.GETPLATINUM_API_KEY?'missing':env.GETPLATINUM_API_KEY.length<8?'invalid':'configured'}
export function gpOrigin(env){const value=env.GETPLATINUM_API_ORIGIN||'https://kepvalera.getplatinum.ru';let u;try{u=new URL(value)}catch{deny(503,'gp_origin_invalid')}if(u.protocol!=='https:'||u.origin!==value||u.hostname!=='kepvalera.getplatinum.ru')deny(503,'gp_origin_invalid');return u.origin}
export function gpLiveReady(env){return env.GETPLATINUM_LIVE_ENABLED==='true'&&env.SALES_ENABLED==='true'&&env.MEDIA_PAID_ENABLED==='true'&&typeof env.GETPLATINUM_API_KEY==='string'&&env.GETPLATINUM_API_KEY.length>=8}
export function gpPaymentURL(env,value){let u;try{u=new URL(value)}catch{deny(502,'gp_payment_url_invalid')}if(u.origin!==gpOrigin(env)||u.username||u.password||u.hash||u.pathname.startsWith('/api/'))deny(502,'gp_payment_url_invalid');return u.href}
export async function gpRequest(env,path,body={}){
 if(!['/get-organization','/init-payment-url','/status','/refund-list'].includes(path))deny(400,'gp_method_not_allowed');
 if(gpKeyState(env)==='missing')deny(503,'gp_not_configured');if(gpKeyState(env)==='invalid')deny(503,'gp_key_invalid');
 let response;try{response=await fetch(gpOrigin(env)+'/api/public/v2/pay'+path,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.GETPLATINUM_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)})}catch{deny(502,'gp_api_uncertain')}
 if(response.status>=300&&response.status<400)deny(502,'gp_redirect_denied');
 let data;try{data=await response.json()}catch{deny(502,'gp_invalid_response')}
 if(!response.ok)deny(502,'gp_api_http_error');if(data?.errorCode!==0)deny(502,'gp_api_rejected');return data;
}
export async function gpOrganization(env){const data=await gpRequest(env,'/get-organization');if(!Number.isSafeInteger(data.id)||typeof data.isActive!=='boolean'||!Array.isArray(data.allowedVats))deny(502,'gp_invalid_response');return {id:data.id,isActive:data.isActive,allowedVats:data.allowedVats.filter(v=>['none','0','5','7','10','22'].includes(v))}}
