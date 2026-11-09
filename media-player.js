/* Both public catalog views use the same server-authorized playback flow. */
(() => {
 'use strict';
 window.createMysterionMediaPlayer=({dialog,title,slot,closeButton,local,t})=>{
  let controller,lastFocus,version=0;
  const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element};
  function clear(){version++;controller?.abort();slot.querySelector('video')?.pause();slot.replaceChildren()}
  function close(){clear();if(dialog.open)dialog.close()}
  closeButton.addEventListener('click',close);
  dialog.addEventListener('close',()=>{if(dialog.open)return;clear();lastFocus?.focus()});
  window.addEventListener('mysterion:session-expired',close);
  window.addEventListener('pagehide',clear);
  async function open(item){
   clear();lastFocus=document.activeElement;const requestVersion=version;controller=new AbortController();
   title.textContent=local(item.title);if(!dialog.open)dialog.showModal();slot.append(node('p',t('loading')));
   try{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.id))throw Error('invalid_video');
    const paid=item.access==='paid',response=await(window.mysterionAuthenticatedFetch||fetch)(paid?`/api/media/view/play/${item.id}`:`/api/media/videos/${item.id}/play`,{...(paid?{method:'POST'}:{}),credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('viewing_unavailable');const data=await response.json();
    if(requestVersion!==version||!dialog.open)return;
    let player;
    if(data.type==='youtube'&&/^[\w-]{11}$/.test(data.id)){player=node('iframe');player.src='https://www.youtube-nocookie.com/embed/'+data.id}
    else if(data.type==='vk'&&typeof data.url==='string'){const u=new URL(data.url);if(!['https://vk.com','https://vkvideo.ru'].includes(u.origin)||u.pathname!=='/video_ext.php'||u.username||u.password)throw Error('invalid_player');player=node('iframe');player.src=u.href}
    else if(data.type==='bunny'&&typeof data.url==='string'&&/^https:\/\/player\.mediadelivery\.net\/embed\/\d+\/[a-f0-9-]{36}\?token=[a-f0-9]{64}&expires=\d+$/.test(data.url)){player=node('iframe');player.src=data.url}
    else if(data.type==='r2'&&data.url===`/api/media/videos/${item.id}/stream`){player=node('video');player.controls=true;player.preload='metadata';player.src=data.url}
    else throw Error('invalid_player');
    if(player.tagName==='IFRAME'){player.title=local(item.title);player.allow='fullscreen; picture-in-picture';player.allowFullscreen=true;player.referrerPolicy='strict-origin-when-cross-origin'}
    slot.replaceChildren(player);
   }catch(error){
    if(error.name==='AbortError'||requestVersion!==version||!dialog.open)return;
    slot.replaceChildren(node('p',t('unavailable')));
    if(item.access==='paid'){const login=node('a',t('login'));login.href='media-login.html';slot.append(login)}
   }
  }
  return {open,close};
 };
})();
