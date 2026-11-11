import {deny} from './platform-data.mjs';
// Read-only Digital Products metadata. Shop creation/processing is unchanged.
export async function digitalProductRequest(env,path){
 if(!/^\/products(?:\/[1-9]\d{0,15}|\?type=digital&size=100&page=1)$/.test(path))deny(400,'invalid_product_request');if(!env.TRIBUTE_API_KEY)deny(503,'tribute_not_configured');let r;
 try{r=await fetch('https://tribute.tg/api/v1'+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Api-Key':env.TRIBUTE_API_KEY,Accept:'application/json'}})}catch{deny(502,'tribute_unavailable')}
 if(!r.ok)deny(502,'tribute_request_failed');try{return await r.json()}catch{deny(502,'tribute_invalid_response')}
}
