import {HttpError,administrator,entitledViewer,siteSession} from './auth.mjs';
import * as bunny from './bunny.mjs';
import {requireMediaOrigin} from './origin.mjs';
import {memberRoute} from './members.mjs';
import {vkEmbed} from './video-source.mjs';
const categories=['sermon','testimony','conference','school'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,code)=>{throw new HttpError(status,code)};
function ready(env) {
 if(env.MEDIA_ENABLED!=='true' || !env.MEDIA_DB || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.MEDIA_ACCESS_ISSUER||'') || !env.MEDIA_ACCESS_AUD || !env.MEDIA_PUBLIC_ORIGIN) fail(503,'not_configured');
}
function localized(value,max,required=false) {
 if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!['ru','en','de'].includes(k))) fail(400,'invalid_translation');
 const result={}; for(const lang of ['ru','en']) { const text=value[lang]??''; if(typeof text!=='string' || text.length>max || (required && !text.trim())) fail(400,'invalid_translation'); result[lang]=text.trim(); }
 if(value.de!==undefined){if(typeof value.de!=='string'||value.de.length>max)fail(400,'invalid_translation');result.de=value.de}return JSON.stringify(result);
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
const visible=value=>{const parsed=JSON.parse(value);return {ru:parsed.ru||'',en:parsed.en||''}};
const decodeRow=row=>({...row,title:visible(row.title),description:visible(row.description)});
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
  if(path==='session'&&method==='GET')return json(await siteSession(request,env));
  if(path==='view/account')return json(await memberRoute(request,env,path,method,null,body));
  if(path==='collections' && method==='GET'){
   if(env.MEDIA_MEMBERS_ENABLED!=='true')return json({items:[]});
   const rows=await env.MEDIA_DB.prepare("SELECT id,title,description FROM collections WHERE state='published' ORDER BY created_at DESC LIMIT 200").all();
   return json({items:rows.results.map(decodeRow)});
  }
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
   const collection=url.searchParams.get('collection');
   if(collection){if(env.MEDIA_MEMBERS_ENABLED!=='true'||!bunny.uuid.test(collection))fail(400,'invalid_collection');where.push("EXISTS(SELECT 1 FROM collection_videos cv JOIN collections c ON c.id=cv.collection_id WHERE cv.video_id=videos.id AND c.id=? AND c.state='published')");values.push(collection)}
   for(const [column,value] of [['category',category],['year',year],['access',access]]) if(value){where.push(column+'=?');values.push(value)}
   if(q){where.push('(title LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\')');const search='%'+q.replace(/[\\%_]/g,'\\$&')+'%';values.push(search,search)}
   const rows=await env.MEDIA_DB.prepare(`SELECT ${publicColumns} FROM videos WHERE ${where.join(' AND ')} ORDER BY publish_at DESC,id LIMIT 25 OFFSET ?`).bind(...values,(Math.floor(page)-1)*24).all();
   return json({items:rows.results.slice(0,24).map(decodeRow),hasMore:rows.results.length>24});
  }
  const match=path.match(/^videos\/([a-f0-9-]{36})\/(play|stream|cover)$/);
  if(match && method==='GET') {
   const row=await published(env,match[1]),kind=match[2];
   if(kind==='cover') {
    if(row.cover_key==='d1' && (env.MEDIA_MEMBERS_ENABLED==='true'||env.VIEWER_PLATFORM_ENABLED==='true')){
     const cover=await env.MEDIA_DB.prepare('SELECT mime,bytes FROM media_covers WHERE video_id=?').bind(row.id).first();
     if(!cover)fail(404,'not_found');
     return new Response(new Uint8Array(cover.bytes),{headers:{'Content-Type':cover.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(!row.cover_key && row.source_type==='bunny')return await bunny.thumbnail(env,row);if(!row.cover_key || !env.MEDIA_BUCKET) fail(404,'not_found');const object=await env.MEDIA_BUCKET.get(row.cover_key);if(!object)fail(404,'not_found');return new Response(object.body,{headers:{'Content-Type':row.cover_type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   // Paid R2/YouTube and the legacy GET route can never issue a viewing grant.
   if(row.access!=='free') fail(402,'paid_playback_disabled');
   if(kind==='play' && row.source_type==='bunny') {if(row.bunny_status!==4)fail(409,'video_not_ready');return json(await bunny.playback(env,row))}
   if(kind==='play'&&row.source_type==='vk')return json({type:'vk',url:vkEmbed(row.source_ref)});
   if(kind==='play') return json(row.source_type==='youtube'?{type:'youtube',id:row.source_ref}:{type:'r2',url:`/api/media/videos/${row.id}/stream`});
   if(row.source_type!=='r2' || !env.MEDIA_BUCKET) fail(404,'not_found');
   const range=request.headers.get('Range'); if(range && !/^bytes=\d+-\d*$/.test(range)) fail(416,'invalid_range');
   const object=await env.MEDIA_BUCKET.get(row.source_ref,range?{range:request.headers}:undefined);if(!object)fail(404,'not_found');
   const headers=new Headers({'Content-Type':row.source_ref.endsWith('.webm')?'video/webm':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
   if(object.range){headers.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);headers.set('Content-Length',object.range.length)}else headers.set('Content-Length',object.size);
   return new Response(object.body,{status:object.range?206:200,headers});
  }
  if(!path.startsWith('admin/')) fail(404,'not_found');
  // When the explicit new platform flag is enabled, legacy roles cannot bypass
  // the separate owner/publisher/uploader permissions through an older endpoint.
  if(env.VIEWER_PLATFORM_ENABLED==='true')fail(409,'use_platform_admin_api');
  const user=await administrator(request,env);
  if(method!=='GET')sameOrigin(request,env);
  if(/^admin\/(members|grants|collections)(\/|$)/.test(path))return json(await memberRoute(request,env,path,method,user,body));
  if(path==='admin/me' && method==='GET'){let available=false;try{bunny.configured(env);available=true}catch{}return json({role:user.role,bunny:available,paid:env.MEDIA_PAID_ENABLED==='true',members:env.MEDIA_MEMBERS_ENABLED==='true',customCovers:Boolean(env.MEDIA_BUCKET)||env.MEDIA_MEMBERS_ENABLED==='true'})}
  if(path==='admin/videos' && method==='GET'){const rows=await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE state!='deleted' OR bunny_delete_pending=1 ORDER BY updated_at DESC LIMIT 200").all();return json({items:rows.results.map(decodeRow)})}
  const publish=path.match(/^admin\/videos\/([a-f0-9-]{36})\/publish$/);
  if(publish && method==='POST'){
   if(user.role!=='admin')fail(403,'admin_required');
   const input=await body(request);
   if(!input||Object.keys(input).length!==1||!Number.isInteger(input.revision)||input.revision<1)fail(400,'revision_required');
   const row=await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE id=? AND state!='deleted'").bind(publish[1]).first();
   if(!row)fail(404,'not_found');
   if(row.access==='paid'&&env.MEDIA_PAID_ENABLED!=='true')fail(409,'paid_publication_disabled');
   if(row.source_type!=='bunny')fail(400,'bunny_required');
   bunny.boundVideo(env,row);
   if(row.state==='published')return json({id:row.id});
   if(row.revision!==input.revision)fail(409,'revision_conflict');
   const video=await bunny.bunnyRequest(env,row.source_ref);
   if(video.guid!==row.source_ref||String(video.videoLibraryId)!==env.BUNNY_LIBRARY_ID)fail(502,'bunny_response_invalid');
   if(video.status!==4)fail(409,'video_not_ready');
   const mutation=crypto.randomUUID();
   await mutate(env,user,row.id,'publish',env.MEDIA_DB.prepare("UPDATE videos SET state='published',bunny_status=4,bunny_progress=100,publish_at=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state='draft'"+noLease).bind(new Date().toISOString(),mutation,new Date().toISOString(),row.id,input.revision),mutation);
   return json({id:row.id});
  }
  const operation=path.match(/^admin\/videos\/([a-f0-9-]{36})\/bunny\/(upload|sync|preview|delete|import|retry)$/);
  if(operation && method==='POST') {
   if(user.role!=='admin')fail(403,'admin_required');
   bunny.configured(env);
   const [_,id,action]=operation;
   return await bunny.withLease(env,id,async()=>{
    let row=await bunny.atStage('bunny_store_read',()=>env.MEDIA_DB.prepare('SELECT * FROM videos WHERE id=?').bind(id).first());
    if(!row||row.source_type!=='bunny')fail(404,'not_found');
    if(action==='delete'){if(row.state!=='deleted')fail(409,'delete_record_first');await bunny.removeVideo(env,row);return json({ok:true})}
    if(row.state==='deleted')fail(404,'not_found');
    if(action==='retry'){
     if(row.state!=='draft')fail(409,'draft_required');bunny.boundVideo(env,row);
     const failed=await bunny.bunnyRequest(env,row.source_ref);
     if(failed.guid!==row.source_ref||String(failed.videoLibraryId)!==env.BUNNY_LIBRARY_ID)fail(502,'bunny_response_invalid');
     if(![5,8].includes(failed.status))fail(409,'video_not_failed');
     const replacement=await bunny.bunnyRequest(env,'','POST',{title:JSON.parse(row.title).ru});
     if(!bunny.uuid.test(replacement.guid||''))fail(502,'bunny_response_invalid');const mutation=crypto.randomUUID();
     try{await mutate(env,user,id,'bunny_retry_from:'+row.source_ref,env.MEDIA_DB.prepare("UPDATE videos SET source_ref=?,bunny_status=0,bunny_progress=0,bunny_thumbnail=NULL,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state='draft' AND source_ref=?").bind(replacement.guid,mutation,new Date().toISOString(),id,row.revision,row.source_ref),mutation)}catch(error){await bunny.bunnyRequest(env,replacement.guid,'DELETE').catch(()=>{});throw error}
     return json({ok:true});
    }
    if(action==='import'){
     if(row.state!=='draft'||row.source_ref)fail(409,'empty_draft_required');
     const input=await body(request);
     if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!bunny.uuid.test(input.guid||''))fail(400,'invalid_bunny_id');
     const video=await bunny.bunnyRequest(env,input.guid);
     if(video.guid!==input.guid||String(video.videoLibraryId)!==env.BUNNY_LIBRARY_ID)fail(502,'bunny_response_invalid');
     if(await env.MEDIA_DB.prepare("SELECT id FROM videos WHERE source_type='bunny' AND source_ref=? AND bunny_library_id=?").bind(input.guid,env.BUNNY_LIBRARY_ID).first())fail(409,'bunny_video_already_bound');
     const mutation=crypto.randomUUID();
     await mutate(env,user,id,'bunny_import',env.MEDIA_DB.prepare("UPDATE videos SET source_ref=?,bunny_library_id=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state='draft' AND source_ref=''").bind(input.guid,env.BUNNY_LIBRARY_ID,mutation,new Date().toISOString(),id,row.revision),mutation);
     row=await env.MEDIA_DB.prepare('SELECT * FROM videos WHERE id=?').bind(id).first();
     return json(await bunny.syncVideo(env,row));
    }
    if(action==='preview'){if(row.bunny_status!==4)fail(409,'video_not_ready');return json(await bunny.playback(env,row))}
    if(action==='sync'){const data=await bunny.syncVideo(env,row);return json(data)}
    if(row.state!=='draft')fail(409,'draft_required');
    if(!row.source_ref){
     const video=await bunny.atStage('bunny_create',()=>bunny.bunnyRequest(env,'','POST',{title:JSON.parse(row.title).ru}));
     if(!bunny.uuid.test(video.guid||''))fail(502,'bunny_response_invalid');
     const mutation=crypto.randomUUID();
     try{await bunny.atStage('bunny_store_bind',()=>mutate(env,user,id,'bunny_create',env.MEDIA_DB.prepare("UPDATE videos SET source_ref=?,bunny_library_id=?,bunny_status=0,bunny_progress=0,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? AND state='draft' AND source_ref=''").bind(video.guid,env.BUNNY_LIBRARY_ID,mutation,new Date().toISOString(),id,row.revision),mutation))}
     catch(error){await bunny.bunnyRequest(env,video.guid,'DELETE').catch(()=>{});throw error}
     row=await env.MEDIA_DB.prepare('SELECT * FROM videos WHERE id=?').bind(id).first();
    }else{bunny.boundVideo(env,row);const video=await bunny.bunnyRequest(env,row.source_ref);if(![0,6].includes(video.status))fail(409,'upload_already_started')}
    return json(await bunny.atStage('bunny_sign_upload',()=>bunny.uploadGrant(env,row)));
   });
  }
  const edit=path.match(/^admin\/videos\/([a-f0-9-]{36})(\/cover)?$/);
  if(path==='admin/videos' && method==='POST' || edit && method==='PUT' && !edit[2]) {
   const input=validate(await body(request),env),id=edit?edit[1]:crypto.randomUUID(),now=new Date().toISOString(),mutation=crypto.randomUUID();
   const existing=edit?await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE id=? AND state!='deleted'").bind(id).first():null;
   if(edit && !existing)fail(404,'not_found');
   if(existing)for(const key of ['title','description']){const old=JSON.parse(existing[key]);if(typeof old.de==='string')input[key]=JSON.stringify({...JSON.parse(input[key]),de:old.de})}
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
   if(!env.MEDIA_BUCKET && env.MEDIA_MEMBERS_ENABLED!=='true')fail(503,'custom_covers_not_configured');
   const row=await env.MEDIA_DB.prepare("SELECT * FROM videos WHERE id=? AND state!='deleted'").bind(edit[1]).first();if(!row)fail(404,'not_found');
   // Streaming size limit prevents a large request from being buffered in Worker memory.
   const reader=request.body?.getReader();if(!reader)fail(400,'image_required');let size=0,chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();fail(413,'image_too_large')}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   const text=new TextDecoder('latin1').decode(bytes.slice(0,12));
   const mime=bytes[0]===137&&text.slice(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'?'image/webp':null;
   if(!mime)fail(415,'unsupported_image');
   if(!env.MEDIA_BUCKET){
    if(size>524288)fail(413,'cover_limit_512_kib');
    const mutation=crypto.randomUUID();
    const results=await env.MEDIA_DB.batch([
     env.MEDIA_DB.prepare('UPDATE videos SET cover_key=\'d1\',cover_type=?,mutation_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?'+noLease).bind(mime,mutation,new Date().toISOString(),row.id,row.revision),
     env.MEDIA_DB.prepare('INSERT INTO media_covers(video_id,mime,bytes) SELECT id,?,? FROM videos WHERE id=? AND mutation_id=? ON CONFLICT(video_id) DO UPDATE SET mime=excluded.mime,bytes=excluded.bytes').bind(mime,bytes,row.id,mutation),
     env.MEDIA_DB.prepare('INSERT INTO audit_log SELECT ?,?,?,?,? FROM videos WHERE id=? AND mutation_id=?').bind(crypto.randomUUID(),user.id,row.id,'cover',new Date().toISOString(),row.id,mutation)
    ]);
    if(!results[0].meta.changes)fail(409,'revision_conflict');return json({ok:true});
   }
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
 } catch(error) {
  if(new URL(request.url).pathname==='/api/media/session'&&request.method==='GET'&&(!(error instanceof HttpError)||error.status!==421))return json({authenticated:false,reason:error instanceof HttpError&&error.status===401?'session_expired':'unavailable'});
  const requestId=crypto.randomUUID(),code=error instanceof HttpError?error.message:'service_unavailable';
  const route=new URL(request.url).pathname;
  const knownPhase=['bunny_store_lease_acquire','bunny_store_lease_release','bunny_store_read','bunny_store_bind','bunny_create','bunny_sign_upload'];
  const phase=knownPhase.includes(error?.phase)?error.phase:/\/bunny\/upload$/.test(route)?'bunny_upload_authorization':/\/bunny\//.test(route)?'bunny_operation':/\/cover$/.test(route)?'cover':/\/publish$/.test(route)?'publish':/^\/api\/media\/admin\/videos/.test(route)?'video_record':'media_api';
  // Only fixed classifications and numeric status: never log exception text,
  // provider bodies, credentials, request bodies, user identifiers or signed URLs.
  const upstreamStatus=Number.isInteger(error?.upstreamStatus)?error.upstreamStatus:undefined;
  const errorKind=['TypeError','SyntaxError','TimeoutError','AbortError','Error'].includes(error?.errorKind)?error.errorKind:undefined;
  console.warn(JSON.stringify({event:'mysterion_media_operation_failed',requestId,phase,code,status:error instanceof HttpError?error.status:503,...(errorKind?{errorKind}:{}),...(upstreamStatus?{upstreamStatus}:{})}));
  const response=json({error:code,requestId,phase,...(upstreamStatus?{upstreamStatus}:{})},error instanceof HttpError?error.status:503);
  response.headers.set('X-Mysterion-Request-ID',requestId);
  if(response.status===401){
   response.headers.set('X-Mysterion-Media-Error',error.message==='authentication_required'?'authentication_required':'invalid_identity');
   response.headers.set('X-Mysterion-Auth-Transport',request.headers.has('Cf-Access-Jwt-Assertion')?'assertion':/(?:^|;)\s*CF_Authorization=/.test(request.headers.get('Cookie')||'')?'cookie':'missing');
  }
  return response;
 }
}
export default {fetch:handle};
