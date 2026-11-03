const photoData=Array.isArray(window.MYSTERION_PHOTOS)?window.MYSTERION_PHOTOS:[];
function renderPhotos(){
 const lang=document.documentElement.lang==='en'?'en':'ru', grid=document.getElementById('photo-grid');grid.replaceChildren();
 if(!photoData.length){
  const empty=document.createElement('div');empty.className='library-empty';
  const icon=document.createElement('div');icon.className='empty-icon';icon.textContent='✧';
  const title=document.createElement('h3');title.textContent=lang==='ru'?'Галерея скоро появится':'Gallery coming soon';
  const desc=document.createElement('p');desc.textContent=lang==='ru'?'Добавим фотографии конференций, школ и встреч «Мистерион».':'Photos from Mysterion conferences, schools, and gatherings will be added here.';
  empty.append(icon,title,desc);grid.append(empty);
 }else photoData.forEach(p=>{
  if(typeof p.src!=='string'||!p.src.startsWith('assets/photos/'))return;
  const figure=document.createElement('figure');figure.className='gallery-card';
  const img=document.createElement('img');img.src=p.src;img.alt=lang==='ru'?(p.captionRu||'Фотография Мистерион'):(p.captionEn||p.captionRu||'Mysterion photo');img.loading='lazy';
  const cap=document.createElement('figcaption');cap.textContent=lang==='ru'?(p.captionRu||''):(p.captionEn||p.captionRu||'');figure.append(img,cap);grid.append(figure);
 });
 document.title=lang==='ru'?'Фотографии | MYSTERION':'Photos | MYSTERION';
}
window.addEventListener('mysterion:language',renderPhotos);renderPhotos();
