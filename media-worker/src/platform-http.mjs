import {deny} from './platform-data.mjs';
export function csrf(request,env){if(request.headers.get('Origin')!==env.MEDIA_PUBLIC_ORIGIN||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('X-Requested-With')!=='XMLHttpRequest')deny(403,'invalid_origin')}
export async function input(request,allowed){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))deny(415,'json_required');
 const reader=request.body?.getReader();if(!reader)deny(400,'invalid_json');let bytes=0,chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>32768){await reader.cancel();deny(413,'body_too_large')}chunks.push(value)}
 const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}let data;
 try{data=JSON.parse(new TextDecoder().decode(buffer))}catch{deny(400,'invalid_json')}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!allowed.includes(k)))deny(400,'invalid_fields');return data;
}
export function text(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))deny(400,'invalid_fields');return value.trim()}
export function translations(value,max,required=false){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['ru','en'].includes(k)))deny(400,'invalid_translation');return JSON.stringify({ru:text(value.ru||'',max,required),en:text(value.en||'',max)})}
export function revision(value){if(!Number.isInteger(value)||value<1)deny(400,'revision_required');return value}
export function expiry(value){if(!Number.isSafeInteger(value)||value<=Math.floor(Date.now()/1000)||value>Math.floor(Date.now()/1000)+10*366*86400)deny(400,'invalid_expiry');return value}
export function product(data){if(!['course','video'].includes(data.kind)||typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))deny(400,'invalid_target');return {table:data.kind==='course'?'platform_courses':'videos',column:data.kind==='course'?'course_id':'video_id'}}
export const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
