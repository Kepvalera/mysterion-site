import {HttpError,administrator,entitledViewer} from './auth.mjs';
import * as bunny from './bunny.mjs';
import {requireMediaOrigin} from './origin.mjs';
const categories=['sermon','testimony','conference','school'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,code)=>{throw new HttpError(status,code)};
function ready(env) {
 if(env.MEDIA_ENABLED!=='true' || !env.MEDIA_DB || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.MEDIA_ACCESS_ISSUER||'') || !env.MEDIA_ACCESS_AUD || !env.MEDIA_PUBLIC_ORIGIN) fail(503,'not_configured');
}
function localized(value,max,required=false) {
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!['ru','en','de'].includes(k))) fail(400,'invalid_translation');
 const result={}; for(const lang of ['ru','en','de']) { const text=value[lang]??''; if(typeof text!=='string' || text.length>max || (required && !text.trim())) fail(400,'invalid_translation'); result[lang]=text.trim(); } return JSON.stringify(result);
}
export function validate(data,env={}) {
 const allowed=['title','description','category','year','source_type','source_ref','access','price_minor','currency','state','publish_at','revision'];
 if(!data || typeof data!=='object' || Array.isArray(data) || Object.keys(data).some(k=>!allowed.includes(k))) fail(400,'invalid_fields');
 const title=localized(data.title,180,true), description=localized(data.description,4000);
 if(!categories.includes(data.category) || !Number.isInteger(data.year) || data.year<1900 || data.year>2200 || !['youtube','r2','bunny'].includes(data.source_type) || !['free','paid'].includes(data.access) || !['draft','published'].includes(data.state) || !Number.isInteger(data.price_minor) || data.price_minor<0 || data.price_minor>10000000 || !['EUR','USD','RUB'].includes(data.currency) || typeof data.source_ref!=='string') fail(400,'invalid_fields');
 if(data.source_type==='youtube' && !/^[\w-]{11}$/.test(data.source_ref)) fail(400,'youtube_id_required');
 if(data.source_type==='r2' && (!/^videos\/[a-zA-Z0-9_/-]+\.(mp4|webm)$/.test(data.source_ref) || data.source_ref.includes('..') || data.source_ref.length>200)) fail(400,'invalid_source');
 if(data.source_type==='bunny' && data.source_ref!=='' && !bunny.uuid.test(data.source_ref)) fail(400,'invalid_bunny_id');
 if(data.source_type==='bunny' && data.state==='published' && !data.source_ref) fail(409,'upload_required');
 if(data.access==='paid' && (data.source_type!=='bunny' || data.price_minor===0)) fail(400,'private_paid_source_required');
 if(data.access==='free' && data.price_minor!==0) fail(400,'invalid_price');
 if(data.access==='paid' && data.state==='published' && env.MEDIA_PAID_ENABLED!=='true') fail(409,'paid_publication_disabled');
 const date=new Date(data.publish_at); if(!Number.isFinite(date.getTime())) fail(400,'invalid_date');
 return {...data,title,description,publish_at:date.toISOString()};
}
const decodeRow=row=>({...row,title:JSON.parse(row.title),description:JSON.parse(row.description)});
const publicColumns="id,title,description,category,year,access,price_minor,currency,publish_at,(cover_key IS NOT NULL OR (source_type='bunny' AND bunny_thumbnail IS NOT NULL)) AS has_cover";
const noLease=" AND NOT EXISTS (SELECT 1 FROM bunny_leases WHERE video_id=videos.id AND expires_at>unixepoch())";
function sameOrigin(request,env){if(request.headers.get('Origin')!==env.MEDIA_PUBLIC_ORIGIN || request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'invalid_origin')}
async function published(env,id) { const row=await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE id=? AND state='published' AND publish_at<=?").bind(id,new Date().toISOString()).first(); if(!row) fail(404,'not_found'); return row; }
async function body(request) {
 if(!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'json_required');
 const reader=request.body?.getReader(); if(!reader) fail(400,'invalid_json');
 let size=0,chunks=[]; while(true) {const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>32768){await reader.cancel();fail(413,'body_too_large')} chunks.push(value)}
 const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{fail(400,'invalid_json')}
}
async function mutate(env,user,id,action,statement,mutation) {
 const results=await env.MEDIA_DB.batch([statement,env.MEDIA_DB.prepare('INSERT INTO audit_log(id,actor_id,video_id,action,created_at) SELECT ?,?,?,?,? FROM videos WHERE id=? AND mutation_id=?').bind(crypto.randomUUID(),user.id,id,action,new Date().toISOString(),id,mutation)]);
 if(!results[0].meta.changes) fail(409,'revision_conflict');
}
export async function handle(request,env) {
 try {
  ready(env);
  requireMediaOrigin(request,env);
  const url=new URL(request.url), path=url.pathname.replace(/^\/api\/media\/?/,'').replace(/\/$/,''), method=request.method;
  if(!url.pathname.startsWith('/api/media')) fail(404,'not_found');
  const paidPlay=path.match(/^view\/play\/([a-f0-9-]{36})$/);
  if(paidPlay && method==='POST') {
   sameOrigin(request,env);
   if(env.MEDIA_PAID_ENABLED!=='true')fail(503,'paid_playback_disabled');
   const row=await published(env,paidPlay[1]);
   if(row.access!=='paid'||row.source_type!=='bunny')fail(404,'not_found');
   await entitledViewer(request,env,row.id);
   if(row.bunny_status!==4)fail(409,'video_not_ready');
   return json(await bunny.playback(env,row));
  }
  if(path==='videos' && method==='GET') {
   const category=url.searchParams.get('category'),year=url.searchParams.get('year'),access=url.searchParams.get('access'),q=(url.searchParams.get('q')||'').trim();
   if(q.length>120 || (category && !categories.includes(category)) || (year && !/^\d{4}$/.test(year)) || (access && !['free','paid'].includes(access))) fail(400,'invalid_filter');
   const page=Math.min(10000,Math.max(1,Number(url.searchParams.get('page'))||1));
   const where=["state='published'",'publish_at<=?'],values=[new Date().toISOString()];
   for(const [column,value] of [['category',category],['year',year],['access',access]]) if(value){where.push(column+'=?');values.push(value)}
   if(q){where.push('(title LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\')');const search='%'+q.replace(/[\\%_]/g,'\\$&')+'%';values.push(search,search)}
   const rows=await env.MEDIA_DB.prepare(`SELECT ${publicColumns} FROM videos WHERE ${where.join(' AND ')} ORDER BY publish_at DESC,id LIMIT 25 OFFSET ?`).bind(...values,(Math.floor(page)-1)*24).all();
   return json({items:rows.results.slice(0,24).map(decodeRow),hasMore:rows.results.length>24});
  }
  const match=path.match(/^videos\/([a-f0-9-]{36})\/(play|stream|cover)$/);
  if(match && method==='GET') {
   const row=await published(env,match[1]),kind=match[2];
   if(kind==='cover') {if(!row.cover_key && row.source_type==='bunny')return await bunny.thumbnail(env,row);if(!row.cover_key || !env.MEDIA_BUCKET) fail(404,'not_found');const object=await env.MEDIA_BUCKET.get(row.cover_key);if(!object)fail(404,'not_found');return new Response(object.body,{headers:{'Content-Type':row.cover_type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
   // Paid R2/YouTube and the legacy GET route can never issue a viewing grant.
   if(row.access!=='free') fail(402,'paid_playback_disabled');
   if(kind==='play' && row.source_type==='bunny') {if(row.bunny_status!==4)fail(409,'video_not_ready');return json(await bunny.playback(env,row))}
   if(kind==='play') return json(row.source_type==='youtube'?{type:'youtube',id:row.source_ref}:{type:'r2',url:`/api/media/videos/${row.id}/stream`});
   if(row.source_type!=='r2' || !env.MEDIA_BUCKET) fail(404,'not_found');
   const range=request.headers.get('Range'); if(range && !/^bytes=\d+-\d*$/.test(range)) fail(416,'invalid_range');
   const object=await env.MEDIA_BUCKET.get(row.source_ref,range?{range:request.headers}:undefined);if(!object)fail(404,'not_found');
   const headers=new Headers({'Content-Type':row.source_ref.endsWith('.webm')?'video/webm':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
   if(object.range){headers.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);headers.set('Content-Length',object.range.length)}else headers.set('Content-Length',object.size);
   return new Response(object.body,{status:object.range?206:200,headers});
  }
  if(!path.startsWith('admin/')) fail(404,'not_found');
  const user=await administrator(request,env);
  if(method!=='GET')sameOrigin(request,env);
  if(path==='admin/me' && method==='GET'){let available=false;try{bunny.configured(env);available=true}catch{}return json({role:user.role,bunny:available,paid:env.MEDIA_PAID_ENABLED==='true',customCovers:Boolean(env.MEDIA_BUCKET)})}
  if(path==='admin/videos' && method==='GET'){const rows=await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE state!='deleted' OR bunny_delete_pending=1 ORDER BY updated_at DESC LIMIT 200").all();return json({items:rows.results.map(decodeRow)})}
  const operation=path.match(/^admin\/videos\/([a-f0-9-]{36})\/bunny\/(upload|sync|preview|delete)$/);
  if(operation && method==='POST') {
   if(user.role!=='admin')fail(403,'admin_required');
   bunny.configured(env);
   const [_,id,action]=operation;
   return await bunny.withLease(env,id,async()=>{
    let row=await env.MEDIA_DB.prepare('SELECT * FROM videos WHERE id=?').bind(id).first();
    if(!row||row.source_type!=='bunny')fail(404,'not_found');
    if(action==='delete'){if(row.state!=='deleted')fail(409,'delete_record_first');await bunny.removeVideo(env,row);return json({ok:true})}
    if(row.state==='deleted')fail(404,'not_found');
    if(action==='preview'){if(row.bunny_status!==4)fail(409,'video_not_ready');return json(await bunny.playback(env,row))}
    if(action==='sync'){const data=await bunny.syncVideo(env,row);return json(data)}
    if(row.state!=='draft')fail(409,'draft_required');
    if(!row.source_ref){
     const video=await bunny.bunnyRequest(env,'','POST',{title:JSON.parse(row.title).ru});
     if(!bunny.uuid.test(video.guid||''))fail(502,'bunny_response_invalid');
     const mutation=crypto.randomUUID();
     try{await mutate(env,user,id,'bunny_create',env.MEDIA_DB.prepare("UPDATE videos SET source_ref=?,bunny_library_id=?,bunny_status=0,bunny_progress=0,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state='draft' AND source_ref=''").bind(video.guid,env.BUNNY_LIBRARY_ID,mutation,new Date().toISOString(),id,row.revision),mutation)}
     catch(error){await bunny.bunnyRequest(env,video.guid,'DELETE').catch(()=>{});throw error}
     row=await env.MEDIA_DB.prepare('SELECT * FROM videos WHERE id=?').bind(id).first();
    }else{bunny.boundVideo(env,row);const video=await bunny.bunnyRequest(env,row.source_ref);if(![0,6].includes(video.status))fail(409,'upload_already_started')}
    return json(await bunny.uploadGrant(env,row));
   });
  }
  const edit=path.match(/^admin\/videos\/([a-f0-9-]{36})(\/cover)?$/);
  if(path==='admin/videos' && method==='POST' || edit && method==='PUT' && !edit[2]) {
   const input=validate(await body(request),env),id=edit?edit[1]:crypto.randomUUID(),now=new Date().toISOString(),mutation=crypto.randomUUID();
   const existing=edit?await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE id=? AND state!='deleted'").bind(id).first():null;
   if(edit && !existing)fail(404,'not_found');
   if(existing?.source_type==='bunny' && (input.source_type!=='bunny'||input.source_ref!==existing.source_ref))fail(409,'bunny_source_immutable');
   if(input.source_type==='bunny' && input.source_ref && (!existing||existing.source_type!=='bunny'||existing.source_ref!==input.source_ref))fail(403,'bunny_video_not_bound');
   if(input.state==='published' && input.source_type==='bunny') {bunny.boundVideo(env,existing);const video=await bunny.bunnyRequest(env,input.source_ref);if(video.status!==4)fail(409,'video_not_ready')}
   if(user.role!=='admin' && (input.state==='published'||existing?.state==='published'))fail(403,'admin_required');
   if(input.state==='published' && input.source_type==='r2' && (!env.MEDIA_BUCKET||!await env.MEDIA_BUCKET.head(input.source_ref)))fail(400,'source_not_uploaded');
   const values=[input.title,input.description,input.category,input.year,input.source_type,input.source_ref,input.access,input.price_minor,input.currency,input.state,input.publish_at,now,mutation];
   if(edit){if(!Number.isInteger(input.revision))fail(400,'revision_required');await mutate(env,user,id,'update',env.MEDIA_DB.prepare('UPDATE videos SET title=?,description=?,category=?,year=?,source_type=?,source_ref=?,access=?,price_minor=?,currency=?,state=?,publish_at=?,updated_at=?,mutation_id=?,revision=revision+1 WHERE id=? AND revision=? AND state!=\'deleted\''+noLease).bind(...values,id,input.revision),mutation)}
   else await mutate(env,user,id,'create',env.MEDIA_DB.prepare('INSERT INTO videos(title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,updated_at,mutation_id,id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...values,id),mutation);
   return json({id},edit?200:201);
  }
  if(edit && edit[2] && method==='PUT') {
   if(user.role!=='admin')fail(403,'admin_required');
   if(!env.MEDIA_BUCKET)fail(503,'custom_covers_not_configured');
   const row=await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE id=? AND state!='deleted'").bind(edit[1]).first();if(!row)fail(404,'not_found');
   // Streaming size limit prevents a large request from being buffered in Worker memory.
   const reader=request.body?.getReader();if(!reader)fail(400,'image_required');let size=0,chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();fail(413,'image_too_large')}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   const text=new TextDecoder('latin1').decode(bytes.slice(0,12));
   const mime=bytes[0]===137&&text.slice(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'?'image/webp':null;
   if(!mime)fail(415,'unsupported_image');
   const key='covers/'+crypto.randomUUID(),mutation=crypto.randomUUID();await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
   try{await mutate(env,user,row.id,'cover',env.MEDIA_DB.prepare('UPDATE videos SET cover_key=?,cover_type=?,mutation_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?'+noLease).bind(key,mime,mutation,new Date().toISOString(),row.id,row.revision),mutation)}catch(error){await env.MEDIA_BUCKET.delete(key);throw error}
   return json({ok:true});
  }
  if(edit && !edit[2] && method==='DELETE') {
   if(user.role!=='admin')fail(403,'admin_required');const revision=Number(request.headers.get('If-Match'));if(!Number.isInteger(revision)||revision<1)fail(400,'revision_required');
   const mutation=crypto.randomUUID();await mutate(env,user,edit[1],'delete',env.MEDIA_DB.prepare("UPDATE videos SET state='deleted',bunny_delete_pending=CASE WHEN source_type='bunny' AND source_ref!='' THEN 1 ELSE 0 END,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state!='deleted'"+noLease).bind(mutation,new Date().toISOString(),edit[1],revision),mutation);
   const deleted=await env.MEDIA_DB.prepare('SELECT * FROM videos WHERE id=?').bind(edit[1]).first();
   if(deleted.bunny_delete_pending){try{await bunny.withLease(env,deleted.id,()=>bunny.removeVideo(env,deleted))}catch{return json({ok:true,cleanupPending:true},202)}}
   return json({ok:true});
  }
  fail(404,'not_found');
 } catch(error) {return json({error:error instanceof HttpError?error.message:'service_unavailable'},error instanceof HttpError?error.status:503)}
}
export default {fetch:handle};
