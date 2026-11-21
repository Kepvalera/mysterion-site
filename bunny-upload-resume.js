/* TUS 1.0 conference uploader. Legacy bunny-upload.js remains unchanged. */
window.MysterionBunnyUpload = class {
 constructor(file, authorize, onProgress, onStatus) {
  this.file=file;this.authorize=authorize;this.onProgress=onProgress;this.onStatus=onStatus||(()=>{});this.offset=0;this.url=null;this.paused=true;this.running=false;this.maxRetries=4;
 }
 pause(){this.paused=true;this.xhr?.abort();this.controller?.abort()}
 status(code){this.onStatus(code)}
 async credentials(){
  if(!this.grant||this.grant.expires<Date.now()/1000+120)this.grant=await this.authorize();
  if(this.grant.endpoint!=='https://video.bunnycdn.com/tusupload')throw Error('invalid_upload_endpoint');
  return {...this.grant.headers,'Tus-Resumable':'1.0.0'};
 }
 location(value){const url=new URL(value,'https://video.bunnycdn.com/tusupload/');if(url.origin!=='https://video.bunnycdn.com'||!url.pathname.startsWith('/tusupload/'))throw Error('invalid_upload_location');return url.href}
 async request(method,headers,retries=3){
  let attempt=0;
  while(attempt<=retries){
   this.controller=new AbortController();let timeout,response;
   try{timeout=setTimeout(()=>this.controller.abort(),30000);response=await fetch(this.url||'https://video.bunnycdn.com/tusupload',{method,headers,redirect:'error',credentials:'omit',signal:this.controller.signal})}
   catch(error){clearTimeout(timeout);if(error?.name==='AbortError')throw error;attempt++;if(attempt<=retries){this.status('upload_retrying');await new Promise(r=>setTimeout(r,500*2**(attempt-1)));continue}throw Error('upload_network_error')}
   clearTimeout(timeout);
   if([408,429].includes(response.status)||(response.status>=500&&response.status<600)){attempt++;if(attempt<=retries){this.status('upload_retrying');await new Promise(r=>setTimeout(r,500*2**(attempt-1)));continue}throw Error('tus_'+response.status)}
   if(!response.ok)throw Error('tus_'+response.status);return response;
  }
 }
 async serverOffset(headers){
  try{const response=await this.request('HEAD',headers,2);const raw=response.headers.get('Upload-Offset'),offset=Number(raw);if(!raw||!Number.isSafeInteger(offset)||offset<0||offset>this.file.size)return null;return offset}catch{return null}
 }
 async start(){
  if(this.running)return;this.running=true;this.paused=false;this.status('uploading');
  try{
   let headers=await this.credentials();if(this.paused)return false;
   if(!this.url){
    const encode=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    const extension=this.file.name.split('.').pop()?.toLowerCase();
    const mime=this.file.type||({mov:'video/quicktime',webm:'video/webm',mp4:'video/mp4'}[extension])||'video/mp4';
    const response=await this.request('POST',{...headers,'Upload-Length':String(this.file.size),'Upload-Metadata':`filetype ${encode(mime)},title ${encode(this.file.name.slice(0,180))}`});
    const location=response.headers.get('Location');if(!location)throw Error('missing_upload_location');this.url=this.location(location);if(this.onLocation)await this.onLocation(this.url);
   }
   if(this.paused)return false;headers=await this.credentials();
   const confirmed=await this.serverOffset(headers);if(confirmed===null)throw Error('invalid_upload_offset');this.offset=confirmed;
   while(this.offset<this.file.size&&!this.paused){
    headers=await this.credentials();const end=Math.min(this.offset+4*1024*1024,this.file.size);
    const next=await this.chunk(headers,this.offset,end);if(next===null){this.status('upload_connection_lost');throw Error('upload_network_error')}this.offset=next;this.onProgress(this.offset,this.file.size);
   }
   return !this.paused&&this.offset===this.file.size;
  }finally{this.running=false}
 }
 async chunk(headers,start,end){
  let current=start;
  for(let attempt=0;attempt<=this.maxRetries;attempt++){
   if(this.paused)return current;if(attempt>0){this.status('upload_retrying');await new Promise(r=>setTimeout(r,700*2**(attempt-1)));headers=await this.credentials()}
   const next=await new Promise(resolve=>{
    const xhr=this.xhr=new XMLHttpRequest();xhr.open('PATCH',this.url);xhr.timeout=300000;
    for(const [key,value]of Object.entries({...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(current)}))xhr.setRequestHeader(key,value);
    xhr.upload.onprogress=event=>this.onProgress(current+event.loaded,this.file.size);
    xhr.onload=()=>{if(xhr.status===204){const raw=xhr.getResponseHeader('Upload-Offset'),offset=Number(raw);resolve(Number.isSafeInteger(offset)&&offset>=current&&offset<=end?offset:null)}else resolve(null)};
    xhr.onerror=xhr.ontimeout=()=>resolve(null);xhr.onabort=()=>resolve(null);xhr.send(this.file.slice(current,end));
   });
   if(next!==null)return next;
   if(attempt===this.maxRetries)return null;
   const confirmed=await this.serverOffset(await this.credentials());
   if(confirmed!==null&&confirmed>=start&&confirmed<=end){current=confirmed;if(current===end)return end}
   this.status('upload_connection_lost');
  }
  return null;
 }
};
