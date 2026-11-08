(() => {
 'use strict';
 const $=id=>document.getElementById(id),t=window.mediaText,form=$('media-editor'),status=$('admin-status');
 let current=null,role,rows=[],capabilities={},upload=null,poll=null,busy=false,autoPublish=false,generation=0,savedCover=null,publishing=false;
 async function api(path,options={}){const response=await fetch('/api/media/admin/'+path,{credentials:'same-origin',redirect:'error',...options});const data=await response.json();if(!response.ok)throw Error(data.error);return data}
 const post=(path,data)=>api(path,{method:'POST',...(data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
 const operation=action=>post(`videos/${current.id}/bunny/${action}`);
 function controls(){
  const bunny=form.elements.source_type.value==='bunny',paid=form.elements.access.value==='paid'&&!capabilities.paid;
  form.elements.video_file.closest('label').hidden=!bunny;
  form.elements.price_minor.closest('label').hidden=form.elements.access.value==='free';
  form.elements.currency.closest('label').hidden=form.elements.access.value==='free';
  for(const node of form.elements)node.disabled=busy;
  $('admin-new').disabled=busy;$('admin-list').querySelectorAll('button').forEach(b=>b.disabled=busy);
  form.elements.source_ref.readOnly=bunny;form.elements.source_ref.required=!bunny;
  form.elements.cover.disabled=busy||role!=='admin'||!capabilities.customCovers;form.elements.state.disabled=true;
  form.elements.video_file.disabled=busy||Boolean(current?.source_ref&&[1,2,3,4].includes(current.bunny_status));
  $('bunny-controls').hidden=!bunny;
  $('admin-publish').disabled=busy||role!=='admin'||paid||(bunny&&!capabilities.bunny);
  $('publish-policy').hidden=!paid&&(!bunny||capabilities.bunny);
  $('publish-policy').textContent=t(paid?'paidPublicationBlocked':'bunnySetupRequired');
  $('pipeline-cancel').hidden=!busy;$('pipeline-cancel').disabled=publishing;
  $('bunny-start').disabled=busy||!current||!bunny||role!=='admin'||!capabilities.bunny||current.state!=='draft'||current.bunny_status===4;
  $('bunny-import').disabled=busy||!current||role!=='admin'||!capabilities.bunny||Boolean(current.source_ref)||current.state!=='draft';
  $('bunny-sync').disabled=busy||!current?.source_ref||role!=='admin'||!capabilities.bunny;
  $('bunny-preview').disabled=busy||current?.bunny_status!==4||role!=='admin'||!capabilities.bunny;
  $('bunny-cleanup').hidden=!current?.bunny_delete_pending;
  $('admin-delete').hidden=!current||role!=='admin'||current.state==='deleted';
  $('bunny-pause').hidden=!upload?.running;$('bunny-pause').disabled=false;
  $('bunny-resume').hidden=!upload||upload.running||upload.offset===upload.file.size;$('bunny-resume').disabled=busy;
 }
 function providerStatus(){if(!busy)$('bunny-status').textContent=current?.bunny_delete_pending?t('cleanupPending'):current?.source_ref?`${t('processing')}: ${current.bunny_progress??0}% · ${t('providerStatus')} ${current.bunny_status??'—'}`:t('oneClickHint')}
 function render(){const list=$('admin-list');list.replaceChildren();for(const row of rows){const b=document.createElement('button');b.type='button';b.disabled=busy;b.textContent=(row.title[document.documentElement.lang]||row.title.ru)+' — '+t(row.state)+(row.bunny_delete_pending?' · '+t('cleanupPending'):'');b.onclick=()=>edit(row);list.append(b)}}
 async function refresh(){rows=(await api('videos')).items;render()}
 async function refreshCurrent(id){await refresh();if(current?.id!==id)throw Error('selection_changed');const row=rows.find(r=>r.id===id);if(!row)throw Error('not_found');current=row;form.elements.source_ref.value=row.source_ref;form.elements.state.value=row.state;controls()}
 function edit(row=null){if(busy)return;generation++;clearTimeout(poll);upload?.pause();upload=null;autoPublish=false;current=row;savedCover=null;form.reset();$('bunny-progress').value=0;
  for(const lang of ['ru','en','de'])for(const key of ['title','description'])form.elements[key+'_'+lang].value=row?.[key]?.[lang]||'';
  const defaults={year:new Date().getFullYear(),price_minor:0,category:'sermon',source_type:'bunny',access:'free',currency:'EUR',state:'draft'};
  for(const key of ['category','year','source_type','source_ref','access','price_minor','currency','state'])form.elements[key].value=row?.[key]??defaults[key]??'';
  const date=new Date(row?.publish_at||Date.now());form.elements.publish_at.value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  $('admin-delete').hidden=!row||role!=='admin'||row.state==='deleted';form.hidden=false;status.textContent='';controls();providerStatus();
 }
 function data(state){const out={title:{},description:{}};for(const lang of ['ru','en','de'])for(const key of ['title','description'])out[key][lang]=form.elements[key+'_'+lang].value;
  for(const key of ['category','source_type','source_ref','access','currency'])out[key]=form.elements[key].value;
  out.state=state;out.year=Number(form.elements.year.value);out.price_minor=Number(form.elements.price_minor.value);out.publish_at=new Date(form.elements.publish_at.value).toISOString();if(current)out.revision=current.revision;return out;
 }
 async function save(state){if(current?.id)await refreshCurrent(current.id);const version=generation,input=data(state),cover=form.elements.cover.files[0],saved=await api('videos'+(current?'/'+current.id:''),{method:current?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  if(version!==generation)throw Error('selection_changed');
  // Record identity is retained even if cover upload or the following read fails.
  current={...input,id:saved.id};await refreshCurrent(saved.id);
  if(cover&&cover!==savedCover){await api('videos/'+saved.id+'/cover',{method:'PUT',headers:{'Content-Type':cover.type},body:cover});savedCover=cover;await refreshCurrent(saved.id)}
  // Never reset the form here: FileList cannot safely be recreated after reset.
  return saved.id;
 }
 function failure(error){autoPublish=false;busy=false;clearTimeout(poll);controls();status.textContent=t(['image_too_large','cover_limit_512_kib'].includes(error?.message)?'coverTooLarge':error?.message==='paid_publication_disabled'?'paidPublicationBlocked':error?.message==='video_processing_failed'?'processingFailed':'draftRetained');$('bunny-status').textContent=status.textContent}
 async function publish(id,version){if(version!==generation||!autoPublish||current?.id!==id)return;publishing=true;controls();status.textContent=t('publishing');try{await post('videos/'+id+'/publish',{revision:current.revision});if(version!==generation)return;await refreshCurrent(id);autoPublish=false;busy=false;$('admin-delete').hidden=false;controls();status.textContent=t('publishedSuccess');$('bunny-status').textContent=t('publishedSuccess')}finally{publishing=false;controls()}}
 async function sync(schedule=false){clearTimeout(poll);if(!current?.source_ref||document.hidden)return;const id=current.id,version=generation;
  try{const result=await operation('sync');if(version!==generation)return;await refreshCurrent(id);if(version!==generation)return;
   if([5,8].includes(result.status))throw Error('video_processing_failed');
   if(result.ready&&autoPublish){await publish(id,version);return}
   $('bunny-status').textContent=result.ready?t('readyToPublish'):`${t('processing')} ${result.progress??0}%`;
   if(schedule&&!result.ready)poll=setTimeout(()=>sync(true),10000);
  }catch(error){if(version===generation){if(autoPublish)failure(error);else $('bunny-status').textContent=t('syncFailed')}}
 }
 function validFile(file){return file&&file.size>0&&file.size<=20*1024**3&&(['video/mp4','video/webm','video/quicktime'].includes(file.type)||(!file.type&&/\.(mp4|mov|webm)$/i.test(file.name)))}
 async function transfer(){const session=upload,id=current.id,version=generation;busy=true;controls();$('bunny-pause').hidden=false;
  try{const complete=await session.start();if(version!==generation||session!==upload)return;if(!complete){autoPublish=false;busy=false;controls();return}
   await refreshCurrent(id);$('bunny-status').textContent=t('uploaded');$('bunny-pause').hidden=true;await sync(true);
   if(!autoPublish){busy=false;controls()}
  }catch(error){if(version===generation&&session===upload){await refreshCurrent(id).catch(()=>{});if(version===generation)failure(error)}}
 }
 function uploadSession(file){const id=current.id;if(upload?.file===file)return;upload=new window.MysterionBunnyUpload(file,()=>post(`videos/${id}/bunny/upload`),(sent,total)=>{if(current?.id!==id)return;const percent=Math.min(100,Math.round(sent/total*100));$('bunny-progress').value=percent;$('bunny-status').textContent=`${t('uploading')} ${percent}%`})}
 async function startPublish(){const file=form.elements.video_file.files[0],bunny=form.elements.source_type.value==='bunny';
  if(role!=='admin'||(form.elements.access.value==='paid'&&!capabilities.paid)){status.textContent=t('paidPublicationBlocked');return}
  if(bunny&&!capabilities.bunny){status.textContent=t('locked');return}
  const alreadyTransferred=current?.source_ref&&[1,2,3,4].includes(current.bunny_status);
  if(bunny&&!alreadyTransferred&&!validFile(file)){status.textContent=t('invalidVideo');return}
  busy=true;autoPublish=true;const version=++generation;controls();status.textContent=t('savingDraft');
  try{if(!bunny){await save('published');busy=false;autoPublish=false;controls();status.textContent=t('publishedSuccess');return}
   if(current?.id&&!Number.isInteger(current.revision))await refreshCurrent(current.id);
   await save('draft');if(version!==generation)return;
   if(current.source_ref&&[5,8].includes(current.bunny_status)){await operation('retry');await refreshCurrent(current.id);upload=null}
   if(alreadyTransferred){await sync(true)}else{uploadSession(file);await transfer()}
  }catch(error){if(version===generation)failure(error)}
 }
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;if(event.submitter?.id==='admin-publish'){await startPublish();return}const version=generation;busy=true;controls();try{await save('draft');if(version===generation)status.textContent=t('saved')}catch(error){if(version===generation)failure(error)}finally{if(version===generation){busy=false;controls()}}});
 $('pipeline-cancel').onclick=()=>{generation++;autoPublish=false;upload?.pause();busy=false;clearTimeout(poll);controls();status.textContent=t('draftRetained')};
 $('admin-new').onclick=()=>edit();form.elements.source_type.onchange=controls;form.elements.access.onchange=()=>{if(form.elements.access.value==='free')form.elements.price_minor.value='0';controls()};
 $('bunny-start').onclick=async()=>{const file=form.elements.video_file.files[0];if(!current||!validFile(file)){status.textContent=t('invalidVideo');return}autoPublish=false;uploadSession(file);await transfer()};
 $('bunny-pause').onclick=()=>{autoPublish=false;upload?.pause()};$('bunny-resume').onclick=()=>transfer();$('bunny-sync').onclick=()=>sync(true);
 $('bunny-import').onclick=async()=>{if(!current||busy)return;try{await post('videos/'+current.id+'/bunny/import',{guid:form.elements.bunny_guid.value.trim()});await refreshCurrent(current.id);providerStatus();status.textContent=t('saved')}catch{status.textContent=t('failed')}};
 $('bunny-preview').onclick=async()=>{try{const result=await operation('preview'),url=new URL(result.url);if(url.origin!=='https://player.mediadelivery.net'||!/^\/embed\/\d+\/[a-f0-9-]{36}$/.test(url.pathname))throw Error();const player=document.createElement('iframe');player.src=url.href;player.title=t('preview');player.allow='fullscreen; picture-in-picture';player.allowFullscreen=true;$('admin-player-slot').replaceChildren(player);$('admin-player').showModal()}catch{status.textContent=t('syncFailed')}};
 $('admin-player-close').onclick=()=>$('admin-player').close();$('admin-player').onclose=()=>$('admin-player-slot').replaceChildren();
 $('bunny-cleanup').onclick=async()=>{try{await operation('delete');await refresh();form.hidden=true;status.textContent=t('saved')}catch{status.textContent=t('cleanupPending')}};
 $('admin-delete').onclick=async()=>{if(!current||busy||!confirm(t('confirm')))return;generation++;clearTimeout(poll);upload?.pause();try{const result=await api('videos/'+current.id,{method:'DELETE',headers:{'If-Match':String(current.revision)}});form.hidden=true;await refresh();status.textContent=t(result.cleanupPending?'cleanupPending':'saved')}catch{status.textContent=t('failed')}};
 document.addEventListener('visibilitychange',()=>{clearTimeout(poll);if(!document.hidden&&current?.source_ref&&!upload?.running&&(autoPublish||current.bunny_status!==4))sync(true)});
 window.addEventListener('pagehide',()=>{generation++;autoPublish=false;upload?.pause();clearTimeout(poll)});
 window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue=''}});
 window.addEventListener('mysterion:language',()=>{render();if(!role)status.textContent=t('locked');else controls();providerStatus()});
 (async()=>{try{capabilities=await api('me');role=capabilities.role;await refresh();$('admin-controls').hidden=false;status.removeAttribute('data-media');status.textContent=''}catch{status.textContent=t('locked');$('admin-controls').hidden=true;form.hidden=true}})();
})();
