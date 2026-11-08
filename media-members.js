/* Access is enforced by the server. This script never grants browser-side rights. */
(() => {
 'use strict';
 const copy={
  account:['Мои материалы','My library','Meine Mediathek'],members:['Зрители и доступ','Viewers and access','Zuschauer und Zugriff'],
  collections:['Коллекции','Collections','Sammlungen'],identity:['Ваш идентификатор для администратора','Your identity for the administrator','Ihre Kennung für die Verwaltung'],
  pending:['Передайте идентификатор администратору для подключения аккаунта.','Share this identity with the administrator to enable your account.','Geben Sie diese Kennung zur Freischaltung an die Verwaltung weiter.'],
  empty:['Материалы пока не предоставлены.','No materials have been assigned yet.','Es wurden noch keine Inhalte freigeschaltet.'],
  failed:['Не удалось выполнить запрос. Проверьте настройки и права доступа.','Request failed. Check configuration and permissions.','Anfrage fehlgeschlagen. Prüfen Sie Konfiguration und Berechtigungen.'],
  saved:['Сохранено','Saved','Gespeichert'],subject:['Cloudflare Access Subject ID','Cloudflare Access Subject ID','Cloudflare Access Subject ID'],
  add:['Добавить зрителя','Add viewer','Zuschauer hinzufügen'],viewer:['Зритель','Viewer','Zuschauer'],video:['Материал','Material','Inhalt'],
  expiry:['Доступ до','Access until','Zugriff bis'],reason:['Основание выдачи (подтверждение оплаты или разрешение)','Reason (payment confirmation or permission)','Grund (Zahlungsbestätigung oder Freigabe)'],
  grant:['Предоставить доступ','Grant access','Zugriff erteilen'],revoke:['Отозвать','Revoke','Widerrufen'],enable:['Включить','Enable','Aktivieren'],disable:['Заблокировать','Disable','Sperren'],
  title:['Название','Title','Titel'],description:['Описание','Description','Beschreibung'],save:['Сохранить коллекцию','Save collection','Sammlung speichern'],
  draft:['Скрыта','Hidden','Verborgen'],published:['Опубликована','Published','Veröffentlicht'],state:['Публикация','Publication','Veröffentlichung'],
  new:['Новая коллекция','New collection','Neue Sammlung'],remove:['Удалить коллекцию','Delete collection','Sammlung löschen'],confirm:['Подтвердить действие?','Confirm action?','Aktion bestätigen?'],
  watch:['Смотреть','Watch','Ansehen'],close:['Закрыть','Close','Schließen'],expires:['Доступ до','Access until','Zugriff bis'],
  loading:['Загрузка…','Loading…','Laden…'],cover:['Обложки без R2: PNG/JPEG/WebP до 512 КиБ. До 20 материалов в коллекции.','Covers without R2: PNG/JPEG/WebP up to 512 KiB. Up to 20 materials per collection.','Cover ohne R2: PNG/JPEG/WebP bis 512 KiB. Bis zu 20 Inhalte pro Sammlung.']
 };
 const lang=()=>['ru','en','de'].indexOf(document.documentElement.lang),tr=k=>copy[k]?.[Math.max(0,lang())]||k;
 const text=value=>value?.[document.documentElement.lang]||value?.ru||'';
 const el=(tag,value,attrs={})=>{const n=document.createElement(tag);if(value)n.textContent=value;for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n};
 const button=(key,action)=>{const b=el('button',tr(key),{type:'button'});b.addEventListener('click',action);return b};
 const field=(form,key,type='text')=>{const label=el('label'),input=el('input',null,{type,required:'',name:key});label.append(el('span',tr(key)),input);form.append(label);return input};
 const select=(form,key,items)=>{const label=el('label'),s=el('select',null,{name:key,required:''});for(const [id,title]of items)s.append(el('option',title,{value:id}));label.append(el('span',tr(key)),s);form.append(label);return s};
 async function api(path,method='GET',body){const response=await fetch('/api/media/'+path,{method,credentials:'same-origin',redirect:'error',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error);return data}
 let root=document.getElementById('viewer-account'),admin=false,cache,selected=null,player;
 const status=el('p','',{role:'status','aria-live':'polite'});
 async function act(fn){try{await fn();status.textContent=tr('saved')}catch{status.textContent=tr('failed')}}
 async function watch(row){await act(async()=>{const data=await api(row.access==='paid'?'view/play/'+row.id:'videos/'+row.id+'/play',row.access==='paid'?'POST':'GET');
  const slot=player.querySelector('.player-slot');slot.replaceChildren();
  const iframe=el('iframe',null,{title:text(row.title),allow:'fullscreen; picture-in-picture',allowfullscreen:''});
  if(data.type==='bunny'){const u=new URL(data.url);if(u.origin!=='https://player.mediadelivery.net'||!/^\/embed\/\d+\/[a-f0-9-]{36}$/.test(u.pathname))throw Error();iframe.src=u.href}
  else if(data.type==='youtube'&&/^[\w-]{11}$/.test(data.id))iframe.src='https://www.youtube-nocookie.com/embed/'+data.id;
  else if(data.type==='r2'&&data.url==='/api/media/videos/'+row.id+'/stream'){const video=el('video',null,{controls:'',playsinline:''});video.src=data.url;slot.append(video);player.showModal();return}else throw Error();
  slot.append(iframe);player.showModal();
 })}
 async function viewer(){root.replaceChildren(el('h2',tr('account')),status);status.textContent=tr('loading');try{const data=await api('view/account');status.textContent='';if(!data.registered){root.append(el('p',tr('pending')),el('p',tr('identity')),el('code',data.identity));return}if(!data.items.length)root.append(el('p',tr('empty')));for(const row of data.items){const article=el('article',null,{class:'member-material'});article.append(el('h3',text(row.title)),el('p',text(row.description)));if(row.expires_at)article.append(el('p',tr('expires')+': '+new Date(row.expires_at).toLocaleString(document.documentElement.lang)));article.append(button('watch',()=>watch(row)));root.append(article)}}catch{status.textContent=tr('failed')}}
 async function refresh(){const [members,videos,collections]=await Promise.all([api('admin/members'),api('admin/videos'),api('admin/collections')]);cache={...members,videos:videos.items.filter(v=>v.state!=='deleted'),collections:collections.items};render()}
 function render(){root.replaceChildren(el('h2',tr('members')),status,el('p',tr('cover')));
  const add=el('form',null,{class:'member-form'}),subject=field(add,'subject');subject.maxLength=256;add.append(el('button',tr('add'),{type:'submit'}));add.addEventListener('submit',e=>{e.preventDefault();act(async()=>{await api('admin/members','POST',{access_sub:subject.value});await refresh()})});root.append(add);
  const viewers=cache.users.filter(u=>u.role==='viewer');
  for(const u of viewers){const line=el('div',null,{class:'member-material'});line.append(el('code',u.access_sub),button(u.active?'disable':'enable',()=>{if(confirm(tr('confirm')))act(async()=>{await api('admin/members/'+u.id,'PUT',{active:u.active?0:1});await refresh()})}));root.append(line)}
  if(viewers.length&&cache.videos.length){const grant=el('form',null,{class:'member-form'}),uid=select(grant,'viewer',viewers.filter(u=>u.active).map(u=>[u.id,u.access_sub])),vid=select(grant,'video',cache.videos.map(v=>[v.id,text(v.title)])),expiry=field(grant,'expiry','datetime-local'),reason=field(grant,'reason');reason.maxLength=500;
   grant.append(el('button',tr('grant'),{type:'submit'}));grant.addEventListener('submit',e=>{e.preventDefault();act(async()=>{await api('admin/grants','POST',{user_id:uid.value,video_id:vid.value,expires_at:new Date(expiry.value).toISOString(),reason:reason.value});await refresh()})});root.append(grant)}
  for(const g of cache.grants){const line=el('div',null,{class:'member-material'});line.append(el('p',(cache.users.find(u=>u.id===g.user_id)?.access_sub||g.user_id)+' · '+text(cache.videos.find(v=>v.id===g.video_id)?.title)+' · '+new Date(g.expires_at).toLocaleString(document.documentElement.lang)));if(!g.revoked_at)line.append(button('revoke',()=>{if(confirm(tr('confirm')))act(async()=>{await api('admin/grants/'+g.id,'DELETE');await refresh()})}));root.append(line)}
  root.append(el('h2',tr('collections')),button('new',()=>{selected=null;collectionForm()}));for(const c of cache.collections)root.append(button(text(c.title),()=>act(async()=>{selected={...c,videos:(await api('admin/collections/'+c.id)).items.map(x=>x.video_id)};collectionForm()})));
  const holder=el('div',null,{id:'collection-editor'});root.append(holder);
 }
 function collectionForm(){const holder=document.getElementById('collection-editor');holder.replaceChildren();const form=el('form',null,{class:'member-form'}),fields={};for(const locale of ['ru','en','de']){fields[locale]={};for(const key of ['title','description']){const input=field(form,key);input.name=key+'_'+locale;input.lang=locale;input.maxLength=key==='title'?180:4000;input.previousSibling.textContent=tr(key)+' · '+locale.toUpperCase();input.value=selected?.[key]?.[locale]||'';fields[locale][key]=input}}
  const state=select(form,'state',[['draft',tr('draft')],['published',tr('published')]]);state.value=selected?.state||'draft';const checks=[];
  for(const v of cache.videos){const label=el('label'),check=el('input',null,{type:'checkbox',value:v.id});check.checked=selected?.videos.includes(v.id)||false;label.append(check,document.createTextNode(text(v.title)));form.append(label);checks.push(check)}
  form.append(el('button',tr('save'),{type:'submit'}));form.addEventListener('submit',e=>{e.preventDefault();act(async()=>{const data={title:{},description:{},state:state.value,videos:checks.filter(c=>c.checked).map(c=>c.value)};for(const l of ['ru','en','de'])for(const k of ['title','description'])data[k][l]=fields[l][k].value;await api('admin/collections'+(selected?'/'+selected.id:''),selected?'PUT':'POST',data);selected=null;await refresh()})});
  if(selected)form.append(button('remove',()=>{if(confirm(tr('confirm')))act(async()=>{await api('admin/collections/'+selected.id,'DELETE');selected=null;await refresh()})}));holder.append(form);
 }
 async function start(){if(root){player=el('dialog',null,{class:'media-player'});player.append(button('close',()=>player.close()),el('div',null,{class:'player-slot'}));player.addEventListener('close',()=>player.querySelector('.player-slot').replaceChildren());document.body.append(player);await viewer();return}
  if(!document.getElementById('admin-controls'))return;try{const caps=await api('admin/me');if(caps.role!=='admin'||!caps.members)return;admin=true;root=el('section',null,{class:'media-members'});document.getElementById('admin-controls').after(root);await refresh()}catch{/* Existing admin reports its configuration errors. */}}
 window.addEventListener('mysterion:language',()=>{if(!root)return;if(admin&&cache)render();else if(!admin)viewer()});start();
})();
