/* Read-only view of the same published D1 catalog used by media.html. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),grid=$('video-grid'),status=$('video-status'),search=$('video-search'),more=$('video-more'),retry=$('video-retry');
 const labels={ru:{empty:'Видео скоро появятся',emptyText:'Опубликованные материалы выбранной категории появятся здесь автоматически.',watch:'Смотреть',search:'Поиск по названию или спикеру',loading:'Загрузка…',offline:'Не удалось загрузить медиатеку. Повторите попытку.',retry:'Повторить',more:'Показать ещё',close:'Закрыть видео',sermon:'Проповеди',conference:'Конференции',school:'Школы',testimony:'Свидетельства',free:'Бесплатно',paid:'Платный доступ',unavailable:'Просмотр недоступен. Проверьте вход и право доступа; платный просмотр может быть ещё не подключён.',login:'Войти для просмотра',noMatches:'Ничего не найдено',noMatchesText:'Попробуйте другой запрос.',coverUnavailable:'Обложка недоступна'},en:{empty:'Videos coming soon',emptyText:'Published materials in this category will appear here automatically.',watch:'Watch',search:'Search by title or speaker',loading:'Loading…',offline:'Unable to load the media library. Please retry.',retry:'Retry',more:'Load more',close:'Close video',sermon:'Sermons',conference:'Conferences',school:'Schools',testimony:'Testimonies',free:'Free',paid:'Paid access',unavailable:'Viewing is unavailable. Check your sign-in and entitlement; paid viewing may not be connected yet.',login:'Sign in to watch',noMatches:'No matching videos',noMatchesText:'Try another search.',coverUnavailable:'Cover unavailable'}};
 const t=key=>labels[document.documentElement.lang==='en'?'en':'ru'][key]||key;
 const local=value=>typeof value==='string'?value:value?.[document.documentElement.lang]||value?.ru||'';
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el};
 const frameThumbnails={'fld9gjLrOVM':['maxres2','sd2','hq2','mq2']};
 function addPlaceholder(thumb){const image=thumb.querySelector('img');const placeholder=node('span',t('coverUnavailable'),'video-cover-placeholder');if(image)image.replaceWith(placeholder);else thumb.prepend(placeholder)}
 function addVkThumbnail(thumb,item){
  const image=node('img');image.alt='';image.loading='lazy';image.decoding='async';image.width=640;image.height=360;image.addEventListener('error',()=>addPlaceholder(thumb),{once:true});image.src=`/api/media/videos/${item.id}/vk-cover`;const old=thumb.querySelector('img');if(old)old.replaceWith(image);else thumb.prepend(image);
 }
 function addFallbackThumbnail(thumb,item,youtubeId){
  if(youtubeId)addYoutubeThumbnail(thumb,youtubeId,()=>item.vk_ref?addVkThumbnail(thumb,item):addPlaceholder(thumb));
  else if(item.vk_ref)addVkThumbnail(thumb,item);
  else addPlaceholder(thumb);
 }
 function addYoutubeThumbnail(thumb,id,onFailure){
  const variants=frameThumbnails[id]||['maxresdefault','hqdefault','mqdefault'];let index=0;
  const next=()=>{if(index>=variants.length){onFailure();return}const image=node('img');image.alt='';image.loading='lazy';image.decoding='async';image.width=640;image.height=360;image.addEventListener('error',next,{once:true});image.addEventListener('load',()=>{if(image.naturalWidth<200)next()},{once:true});image.src=`https://i.ytimg.com/vi/${id}/${variants[index++]}.jpg`;const old=thumb.querySelector('img');if(old)old.replaceWith(image);else thumb.prepend(image)};
  next();
 }
 const player=window.createMysterionMediaPlayer({dialog:$('video-dialog'),title:$('dialog-caption'),slot:$('video-player'),closeButton:document.querySelector('.dialog-close'),local,t});
 window.MysterionMediaCommerce?.attach(player,$('dialog-caption'));
 let category=location.hash==='#testimonies'?'testimony':'all',page=1,items=[],controller,sequence=0,debounce;
 function translate(){search.placeholder=t('search');search.setAttribute('aria-label',t('search'));more.textContent=t('more');retry.textContent=t('retry');document.querySelector('.dialog-close').setAttribute('aria-label',t('close'));document.title=document.documentElement.lang==='en'?'Sermons | MYSTERION':'Проповеди | MYSTERION';document.querySelector('.library-filters').setAttribute('aria-label',document.documentElement.lang==='en'?'Video categories':'Категории видео');for(const button of document.querySelectorAll('.library-filters .filter')){const active=button.dataset.category===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))}}
 function render(){
  grid.replaceChildren();
  if(!items.length){const empty=node('div',undefined,'library-empty');empty.append(node('h3',search.value.trim()?t('noMatches'):t('empty')),node('p',search.value.trim()?t('noMatchesText'):t('emptyText')));grid.append(empty);return}
  for(const item of items){
   const card=node('article',undefined,'video-card'),thumb=node('button',undefined,'video-thumb');thumb.type='button';thumb.setAttribute('aria-label',t('watch')+': '+local(item.title));
   const youtubeId=/^[\w-]{11}$/.test(item.youtube_ref||'')?item.youtube_ref:null;
   if(item.has_cover){const img=node('img');img.src=`/api/media/videos/${item.id}/cover`;img.alt='';img.loading='lazy';img.decoding='async';img.width=640;img.height=360;img.addEventListener('error',()=>addFallbackThumbnail(thumb,item,youtubeId),{once:true});thumb.append(img)}else addFallbackThumbnail(thumb,item,youtubeId);
   const play=node('span','▶','play-symbol');play.setAttribute('aria-hidden','true');thumb.append(play);thumb.addEventListener('click',()=>player.open(item));
   const info=node('div',undefined,'video-info');info.append(node('span',`${t(item.category)} · ${item.year} · ${t(item.access)}`,'video-type'),node('h3',local(item.title)),node('p',local(item.description),'video-description'));
   const speaker=local(item.speaker);if(speaker)info.append(node('p',speaker,'video-speaker'));
   const watch=node('button',t('watch'),'btn btn-dark video-watch');watch.type='button';watch.addEventListener('click',()=>player.open(item));info.append(watch);card.append(thumb,info);window.MysterionMediaCommerce?.decorate(card,item);grid.append(card);
  }
 }
 async function load(reset=true){
  clearTimeout(debounce);controller?.abort();controller=new AbortController();const current=++sequence,targetPage=reset?1:page+1;
  if(reset){page=1;items=[];grid.replaceChildren()}more.disabled=true;retry.hidden=true;status.textContent=t('loading');grid.setAttribute('aria-busy','true');
  const params=new URLSearchParams({page:String(targetPage)});if(category!=='all')params.set('category',category);if(search.value.trim())params.set('q',search.value.trim());
  try{const response=await fetch('/api/media/videos?'+params,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(current!==sequence)return;
   items=reset?data.items:items.concat(data.items);page=targetPage;render();status.textContent='';more.hidden=!data.hasMore;
  }catch(error){if(error.name==='AbortError'||current!==sequence)return;status.textContent=t('offline');retry.hidden=false;if(reset)more.hidden=true;retry.dataset.append=String(!reset)}
  finally{if(current===sequence){grid.setAttribute('aria-busy','false');more.disabled=false}}
 }
 for(const button of document.querySelectorAll('.library-filters .filter'))button.addEventListener('click',()=>{category=button.dataset.category;translate();load()});
 search.addEventListener('input',()=>{clearTimeout(debounce);controller?.abort();sequence++;more.disabled=true;debounce=setTimeout(()=>load(),300)});
 more.addEventListener('click',()=>load(false));retry.addEventListener('click',()=>load(retry.dataset.append!=='true'));
 window.addEventListener('hashchange',()=>{category=location.hash==='#testimonies'?'testimony':'all';translate();load()});
 window.addEventListener('mysterion:language',()=>{translate();load()});
 translate();load();
})();
