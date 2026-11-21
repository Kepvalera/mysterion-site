import {requireMediaOrigin} from './origin.mjs';
import {processGPEvent} from './getplatinum-events.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function handleGetPlatinumWebhook(request,env){
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{requireMediaOrigin(request,env)}catch{return reply({error:'wrong_origin'},421)}
 const key=env.GETPLATINUM_API_KEY;if(typeof key!=='string'||key.length<8)return reply({error:'gp_not_configured'},503);
 const checksum=request.headers.get('X-Checksum')||'';if(!/^[A-F0-9]{64}$/.test(checksum))return reply({error:'gp_invalid_signature'},401);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||!['','identity'].includes(request.headers.get('Content-Encoding')||''))return reply({error:'json_required'},415);
 const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_body'},400);let size=0;const chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return reply({error:'body_too_large'},413)}chunks.push(value)}}catch{return reply({error:'invalid_body'},400)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{const signingKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']),signature=Uint8Array.from(checksum.match(/../g),p=>parseInt(p,16));if(!await crypto.subtle.verify('HMAC',signingKey,signature,bytes))return reply({error:'gp_invalid_signature'},401)}catch{return reply({error:'gp_signature_unavailable'},503)}
 let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{return reply({error:'invalid_json'},400)}
 try{await processGPEvent(env,event,[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''));return reply({ok:true})}catch(e){return reply({error:e.status?e.message:'gp_processing_unavailable'},e.status||503)}
}
