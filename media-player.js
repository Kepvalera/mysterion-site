/* Both public catalog views use the same server-authorized playback flow. */
(() => {
 'use strict';
 const participantCopy={ru:{signIn:'Для просмотра войдите в личный кабинет участника.',access:'Нет действующего доступа к этой записи. Проверьте материалы в личном кабинете.',unavailable:'Не удалось открыть запись. Повторите позже или откройте личный кабинет.',account:'Открыть личный кабинет'},en:{signIn:'Sign in to your participant account to watch.',access:'You do not have active access to this recording. Check the materials in your account.',unavailable:'Unable to open the recording. Try again later or open your account.',account:'Open my account'}};
 const participantText=key=>participantCopy[document.documentElement.lang==='en'?'en':'ru'][key];
 window.createMysterionMediaPlayer=({dialog,title,slot,closeButton,local,t})=>{
  let controller,lastFocus,version=0;
  const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element};
  const sourceSwitcher=node('div');sourceSwitcher.className='video-source-switcher';sourceSwitcher.hidden=true;sourceSwitcher.setAttribute('role','group');sourceSwitcher.setAttribute('aria-label',document.documentElement.lang==='en'?'Video source':'Источник видео');slot.before(sourceSwitcher);
  function clear(){version++;controller?.abort();slot.querySelector('video')?.pause();slot.replaceChildren();sourceSwitcher.replaceChildren();sourceSwitcher.hidden=true}
  function close(){clear();if(dialog.open)dialog.close()}
  closeButton.addEventListener('click',close);
  dialog.addEventListener('close',()=>{if(dialog.open)return;clear();lastFocus?.focus()});
  window.addEventListener('mysterion:session-expired',close);
  window.addEventListener('pagehide',clear);
  async function open(item,selectedSource){
   clear();lastFocus=document.activeElement;const requestVersion=version;controller=new AbortController();
   const sources=['youtube','vk','rutube'].filter(source=>source==='youtube'?/^[\w-]{11}$/.test(item.youtube_ref||''):source==='vk'?typeof item.vk_ref==='string'&&item.vk_ref:/^[a-f0-9]{32}$/i.test(item.rutube_ref||''));
   const defaultSource=sources.includes('youtube')?'youtube':sources[0],activeSource=sources.includes(selectedSource)?selectedSource:defaultSource;let responseStatus=0;
   if(item.access==='free'&&sources.length>1){
    sourceSwitcher.hidden=false;
    for(const source of sources){const button=node('button',source==='youtube'?'YouTube':source==='vk'?'VK Видео':'Rutube');button.type='button';button.setAttribute('aria-pressed',String(activeSource===source));button.addEventListener('click',()=>open(item,source));sourceSwitcher.append(button)}
   }
   title.textContent=local(item.title);if(!dialog.open)dialog.showModal();slot.append(node('p',t('loading')));
   try{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.id))throw Error('invalid_video');
    // Paid playback uses the same viewer cookie, grants and short-lived Bunny
    // token endpoint as the participant account. Legacy Access is not a viewer session.
    const paid=item.access==='paid',playSource=sources.length>1?activeSource:null,playURL=paid?`/api/platform/play/${item.id}`:`/api/media/videos/${item.id}/play${playSource?`?source=${playSource}`:''}`,response=await(window.mysterionAuthenticatedFetch||fetch)(playURL,{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});responseStatus=response.status;
    if(!response.ok)throw Error('viewing_unavailable');const data=await response.json();
    if(requestVersion!==version||!dialog.open)return;
    let player;
    if(data.type==='youtube'&&/^[\w-]{11}$/.test(data.id)){player=node('iframe');player.src='https://www.youtube-nocookie.com/embed/'+data.id}
    else if(data.type==='vk'&&typeof data.url==='string'){const u=new URL(data.url);if(!['https://vk.com','https://vkvideo.ru'].includes(u.origin)||u.pathname!=='/video_ext.php'||u.username||u.password)throw Error('invalid_player');player=node('iframe');player.src=u.href}
    else if(data.type==='rutube'&&/^[a-f0-9]{32}$/i.test(data.id)){player=node('iframe');player.src='https://rutube.ru/play/embed/'+data.id.toLowerCase()}
    else if(data.type==='bunny'&&typeof data.url==='string'&&/^https:\/\/player\.mediadelivery\.net\/embed\/\d+\/[a-f0-9-]{36}\?token=[a-f0-9]{64}&expires=\d+$/.test(data.url)){player=node('iframe');player.src=data.url}
    else if(data.type==='r2'&&data.url===`/api/media/videos/${item.id}/stream`){player=node('video');player.controls=true;player.preload='metadata';player.src=data.url}
    else throw Error('invalid_player');
    if(player.tagName==='IFRAME'){player.title=local(item.title);player.allow='fullscreen; picture-in-picture';player.allowFullscreen=true;player.referrerPolicy='strict-origin-when-cross-origin'}
    slot.replaceChildren(player);
   }catch(error){
    if(error.name==='AbortError'||requestVersion!==version||!dialog.open)return;
    slot.replaceChildren(node('p',item.access==='paid'?participantText(responseStatus===401?'signIn':responseStatus===403?'access':'unavailable'):t('unavailable')));
    if(item.access==='paid'){const login=node('a',participantText('account'));login.href='/viewer-account.html';slot.append(login)}
   }
  }
  return {open,close};
 };
})();
