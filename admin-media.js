(() => {
  'use strict';
  const $=id=>document.getElementById(id),t=window.mediaText,form=$('media-editor'),status=$('admin-status');
  let current=null,role,rows=[],capabilities={},upload=null,poll=null;
  async function api(path,options={}) {
    const response=await fetch('/api/media/admin/'+path,{credentials:'same-origin',redirect:'error',...options});
    const data=await response.json();if(!response.ok)throw Error(data.error);return data;
  }
  const operation=action=>api(`videos/${current.id}/bunny/${action}`,{method:'POST'});
  function sourceControls() {
    const isBunny=form.elements.source_type.value==='bunny';form.elements.source_ref.readOnly=isBunny;form.elements.source_ref.required=!isBunny;
    $('bunny-controls').hidden=!isBunny;
    $('bunny-start').disabled=!current||current.source_type!=='bunny'||role!=='admin'||!capabilities.bunny||current.state!=='draft'||current.bunny_status===4;
    $('bunny-import').disabled=!current||role!=='admin'||!capabilities.bunny||Boolean(current.source_ref)||current.state!=='draft';
    $('bunny-sync').disabled=!current?.source_ref||role!=='admin'||!capabilities.bunny;
    $('bunny-preview').disabled=current?.bunny_status!==4||role!=='admin'||!capabilities.bunny;
    $('bunny-cleanup').hidden=!current?.bunny_delete_pending;
  }
  function providerStatus(row) {
    $('bunny-status').textContent=row?.bunny_delete_pending?t('cleanupPending'):row?.source_ref?`${t('processing')}: ${row.bunny_progress??0}% · ${t('providerStatus')} ${row.bunny_status??'—'}`:t('uploadHint');
  }
  function edit(row=null) {
    upload?.pause();upload=null;clearTimeout(poll);current=row;form.reset();$('bunny-progress').value=0;$('bunny-resume').hidden=true;$('bunny-pause').hidden=true;
    for(const lang of ['ru','en','de'])for(const key of ['title','description'])form.elements[key+'_'+lang].value=row?.[key]?.[lang]||'';
    const defaults={year:new Date().getFullYear(),price_minor:0,category:'sermon',source_type:'bunny',access:'free',currency:'EUR',state:'draft'};
    for(const key of ['category','year','source_type','source_ref','access','price_minor','currency','state'])form.elements[key].value=row?.[key]??defaults[key]??'';
    const date=new Date(row?.publish_at||Date.now());form.elements.publish_at.value=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    $('admin-delete').hidden=!row||role!=='admin'||row.state==='deleted';form.elements.state.disabled=role!=='admin';form.elements.cover.disabled=role!=='admin'||!capabilities.customCovers;
    form.hidden=false;sourceControls();providerStatus(row);
  }
  function render() {
    $('admin-list').replaceChildren();for(const row of rows){const button=document.createElement('button');button.type='button';button.textContent=(row.title[document.documentElement.lang]||row.title.ru)+' — '+t(row.state)+(row.bunny_delete_pending?' · '+t('cleanupPending'):'');button.addEventListener('click',()=>edit(row));$('admin-list').append(button)}
  }
  async function refresh(){rows=(await api('videos')).items;render()}
  async function sync(schedule=false) {
    clearTimeout(poll);
    if(!current?.source_ref||document.hidden)return;const id=current.id;
    try{const data=await operation('sync');await refresh();if(current?.id!==id)return;current=rows.find(row=>row.id===id);providerStatus(current);sourceControls();if(schedule&&!data.ready&&![5,8].includes(data.status))poll=setTimeout(()=>sync(true),10000)}
    catch{$('bunny-status').textContent=t('syncFailed')}
  }
  async function start(){try{capabilities=await api('me');role=capabilities.role;await refresh();$('admin-controls').hidden=false;status.removeAttribute('data-media');status.textContent=''}catch{status.textContent=t('locked');$('admin-controls').hidden=true;form.hidden=true}}
  $('admin-new').addEventListener('click',()=>edit());form.elements.source_type.addEventListener('change',sourceControls);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(upload?.running)return;const data={title:{},description:{}};
    for(const lang of ['ru','en','de'])for(const key of ['title','description'])data[key][lang]=form.elements[key+'_'+lang].value;
    for(const key of ['category','source_type','source_ref','access','currency','state'])data[key]=form.elements[key].value;
    data.year=Number(form.elements.year.value);data.price_minor=Number(form.elements.price_minor.value);data.publish_at=new Date(form.elements.publish_at.value).toISOString();if(current)data.revision=current.revision;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{const saved=await api('videos'+(current?'/'+current.id:''),{method:current?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const cover=form.elements.cover.files[0];if(cover)await api('videos/'+saved.id+'/cover',{method:'PUT',headers:{'Content-Type':cover.type},body:cover});await refresh();edit(rows.find(row=>row.id===saved.id));status.textContent=t('saved');if(current?.source_type==='bunny'&&current.source_ref)await sync()}
    catch{status.textContent=t('failed');await refresh().catch(()=>{})}finally{submit.disabled=false}
  });
  async function transfer() {
    const session=upload,id=current.id;
    $('bunny-start').disabled=true;$('bunny-resume').hidden=true;$('bunny-pause').hidden=false;
    try{const complete=await session.start();if(current?.id!==id||upload!==session)return;if(complete){await refresh();current=rows.find(row=>row.id===id);form.elements.source_ref.value=current.source_ref;$('bunny-status').textContent=t('uploaded');$('bunny-pause').hidden=true;await sync(true)}else $('bunny-resume').hidden=false}
    catch{if(current?.id===id&&upload===session){$('bunny-status').textContent=t('uploadPaused');$('bunny-resume').hidden=false}}
    finally{if(current?.id===id&&upload===session){$('bunny-pause').hidden=true;await refresh().catch(()=>{});const row=rows.find(row=>row.id===id);if(row){current=row;form.elements.source_ref.value=row.source_ref;sourceControls()}}}
  }
  $('bunny-start').addEventListener('click',async()=>{
    const file=form.elements.video_file.files[0];if(!current||!file||!['video/mp4','video/webm','video/quicktime'].includes(file.type)||file.size<1||file.size>20*1024**3){$('bunny-status').textContent=t('invalidVideo');return}
    const id=current.id;clearTimeout(poll);upload=new window.MysterionBunnyUpload(file,()=>api(`videos/${id}/bunny/upload`,{method:'POST'}),(sent,total)=>{$('bunny-progress').value=Math.round(sent/total*100);$('bunny-status').textContent=`${t('uploading')} ${Math.round(sent/total*100)}%`});await transfer();
  });
  $('bunny-import').addEventListener('click',async()=>{if(!current)return;const id=current.id;try{await api('videos/'+id+'/bunny/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guid:form.elements.bunny_guid.value.trim()})});await refresh();edit(rows.find(r=>r.id===id));status.textContent=t('saved')}catch{status.textContent=t('failed')}});
  $('bunny-pause').addEventListener('click',()=>upload?.pause());$('bunny-resume').addEventListener('click',()=>transfer());$('bunny-sync').addEventListener('click',()=>sync(true));
  $('bunny-preview').addEventListener('click',async()=>{try{const data=await operation('preview'),url=new URL(data.url);if(url.origin!=='https://player.mediadelivery.net'||!/^\/embed\/\d+\/[a-f0-9-]{36}$/.test(url.pathname))throw Error();const player=document.createElement('iframe');player.src=url.href;player.title=t('preview');player.allow='fullscreen; picture-in-picture';player.allowFullscreen=true;$('admin-player-slot').replaceChildren(player);$('admin-player').showModal()}catch{$('bunny-status').textContent=t('syncFailed')}});
  $('admin-player-close').addEventListener('click',()=>$('admin-player').close());$('admin-player').addEventListener('close',()=>$('admin-player-slot').replaceChildren());
  $('bunny-cleanup').addEventListener('click',async()=>{try{await operation('delete');await refresh();form.hidden=true;status.textContent=t('saved')}catch{status.textContent=t('cleanupPending')}});
  $('admin-delete').addEventListener('click',async()=>{if(!current||!confirm(t('confirm')))return;upload?.pause();clearTimeout(poll);try{const result=await api('videos/'+current.id,{method:'DELETE',headers:{'If-Match':String(current.revision)}});form.hidden=true;await refresh();status.textContent=t(result.cleanupPending?'cleanupPending':'saved')}catch{status.textContent=t('failed')}});
  document.addEventListener('visibilitychange',()=>{clearTimeout(poll);if(!document.hidden&&current?.source_ref&&current.bunny_status!==4&&!upload?.running)sync(true)});
  window.addEventListener('pagehide',()=>{upload?.pause();clearTimeout(poll)});
  window.addEventListener('mysterion:language',()=>{render();if(!role)status.textContent=t('locked');providerStatus(current)});start();
})();
