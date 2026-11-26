/* TUS 1.0. Only server-confirmed offsets advance progress. No credentials in diagnostics/storage. */
window.MysterionBunnyUpload=class {
 constructor(file,authorize,onProgress,onStatus,options={}){
  this.file=file;this.authorize=authorize;this.onProgress=onProgress||(()=>{});this.onStatus=onStatus||(()=>{});
  this.offset=0;this.url=null;this.paused=true;this.running=false;this.grant=null;
  this.chunkSize=options.chunkSize||1024*1024;this.minChunkSize=options.minChunkSize||256*1024;
  this.patchTimeout=options.patchTimeout||180000;this.idleTimeout=options.idleTimeout||45000;this.requestTimeout=options.requestTimeout||30000;
  this.maxRetries=4;this.retryDelays=options.retryDelays||[1000,2000,4000,8000];
  this.stats={patches:0,acknowledged_patches:0,heads:0,retries:0,timeouts:0,session_restarts:0,confirmed_bytes:0};this.events=[];
 }
 pause(){this.paused=true;this.wake?.();this.xhr?.abort();this.controller?.abort()}
 diagnostic(code,detail={}){
  const item={code,confirmed_bytes:this.offset,chunk_bytes:this.chunkSize,...detail};this.events.push(item);if(this.events.length>48)this.events.shift();
  try{this.onStatus(code,item)}catch{}try{this.onDiagnostic?.(this.getDiagnostics())}catch{}
 }
 getDiagnostics(){return {file_bytes:this.file.size,chunk_bytes:this.chunkSize,...this.stats,confirmed_bytes:this.offset,events:this.events.map(e=>({...e}))}}
 async wait(ms){if(this.paused)return;await new Promise(resolve=>{const done=()=>{clearTimeout(timer);this.wake=null;resolve()},timer=setTimeout(done,ms);this.wake=done})}
 error(code,phase,httpStatus=0){return Object.assign(Error(code),{phase,httpStatus})}
 async credentials(){
  if(!this.grant||this.grant.expires<Date.now()/1000+this.patchTimeout/1000+30)this.grant=await this.authorize();
  if(this.grant?.endpoint!=='https://video.bunnycdn.com/tusupload')throw this.error('invalid_upload_endpoint','authorize');
  return {...this.grant.headers,'Tus-Resumable':'1.0.0'};
 }
 location(value){const u=new URL(value,'https://video.bunnycdn.com/tusupload/');if(u.origin!=='https://video.bunnycdn.com'||!/^\/tusupload\/[a-zA-Z0-9_-]+$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw this.error('invalid_upload_location','location');return u.href}
 offsetHeader(raw){if(raw===null||raw===undefined)throw this.error('tus_offset_header_missing','HEAD');if(typeof raw!=='string'||!/^\d+$/.test(raw))throw this.error('invalid_upload_offset','HEAD');const n=Number(raw);if(!Number.isSafeInteger(n)||n<0||n>this.file.size)throw this.error('invalid_upload_offset','HEAD');return n}
 async request(method,headers){
  const attempts=method==='HEAD'?3:1;
  for(let attempt=0;attempt<attempts;attempt++){
   if(this.paused)throw new DOMException('Paused','AbortError');const controller=this.controller=new AbortController();let timedOut=false;
   const timer=setTimeout(()=>{timedOut=true;controller.abort()},this.requestTimeout);let response,error;
   try{response=await fetch(this.url||'https://video.bunnycdn.com/tusupload',{method,headers,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});if(!response.ok)error=this.error('tus_'+response.status,method,response.status)}catch(e){if(this.paused)throw new DOMException('Paused','AbortError');error=this.error(timedOut?'upload_request_timeout':'upload_network_or_cors',method)}finally{clearTimeout(timer);if(this.controller===controller)this.controller=null}
   if(!error)return response;
   this.diagnostic(error.message,{phase:method,http_status:error.httpStatus,attempt:attempt+1});
   if(method!=='HEAD'||attempt===attempts-1||error.httpStatus&&![408,429,500,502,503,504].includes(error.httpStatus))throw error;
   await this.wait(this.retryDelays[attempt]);headers=await this.credentials();
  }
 }
 async serverOffset(){this.stats.heads++;const head=await this.request('HEAD',await this.credentials());const offset=this.offsetHeader(head.headers.get('Upload-Offset')),length=head.headers.get('Upload-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==this.file.size))throw this.error('upload_length_mismatch','HEAD');this.diagnostic('upload_offset_confirmed',{phase:'HEAD',server_offset:offset,http_status:head.status});return offset}
 async providerCompleted(){
  if(!this.onProviderComplete||await this.onProviderComplete()!==true)return false;
  this.offset=this.file.size;this.onProgress(this.offset,this.file.size);this.diagnostic('upload_complete_provider_verified',{phase:'complete',server_offset:this.offset});return true;
 }
 async createSession(){
  const encode=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text))),ext=this.file.name.split('.').pop()?.toLowerCase(),mime=this.file.type||({mov:'video/quicktime',webm:'video/webm',mp4:'video/mp4'}[ext])||'video/mp4';
  const response=await this.request('POST',{...await this.credentials(),'Upload-Length':String(this.file.size),'Upload-Metadata':`filetype ${encode(mime)},title ${encode(this.file.name.slice(0,180))}`});if(response.status!==201)throw this.error('tus_creation_status','POST',response.status);const location=response.headers.get('Location');if(!location)throw this.error('missing_upload_location','POST');this.url=this.location(location);if(this.onLocation)await this.onLocation(this.url);this.diagnostic('upload_session_created',{phase:'POST',http_status:201});
 }
 async start(){
  if(this.running||this.lockPending)return false;
  if(typeof navigator!=='undefined'&&navigator.locks){this.lockPending=true;try{await this.credentials();return await navigator.locks.request('mysterion-bunny-upload:'+this.grant.headers.LibraryId+':'+this.grant.headers.VideoId,{ifAvailable:true},lock=>{if(!lock)throw this.error('upload_active_in_another_tab','lock');return this.transfer()})}finally{this.lockPending=false}}
  return this.transfer();
 }
 async transfer(){
  if(this.running)return false;this.running=true;this.paused=false;this.diagnostic('uploading');
  try{
   await this.credentials();if(this.paused)return false;if(this.url)this.url=this.location(this.url);else await this.createSession();
   try{const confirmed=await this.serverOffset();if(confirmed<this.offset)throw this.error('invalid_upload_offset','HEAD');this.offset=confirmed}catch(e){if(![404,410].includes(e.httpStatus))throw e;if(await this.providerCompleted())return true;this.diagnostic('upload_session_missing',{phase:'HEAD',http_status:e.httpStatus});if(this.stats.session_restarts>=1||!this.onSessionExpired||await this.onSessionExpired()!==true)throw this.error('tus_session_not_found','HEAD',e.httpStatus);if(this.paused)return false;this.stats.session_restarts++;this.url=null;this.offset=0;await this.createSession();this.offset=await this.serverOffset()}
   this.onProgress(this.offset,this.file.size);let failures=0;
   while(this.offset<this.file.size&&!this.paused){
    const start=this.offset,end=Math.min(start+this.chunkSize,this.file.size);let failure;
    try{const ack=await this.chunk(await this.credentials(),start,end);if(ack!==end)throw this.error('upload_ack_mismatch','PATCH',204);this.offset=ack;this.stats.acknowledged_patches++;failures=0;this.onProgress(this.offset,this.file.size);this.diagnostic('upload_chunk_confirmed',{phase:'PATCH',server_offset:this.offset,http_status:204});continue}catch(e){if(this.paused)return false;failure=e}
    this.diagnostic(failure.message,{phase:'PATCH',http_status:failure.httpStatus||0});
    if(failure.httpStatus&&![0,204,400,401,403,404,410,408,409,413,423,429,500,502,503,504].includes(failure.httpStatus))throw failure;
    if([400,401,403,404,410].includes(failure.httpStatus))this.grant=null;
    // Never retransmit while HEAD is unknown: the failed request may have committed bytes.
    let confirmed;try{confirmed=await this.serverOffset()}catch(e){if([404,410].includes(e.httpStatus)){if(await this.providerCompleted())return true;this.diagnostic('upload_session_expired',{phase:'HEAD',http_status:e.httpStatus});throw this.error('tus_session_not_found','HEAD',e.httpStatus)}throw e}if(confirmed<start||confirmed>end)throw this.error('invalid_upload_offset','HEAD');this.offset=confirmed;this.onProgress(this.offset,this.file.size);
    if(confirmed>start){failures=0;this.diagnostic('upload_resumed',{phase:'HEAD',server_offset:confirmed});if(confirmed===end)continue}
    else failures++;
    if(failures>this.maxRetries)throw this.error('upload_retry_limit','PATCH',failure.httpStatus||0);
    this.chunkSize=Math.max(this.minChunkSize,Math.floor(this.chunkSize/2));this.stats.retries++;this.diagnostic('upload_retrying',{phase:'PATCH',attempt:failures,server_offset:confirmed});await this.wait(this.retryDelays[Math.max(0,failures-1)]||1000);
   }
   if(this.paused)return false;this.diagnostic('upload_complete',{phase:'complete',server_offset:this.offset});return this.offset===this.file.size;
  }finally{this.running=false;this.xhr=null;this.controller=null}
 }
 chunk(headers,start,end){
  this.stats.patches++;this.diagnostic('upload_patch_started',{phase:'PATCH',start_offset:start,end_offset:end,patch_bytes:end-start});
  return new Promise((resolve,reject)=>{
   const xhr=this.xhr=new XMLHttpRequest();let settled=false,idleTimer,lastLoaded=0;const began=Date.now();
   const finish=(error,offset)=>{if(settled)return;settled=true;clearTimeout(idleTimer);if(this.xhr===xhr)this.xhr=null;error?reject(error):resolve(offset)};
   const watch=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>{this.stats.timeouts++;finish(this.error('upload_patch_stalled','PATCH'));xhr.abort()},this.idleTimeout)};
   try{xhr.open('PATCH',this.url);xhr.timeout=this.patchTimeout;for(const[k,v]of Object.entries({...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(start)}))xhr.setRequestHeader(k,v);
    xhr.upload.onprogress=e=>{if(settled)return;if(e.loaded>lastLoaded)watch();lastLoaded=Math.max(lastLoaded,e.loaded);this.diagnostic(e.loaded>=end-start?'upload_waiting_ack':'upload_sending',{phase:'PATCH',sent_bytes:Math.min(e.loaded,end-start),patch_bytes:end-start,elapsed_ms:Date.now()-began})};
    xhr.onload=()=>{if(xhr.status!==204)return finish(this.error('tus_'+xhr.status,'PATCH',xhr.status));let n;try{n=this.offsetHeader(xhr.getResponseHeader('Upload-Offset'))}catch(e){return finish(this.error(e.message,'PATCH',204))}if(n!==end)return finish(this.error('upload_ack_mismatch','PATCH',204));finish(null,n)};
    xhr.onerror=()=>finish(this.error('upload_network_or_cors','PATCH',xhr.status));xhr.ontimeout=()=>{this.stats.timeouts++;finish(this.error('upload_patch_timeout','PATCH'))};xhr.onabort=()=>finish(this.paused?new DOMException('Paused','AbortError'):this.error('upload_patch_aborted','PATCH'));
    watch();xhr.send(this.file.slice(start,end));
   }catch{finish(this.error('upload_network_or_cors','PATCH'))}
  });
 }
};
