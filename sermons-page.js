// The catalog is driven by sermons-data.js. No server or CMS is required for basic publishing.
const catalog = window.MYSTERION_MEDIA || {youtubePlaylistId:"", videos:[]};
const labels={ru:{empty:"Видео скоро появятся",emptyText:"Здесь будут проповеди, записи школ и конференций. Мы добавим их после публикации на официальном видеоканале.",watch:"Смотреть",unknown:"Спикер",search:"Поиск по названию или спикеру",date:"",sermon:"Проповеди",conference:"Конференции",school:"Школы",testimony:"Свидетельства"},en:{empty:"Videos coming soon",emptyText:"Sermons, school sessions, and conference recordings will appear here after they are published on the official video channel.",watch:"Watch",unknown:"Speaker",search:"Search by title or speaker",date:"",sermon:"Sermons",conference:"Conferences",school:"Schools",testimony:"Testimonies"}};
let category='all';
let query='';
function cleanId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null}
function renderVideos(){
 const lang=document.documentElement.lang==='en'?'en':'ru', t=labels[lang],grid=document.getElementById('video-grid');
 const data=(Array.isArray(catalog.videos)?catalog.videos:[]).filter(v=>cleanId(v.id));
 const matching=data.filter(v=>(category==='all'||v.category===category)&&((v.titleRu||'')+' '+(v.titleEn||'')+' '+(v.speakerRu||'')+' '+(v.speakerEn||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 grid.replaceChildren();
 if(!matching.length && !(!data.length && typeof catalog.youtubePlaylistId==='string' && /^[A-Za-z0-9_-]{10,}$/.test(catalog.youtubePlaylistId))){
  const e=document.createElement('div');e.className='library-empty';
  const icon=document.createElement('div');icon.className='empty-icon';icon.textContent='✦';
  const h=document.createElement('h3');h.textContent=data.length?(lang==='ru'?'Ничего не найдено':'No matching videos'):t.empty;
  const p=document.createElement('p');p.textContent=data.length?(lang==='ru'?'Попробуйте другой запрос или категорию.':'Try another search or category.'):t.emptyText;
  e.append(icon,h,p);grid.append(e);
 } else matching.forEach(v=>{
  const card=document.createElement('article');card.className='video-card';
  const thumb=document.createElement('button');thumb.type='button';thumb.className='video-thumb';thumb.setAttribute('aria-label',t.watch+': '+(lang==='ru'?(v.titleRu||v.titleEn):(v.titleEn||v.titleRu)));
  const img=document.createElement('img');img.src='https://i.ytimg.com/vi/'+v.id+'/hqdefault.jpg';img.alt='';img.loading='lazy';
  const play=document.createElement('span');play.className='play-symbol';play.textContent='▶';thumb.append(img,play);
  const info=document.createElement('div');info.className='video-info';
  const type=document.createElement('span');type.className='video-type';type.textContent=t[v.category]||t.sermon;
  const title=document.createElement('h3');title.textContent=lang==='ru'?(v.titleRu||v.titleEn):(v.titleEn||v.titleRu);
  const meta=document.createElement('p');meta.textContent=(lang==='ru'?(v.speakerRu||v.speakerEn):(v.speakerEn||v.speakerRu)||t.unknown)+(v.date?' · '+v.date:'');
  info.append(type,title,meta);card.append(thumb,info);grid.append(card);
  thumb.addEventListener('click',()=>openVideo(v,lang));
 });
 const pl=typeof catalog.youtubePlaylistId==='string'&&/^[A-Za-z0-9_-]{10,}$/.test(catalog.youtubePlaylistId)?catalog.youtubePlaylistId:null;
 const wrap=document.getElementById('playlist-wrap');wrap.hidden=!pl;
 if(pl){document.getElementById('playlist-frame').src='https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(pl)}
 document.getElementById('video-search').placeholder=t.search;
 document.title=lang==='ru'?'Проповеди | MYSTERION':'Sermons | MYSTERION';
}
function openVideo(v,lang){
 const dialog=document.getElementById('video-dialog'),player=document.getElementById('video-player');
 player.replaceChildren();const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/'+v.id+'?autoplay=1';iframe.title=lang==='ru'?(v.titleRu||v.titleEn):(v.titleEn||v.titleRu);iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.allowFullscreen=true;
 player.append(iframe);document.getElementById('dialog-caption').textContent=iframe.title;
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
function closeVideo(){const dialog=document.getElementById('video-dialog');dialog.close();document.getElementById('video-player').replaceChildren()}
document.querySelector('.dialog-close').addEventListener('click',closeVideo);
document.getElementById('video-dialog').addEventListener('close',()=>document.getElementById('video-player').replaceChildren());
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderVideos()}));
document.getElementById('video-search').addEventListener('input',e=>{query=e.target.value;renderVideos()});
window.addEventListener('mysterion:language',renderVideos);
renderVideos();
