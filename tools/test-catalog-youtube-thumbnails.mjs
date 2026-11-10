import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {platformFixture} from './platform-local-fixture.mjs';
import {handlePlatform} from '../media-worker/src/platform.mjs';

const fixture=await platformFixture(),{db,env}=fixture,checks={api:0,ui:0};
const sources=[
 ['abcdefghijk','abcdefghijk'],
 ['https://youtube.com/watch?v=watchID1234','watchID1234'],
 ['https://youtu.be/shortID1234/?si=local','shortID1234'],
 ['https://youtube.com/shorts/shortsID123?feature=share','shortsID123']
];
const ids=[];
for(const [source] of sources){
 const id=crypto.randomUUID();ids.push(id);
 db.prepare("INSERT INTO videos(id,title,description,category,year,source_type,source_ref,access,price_minor,currency,state,publish_at,updated_at,mutation_id) VALUES (?,?,?,'sermon',2026,'youtube',?,'free',0,'EUR','published',?,?,?)")
 .run(id,JSON.stringify({ru:'Тестовое видео '+ids.length,en:'Test video '+ids.length}),JSON.stringify({ru:'',en:''}),source,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','youtube-thumbnail-test');
}
const bunnyId=crypto.randomUUID();
db.prepare("INSERT INTO videos(id,title,description,category,year,source_type,source_ref,bunny_library_id,access,price_minor,currency,state,publish_at,updated_at,mutation_id) VALUES (?,?,?,'sermon',2026,'bunny',?,'803179','free',0,'EUR','published',?,?,?)")
 .run(bunnyId,JSON.stringify({ru:'Bunny remains unchanged',en:'Bunny remains unchanged'}),JSON.stringify({ru:'',en:''}),crypto.randomUUID(),'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','youtube-thumbnail-test');
db.prepare("UPDATE videos SET cover_key='d1' WHERE id=?").run(bunnyId);
const call=async path=>handlePlatform(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/'+path,{headers:{Origin:env.MEDIA_PUBLIC_ORIGIN}}),env);

class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.options=[];this.value='';this.textContent='';this.className='';this.disabled=false;this.open=false}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 addEventListener(name,callback){this.listeners[name]=callback}
 setAttribute(name,value){this.attributes[name]=value}
 showModal(){this.open=true}
 close(){this.open=false}
 click(){return this.listeners.click?.()}
}
function makeDocument(){
 const elements=new Map(),ids=['catalog-detail','catalog-detail-body','catalog-detail-title','catalog-title','catalog-intro','catalog-account','catalog-language','catalog-close','catalog-search-label','catalog-category-label','catalog-category','catalog-search','catalog-items','catalog-status'];
 for(const id of ids)elements.set(id,new Element(id==='catalog-detail'?'dialog':'div'));
 elements.get('catalog-category').options=Array.from({length:6},()=>new Element('option'));
 elements.get('catalog-category').value='all';
 return {documentElement:{lang:'ru'},getElementById:id=>elements.get(id),elements};
}

try{
 const response=await call('catalog'),catalog=await response.json();
 assert.equal(response.status,200);
 assert.deepEqual(catalog.videos.filter(video=>video.youtube_ref).map(video=>video.youtube_ref).sort(),sources.map(([source])=>source).sort());
 assert.equal(catalog.videos.find(video=>video.id===bunnyId).youtube_ref,null);
 assert.equal(JSON.stringify(catalog).includes(db.prepare('SELECT source_ref FROM videos WHERE id=?').get(bunnyId).source_ref),false);
 checks.api+=4;
 for(let index=0;index<sources.length;index++){
  const [source,expectedId]=sources[index],before=db.prepare('SELECT source_ref FROM videos WHERE id=?').get(ids[index]).source_ref;
  const play=await call('play/'+ids[index]),data=await play.json();
  assert.equal(play.status,200);
  assert.deepEqual(data,{type:'youtube',id:expectedId});
  assert.equal(db.prepare('SELECT source_ref FROM videos WHERE id=?').get(ids[index]).source_ref,before);
  checks.api+=3;
 }
 const document=makeDocument(),played=[];
 const api={
  node(tag,value,cls){const node=new Element(tag);if(value!==undefined)node.textContent=value;if(cls)node.className=cls;return node},
  async request(path){assert.equal(path,'catalog');return {courses:[],videos:catalog.videos}},
  async play(id,slot,title,options){played.push({id,title,options});slot.append(new Element('iframe'))}
 };
 const window={MysterionPlatform:api,addEventListener(){}},storage={getItem(){return 'ru'},setItem(){}};
 vm.runInNewContext(await fs.readFile(new URL('../catalog.js',import.meta.url),'utf8'),{window,document,localStorage:storage,URL});
 await new Promise(resolve=>setImmediate(resolve));
 const rows=document.getElementById('catalog-items').children;
 const youtubeRows=sources.map(([,id])=>rows.find(row=>row.children[0].children.some(child=>child.className==='youtube-preview')&&row.children[0].children.find(child=>child.className==='youtube-preview').children[0].src==='https://i.ytimg.com/vi/'+id+'/maxresdefault.jpg'));
 assert.equal(youtubeRows.length,sources.length);
 checks.ui++;
 for(let index=0;index<sources.length;index++){
  const row=youtubeRows[index],copy=row.children[0],preview=copy.children.find(child=>child.className==='youtube-preview'),image=preview.children[0],watch=row.children[1].children.find(child=>child.textContent==='Смотреть');
  assert.equal(image.src,'https://i.ytimg.com/vi/'+sources[index][1]+'/maxresdefault.jpg');
  assert.equal(watch.textContent,'Смотреть');
  await preview.click();await watch.click();
  assert.deepEqual(played.slice(-2).map(entry=>entry.id),[ids[index],ids[index]]);
  assert.deepEqual(played.slice(-2).map(entry=>entry.options?.autoplay),[true,true]);
  checks.ui+=3;
 }
 const preview=youtubeRows[0].children[0].children.find(child=>child.className==='youtube-preview'),image=preview.children[0];
 image.naturalWidth=120;await image.listeners.load();
 assert.equal(image.src,'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
 await image.listeners.error();
 assert.equal(image.src,'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
 image.naturalWidth=320;await image.listeners.load();
 assert.equal(preview.children[0],image);
 checks.ui+=4;
 const unavailable=youtubeRows[1].children[0].children.find(child=>child.className==='youtube-preview'),unavailableImage=unavailable.children[0];
 await unavailableImage.listeners.error();
 await unavailableImage.listeners.error();
 await unavailableImage.listeners.error();
 assert.equal(unavailable.children[0].className,'youtube-preview-fallback');
 assert.equal(unavailable.children[0].textContent,'MYSTERION');
 checks.ui+=2;
 assert.ok(document.getElementById('catalog-items').children.some(row=>row.children[0].children.some(child=>child.tagName==='IMG'&&child.src.startsWith('/api/platform/covers/'))));
 const language=document.getElementById('catalog-language');
 assert.equal(language.textContent,'EN');
 await language.click();
 assert.equal(document.documentElement.lang,'en');
 assert.ok(document.getElementById('catalog-items').children.some(row=>row.children[1].children.some(child=>child.textContent==='Watch')));
 const headers=await fs.readFile(new URL('../_headers',import.meta.url),'utf8'),styles=await fs.readFile(new URL('../platform.css',import.meta.url),'utf8');
 for(const route of ['/catalog','/catalog.html'])assert.ok(headers.includes(route+'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy:')&&headers.split(route+'\n')[1].split('\n')[2].includes("img-src 'self' https://i.ytimg.com"));
 assert.ok(styles.includes('.platform-catalog .youtube-preview{')&&styles.includes('width:min(100%,360px)')&&styles.includes('aspect-ratio:16/9'));
 checks.ui+=5;
 console.log(JSON.stringify({checks,thumbnailFormats:sources.map(([,id])=>id),samePlayerForCoverAndButton:true,fallback:true,bunnyUntouched:true,d1Unchanged:true,productionWrites:0}));
}finally{fixture.close()}
