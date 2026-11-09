/* Same-origin APIs only. No session tokens or credentials are persisted here. */
window.MysterionPlatform={
 async request(path,method='GET',data){
  if(!/^[a-z0-9_\/-]+$/i.test(path))throw Error('invalid_path');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const r=await fetch('/api/platform/'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},...(data===undefined?{}:{body:JSON.stringify(data)})});let v;try{v=await r.json()}catch{throw Error('invalid_response')}if(!r.ok){const e=Error(v.error||'request_failed');e.status=r.status;e.retryAfter=Number(r.headers.get('Retry-After'))||0;throw e}return v}finally{clearTimeout(timer)}
 },
 node(tag,value,cls){const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n},
 async play(id,slot,title){
  const d=await this.request('play/'+id);let url;
  if(d.type==='r2'&&d.url==='/api/media/videos/'+id+'/stream'){const video=this.node('video');video.controls=true;video.preload='metadata';video.src=d.url;slot.replaceChildren(video);return}
  if(d.type==='youtube'&&/^[\w-]{11}$/.test(d.id))url='https://www.youtube-nocookie.com/embed/'+d.id;
  if(d.type==='bunny'&&/^https:\/\/player\.mediadelivery\.net\/embed\/\d+\/[a-f0-9-]{36}\?token=[a-f0-9]{64}&expires=\d+$/.test(d.url))url=d.url;
  if(d.type==='vk'){const u=new URL(d.url);if(['https://vk.com','https://vkvideo.ru'].includes(u.origin)&&u.pathname==='/video_ext.php'&&!u.username&&!u.password)url=u.href}
  if(!url)throw Error('invalid_player');const frame=this.node('iframe');frame.src=url;frame.title=title;frame.allow='fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';slot.replaceChildren(frame);
 }
};
