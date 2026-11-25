import {boundVideo,bunnyRequest,uploadGrant,sha256} from './bunny.mjs';
import {HttpError} from './auth.mjs';

// Owner-only caller. GET video + HEAD upload; never create, sync, PATCH or delete.
export async function uploadDiagnostics(env,video){
 boundVideo(env,video);
 if(video.state!=='draft')throw new HttpError(409,'bunny_draft_required');
 const saved=await env.MEDIA_DB.prepare('SELECT location,file_size,updated_at FROM platform_uploads WHERE video_id=?').bind(video.id).first();
 const report={video_id:video.id,video_exists:null,video_status:null,session_saved_at:saved?.updated_at??null,file_bytes:saved?.file_size??null,location_valid:false,location_fingerprint:null,head_status:null,confirmed_bytes:null,upload_expires:null,authorization_seconds:86400,previous_authorization_seconds:900,recovery:'unknown',read_only:true};
 try{const remote=await bunnyRequest(env,video.source_ref);if(remote.guid!==video.source_ref||String(remote.videoLibraryId)!==env.BUNNY_LIBRARY_ID)throw new HttpError(502,'bunny_response_invalid');report.video_exists=true;report.video_status=Number.isInteger(remote.status)?remote.status:null}catch(e){report.video_error=e instanceof HttpError?e.message:'bunny_check_failed';report.video_http_status=e.upstreamStatus||null;if(e.upstreamStatus===404)report.video_exists=false;return report}
 if(!saved){report.recovery='no_saved_session';return report}
 let url;try{url=new URL(saved.location)}catch{report.recovery='invalid_saved_location';return report}
 report.location_valid=url.origin==='https://video.bunnycdn.com'&&/^\/tusupload\/[a-zA-Z0-9_-]+$/.test(url.pathname)&&!url.search&&!url.hash&&!url.username&&!url.password;
 if(!report.location_valid){report.recovery='invalid_saved_location';return report}
 report.location_fingerprint=(await sha256(url.href)).slice(0,16);
 try{
  const grant=await uploadGrant(env,video),response=await fetch(url.href,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{...grant.headers,'Tus-Resumable':'1.0.0'}});
  report.head_status=response.status;
  const raw=response.headers.get('Upload-Offset'),length=response.headers.get('Upload-Length'),expiry=Date.parse(response.headers.get('Upload-Expires'));
  if(Number.isFinite(expiry))report.upload_expires=new Date(expiry).toISOString();
  if(response.ok&&raw!==null&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)<=saved.file_size&&(length===null||/^\d+$/.test(length)&&Number(length)===saved.file_size)){report.confirmed_bytes=Number(raw);report.recovery='resume_existing_session'}
  else if([404,410].includes(response.status))report.recovery='session_missing_new_session_requires_confirmation';
  else report.recovery=response.ok?'invalid_server_offset':'head_rejected';
 }catch(e){report.recovery=['TimeoutError','AbortError'].includes(e?.name)?'head_timeout':'head_network_error'}
 return report;
}
