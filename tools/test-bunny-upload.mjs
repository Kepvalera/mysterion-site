// Browser API simulation only; never connects to Bunny or uploads a real video.
import vm from 'node:vm';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../bunny-upload.js',import.meta.url),'utf8');
function harness(location='https://video.bunnycdn.com/tusupload/test') {
 let offset=0,grants=0,posts=0,patches=0,heads=0;
 const window={};
 class XHR {
  constructor(){this.upload={};this.headers={};this.aborted=false}
  open(method,url){assert.equal(method,'PATCH');assert.equal(url,location)}
  setRequestHeader(key,value){this.headers[key]=value}
  getResponseHeader(key){assert.equal(key,'Upload-Offset');return String(offset)}
  abort(){this.aborted=true;this.onabort?.()}
  send(bytes){queueMicrotask(()=>{assert.equal(this.headers['Upload-Offset'],String(offset));assert.equal(this.headers.AccessKey,undefined);assert.equal(this.headers['Tus-Resumable'],'1.0.0');assert.equal(this.headers.AuthorizationSignature,'TEST_SIGNATURE');offset+=bytes.size;patches++;this.upload.onprogress?.({loaded:bytes.size});if(!this.aborted){this.status=204;this.onload()}})}
 }
 const fetch=async(url,options)=>{
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.AccessKey,undefined);
  if(options.method==='POST'){posts++;assert.equal(options.headers['Upload-Length'],String(17*1024*1024));return new Response(null,{status:201,headers:{Location:location}})}
  if(options.method==='HEAD'){heads++;return new Response(null,{status:200,headers:{'Upload-Offset':String(offset)}})}
  throw Error('Unexpected request');
 };
 vm.runInNewContext(source,{window,TextEncoder,Uint8Array,btoa,URL,Date,AbortController,DOMException,XMLHttpRequest:XHR,fetch});
 const authorize=async()=>{grants++;return {endpoint:'https://video.bunnycdn.com/tusupload',expires:Math.floor(Date.now()/1000)+900,headers:{AuthorizationSignature:'TEST_SIGNATURE',AuthorizationExpire:String(Math.floor(Date.now()/1000)+900),LibraryId:'123',VideoId:'test'}}};
 return {Upload:window.MysterionBunnyUpload,authorize,state:()=>({offset,grants,posts,patches,heads})};
}
const file=new File([new Uint8Array(17*1024*1024)],'LOCAL_TEST_ONLY.mp4',{type:'video/mp4'});
let passed=0;
{
 const h=harness(),progress=[];const upload=new h.Upload(file,h.authorize,(sent,total)=>progress.push([sent,total]));
 assert.equal(await upload.start(),true);assert.equal(h.state().patches,3);assert.equal(h.state().posts,1);assert.equal(h.state().heads,1);assert.equal(h.state().offset,file.size);assert.equal(progress.at(-1)[0],file.size);assert.equal(upload.running,false);passed++;
}
{
 const h=harness();let stopped=false;const upload=new h.Upload(file,h.authorize,()=>{if(!stopped){stopped=true;upload.pause()}});
 await assert.rejects(upload.start(),error=>error.name==='AbortError');assert.equal(upload.running,false);assert.equal(h.state().patches,1);passed++;
 upload.grant.expires=0;assert.equal(await upload.start(),true);assert.equal(h.state().posts,1);assert.equal(h.state().heads,2);assert.equal(h.state().grants,2);assert.equal(h.state().patches,3);assert.equal(h.state().offset,file.size);passed++;
}
{
 const h=harness('https://evil.invalid/tusupload/steal'),upload=new h.Upload(file,h.authorize,()=>{});
 await assert.rejects(upload.start(),/invalid_upload_location/);assert.equal(h.state().heads,0);assert.equal(h.state().patches,0);passed++;
}
{
 const h=harness(),upload=new h.Upload(file,async()=>{upload.pause();return h.authorize()},()=>{});
 assert.equal(await upload.start(),false);assert.equal(h.state().posts,0);passed++;
}
console.log(JSON.stringify({clientScenarios:passed,chunkSizeMiB:8,pauseResume:'HEAD resumes confirmed server offset',expiredGrant:'renewed',externalLocation:'blocked',realUploads:0}));
