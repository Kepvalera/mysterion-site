/* TUS 1.0 client. Credentials and resume state stay in memory, never localStorage. */
window.MysterionBunnyUpload = class {
  constructor(file, authorize, onProgress) {
    this.file=file; this.authorize=authorize; this.onProgress=onProgress;
    this.offset=0; this.url=null; this.paused=true; this.running=false;
  }
  pause() { this.paused=true; this.xhr?.abort(); this.controller?.abort(); }
  async credentials() {
    if (!this.grant || this.grant.expires<Date.now()/1000+60) this.grant=await this.authorize();
    if(this.grant.endpoint!=='https://video.bunnycdn.com/tusupload')throw Error('invalid_upload_endpoint');
    return {...this.grant.headers,'Tus-Resumable':'1.0.0'};
  }
  location(value) {
    const url=new URL(value,'https://video.bunnycdn.com/tusupload/');
    if(url.origin!=='https://video.bunnycdn.com'||!url.pathname.startsWith('/tusupload/'))throw Error('invalid_upload_location');
    return url.href;
  }
  async request(method,headers) {
    this.controller=new AbortController();
    const response=await fetch(this.url||'https://video.bunnycdn.com/tusupload',{method,headers,redirect:'error',credentials:'omit',signal:this.controller.signal});
    if(!response.ok)throw Error('tus_'+response.status);return response;
  }
  async start() {
    if(this.running)return;this.running=true;this.paused=false;
    try {
      let headers=await this.credentials();if(this.paused)return false;
      if(!this.url){
        const encode=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text)));
        const extension=this.file.name.split('.').pop().toLowerCase();
        const mime=this.file.type||({mov:'video/quicktime',webm:'video/webm',mp4:'video/mp4'}[extension])||'video/mp4';
        const response=await this.request('POST',{...headers,'Upload-Length':String(this.file.size),'Upload-Metadata':`filetype ${encode(mime)},title ${encode(this.file.name.slice(0,180))}`});
        const location=response.headers.get('Location');if(!location)throw Error('missing_upload_location');this.url=this.location(location);
      }
      if(this.paused)return false;
      const head=await this.request('HEAD',headers);const rawOffset=head.headers.get('Upload-Offset');if(rawOffset===null)throw Error('invalid_upload_offset');this.offset=Number(rawOffset);
      if(!Number.isInteger(this.offset)||this.offset<0||this.offset>this.file.size)throw Error('invalid_upload_offset');
      while(this.offset<this.file.size&&!this.paused){
        headers=await this.credentials();const end=Math.min(this.offset+8*1024*1024,this.file.size);
        const next=await this.chunk(headers,this.file.slice(this.offset,end));if(next!==end)throw Error('invalid_upload_offset');
        this.offset=next;this.onProgress(this.offset,this.file.size);
      }
      return !this.paused&&this.offset===this.file.size;
    }finally{this.running=false}
  }
  chunk(headers,bytes) {
    return new Promise((resolve,reject)=>{
      const xhr=this.xhr=new XMLHttpRequest();xhr.open('PATCH',this.url);xhr.timeout=120000;
      for(const [key,value] of Object.entries({...headers,'Content-Type':'application/offset+octet-stream','Upload-Offset':String(this.offset)}))xhr.setRequestHeader(key,value);
      xhr.upload.onprogress=event=>this.onProgress(this.offset+event.loaded,this.file.size);
      xhr.onload=()=>xhr.status===204?resolve(Number(xhr.getResponseHeader('Upload-Offset'))):reject(Error('tus_'+xhr.status));
      xhr.onerror=xhr.ontimeout=()=>reject(Error('upload_network_error'));xhr.onabort=()=>reject(new DOMException('Paused','AbortError'));xhr.send(bytes);
    });
  }
};
