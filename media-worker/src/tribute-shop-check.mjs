import {HttpError} from './auth.mjs';

// Read-only Shop API diagnostic. Never return provider bodies or credentials.
// https://wiki.tribute.tg/for-shops/api
// https://wiki.tribute.tg/for-shops/api/methods
export async function checkTributeShops(env){
 const key=env.TRIBUTE_API_KEY;
 if(typeof key!=='string'||!key.length)throw new HttpError(503,'tribute_api_key_missing');
 if(key.length>4096||!/^[\x21-\x7e]+$/.test(key))throw new HttpError(503,'tribute_api_key_invalid_format');
 let response;
 try{
  response=await fetch('https://tribute.tg/api/v1/shops',{
   method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),
   headers:{'Api-Key':key,Accept:'application/json'}
  });
 }catch{throw new HttpError(502,'tribute_api_unreachable')}
 if(!response.ok){
  await response.body?.cancel().catch(()=>{});
  const code=response.status===401?'tribute_api_unauthorized':response.status===403?'tribute_api_forbidden':response.status===429?'tribute_api_rate_limited':response.status>=300&&response.status<400?'tribute_api_redirect_blocked':'tribute_api_unavailable';
  throw new HttpError(502,code);
 }
 const reader=response.body?.getReader();
 if(!reader)throw new HttpError(502,'tribute_api_response_invalid');
 let bytes=0,parts=[];
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072){await reader.cancel();throw new Error()}parts.push(value)}
 }catch{throw new HttpError(502,'tribute_api_response_invalid')}
 const buffer=new Uint8Array(bytes);let offset=0;
 for(const part of parts){buffer.set(part,offset);offset+=part.byteLength}
 let data;try{data=JSON.parse(new TextDecoder().decode(buffer))}catch{throw new HttpError(502,'tribute_api_response_invalid')}
 if(!Array.isArray(data)||data.some(shop=>!shop||!Number.isSafeInteger(shop.id)||shop.id<1||![0,1].includes(shop.status)||typeof shop.onlyStars!=='boolean'))throw new HttpError(502,'tribute_api_response_invalid');
 const shops=data.map(shop=>({id:shop.id,active:shop.status===1,onlyStars:shop.onlyStars,rubModeEligible:shop.status===1&&!shop.onlyStars}));
 return {apiAccessible:true,activeShopFound:shops.some(shop=>shop.active),shops,rubPaymentTested:false};
}
