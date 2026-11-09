import {HttpError} from './auth.mjs';

export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function atStage(phase,callback){
  try{return await callback()}catch(cause){
    let error=cause;
    if(!(cause instanceof HttpError)){
      const database=phase.startsWith('bunny_store_'),message=String(cause?.message||'');
      const code=database?(/no such (table|column)/i.test(message)?'bunny_store_schema_error':/constraint|foreign key/i.test(message)?'bunny_store_constraint_error':/bind|parameter|unsupported type/i.test(message)?'bunny_store_binding_error':'bunny_store_unavailable'):'bunny_internal_error';
      error=new HttpError(503,code);
      error.errorKind=['TypeError','SyntaxError','TimeoutError','AbortError'].includes(cause?.name)?cause.name:'Error';
    }
    error.phase??=phase;throw error;
  }
}
export function configured(env) {
  if (env.BUNNY_ENABLED !== 'true' || !/^[1-9]\d{0,11}$/.test(env.BUNNY_LIBRARY_ID || '') ||
      !env.BUNNY_API_KEY || !env.BUNNY_TOKEN_KEY || env.BUNNY_SECURITY_CONFIRMED !== 'true') {
    throw new HttpError(503, 'bunny_not_configured');
  }
}
export async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function bunnyRequest(env, videoId = '', method = 'GET', data, options = {}) {
  configured(env);
  if (videoId && !uuid.test(videoId)) throw new HttpError(400, 'invalid_bunny_id');
  let response;
  try {response = await fetch(`https://video.bunnycdn.com/library/${env.BUNNY_LIBRARY_ID}/videos${videoId ? '/' + videoId : ''}`, {
    // Workers rejects redirect:"error" before sending the request. Never follow
    // redirects with AccessKey: handle 3xx explicitly without forwarding it.
    method, redirect: 'manual', signal: AbortSignal.timeout(12000),
    headers: {AccessKey: env.BUNNY_API_KEY, Accept: 'application/json', ...(data ? {'Content-Type': 'application/json'} : {})},
    ...(data ? {body: JSON.stringify(data)} : {})
  });} catch(cause) {const error=new HttpError(502,['TimeoutError','AbortError'].includes(cause?.name)?'bunny_timeout':'bunny_network_error');error.errorKind=['TypeError','TimeoutError','AbortError'].includes(cause?.name)?cause.name:'Error';throw error}
  if(response.status>=300&&response.status<400){const error=new HttpError(502,'bunny_redirect_blocked');error.upstreamStatus=response.status;throw error}
  if (method === 'DELETE' && response.status === 404 && options.allowMissing !== false) return {success: true};
  if (!response.ok) {
    const code=({401:'bunny_auth_failed',403:'bunny_forbidden',404:'bunny_library_or_video_not_found',429:'bunny_rate_limited'})[response.status]||(response.status>=500?'bunny_unavailable':'bunny_request_rejected');
    const error=new HttpError(502,code);error.upstreamStatus=response.status;throw error;
  }
  // Never return an upstream error body, API key, or arbitrary provider fields to clients.
  if (response.status === 204) return {success: true};
  let result;try{result=await response.json()}catch{throw new HttpError(502,'bunny_response_invalid')}
  if(!result||typeof result!=='object'||Array.isArray(result))throw new HttpError(502,'bunny_response_invalid');
  if (result.success === false) throw new HttpError(502, 'bunny_request_failed');
  return result;
}
export function boundVideo(env, row) {
  configured(env);
  if (row.source_type !== 'bunny' || !uuid.test(row.source_ref) || row.bunny_library_id !== env.BUNNY_LIBRARY_ID) {
    throw new HttpError(409, 'bunny_video_not_bound');
  }
}
export async function playback(env, row, maxExpiry) {
  boundVideo(env, row);
  const expires = Math.min(Math.floor(Date.now() / 1000) + 180,Number.isSafeInteger(maxExpiry)?maxExpiry:Infinity);
  if(expires<=Math.floor(Date.now()/1000))throw new HttpError(403,'viewing_right_required');
  const token = await sha256(env.BUNNY_TOKEN_KEY + row.source_ref + expires);
  return {type: 'bunny', url: `https://player.mediadelivery.net/embed/${env.BUNNY_LIBRARY_ID}/${row.source_ref}?token=${token}&expires=${expires}`, expires};
}
export async function uploadGrant(env, row) {
  boundVideo(env, row);
  const expires = Math.floor(Date.now() / 1000) + 900;
  const signature = await sha256(env.BUNNY_LIBRARY_ID + env.BUNNY_API_KEY + expires + row.source_ref);
  return {endpoint: 'https://video.bunnycdn.com/tusupload', expires,
    headers: {AuthorizationSignature: signature, AuthorizationExpire: String(expires), LibraryId: env.BUNNY_LIBRARY_ID, VideoId: row.source_ref}};
}
export async function withLease(env, id, callback) {
  const lease = crypto.randomUUID(), now = Math.floor(Date.now() / 1000);
  const result = await atStage('bunny_store_lease_acquire',()=>env.MEDIA_DB.prepare(`INSERT INTO bunny_leases(video_id,lease_id,expires_at) VALUES (?,?,?)
    ON CONFLICT(video_id) DO UPDATE SET lease_id=excluded.lease_id,expires_at=excluded.expires_at WHERE bunny_leases.expires_at<?`)
    .bind(id, lease, now + 90, now).run());
  if (!result.meta.changes) throw new HttpError(409, 'video_busy');
  let failed=false;
  try { return await callback(); }catch(error){failed=true;throw error}
  finally {try{await atStage('bunny_store_lease_release',()=>env.MEDIA_DB.prepare('DELETE FROM bunny_leases WHERE video_id=? AND lease_id=?').bind(id, lease).run())}catch(error){if(!failed)throw error}}
}
export async function syncVideo(env, row) {
  boundVideo(env, row);
  const video = await bunnyRequest(env, row.source_ref);
  if (video.guid !== row.source_ref || String(video.videoLibraryId) !== env.BUNNY_LIBRARY_ID) throw new HttpError(502, 'bunny_response_invalid');
  const title = JSON.parse(row.title).ru;
  if (video.title !== title) await bunnyRequest(env, row.source_ref, 'POST', {title});
  const status = Number.isInteger(video.status) ? video.status : null;
  const progress = Number.isFinite(video.encodeProgress) ? Math.max(0, Math.min(100, video.encodeProgress)) : 0;
  // Only a filename is persisted. Never fetch a provider-supplied arbitrary URL.
  const thumbnail = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(video.thumbnailFileName || '') ? video.thumbnailFileName : null;
  await env.MEDIA_DB.prepare('UPDATE videos SET bunny_status=?,bunny_progress=?,bunny_thumbnail=?,bunny_sync_at=? WHERE id=? AND source_ref=?')
    .bind(status, progress, thumbnail, new Date().toISOString(), row.id, row.source_ref).run();
  return {status, progress, ready: status === 4, hasThumbnail: Boolean(thumbnail)};
}
export async function removeVideo(env, row) {
  boundVideo(env, row);
  await bunnyRequest(env, row.source_ref, 'DELETE');
  await env.MEDIA_DB.prepare('UPDATE videos SET bunny_delete_pending=0 WHERE id=? AND state=\'deleted\'').bind(row.id).run();
}
export async function thumbnail(env, row) {
  boundVideo(env, row);
  if (!/^[a-z0-9-]+\.b-cdn\.net$/.test(env.BUNNY_CDN_HOST || '') || !env.BUNNY_CDN_TOKEN_KEY || !row.bunny_thumbnail) {
    throw new HttpError(404, 'thumbnail_unavailable');
  }
  const pathname = '/' + row.source_ref + '/' + row.bunny_thumbnail;
  const expires = Math.floor(Date.now() / 1000) + 60;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BUNNY_CDN_TOKEN_KEY), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(pathname + expires)));
  const token = 'HS256-' + btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const response = await fetch(`https://${env.BUNNY_CDN_HOST}${pathname}?token=${token}&expires=${expires}`, {
    redirect: 'manual', signal: AbortSignal.timeout(8000), headers: {Referer: env.MEDIA_PUBLIC_ORIGIN + '/'}
  });
  if(response.status>=300&&response.status<400)throw new HttpError(502,'bunny_redirect_blocked');
  if (!response.ok || !/^image\/(jpeg|png|webp)(;|$)/.test(response.headers.get('Content-Type') || '')) throw new HttpError(502, 'thumbnail_unavailable');
  // Bound the response before passing through untrusted bytes.
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  while (true) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > 2097152) { await reader.cancel(); throw new HttpError(502, 'thumbnail_too_large'); } chunks.push(value); }
  return new Response(new Blob(chunks), {headers: {'Content-Type': response.headers.get('Content-Type'), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
