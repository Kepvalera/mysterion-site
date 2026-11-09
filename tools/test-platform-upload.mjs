import assert from 'node:assert/strict';
import {platformFixture} from './platform-local-fixture.mjs';
import {platformAdmin} from '../media-worker/src/platform-admin.mjs';
import {HttpError} from '../media-worker/src/auth.mjs';

const fixture=await platformFixture(),{db,env,staff}=fixture;
const originalFetch=globalThis.fetch,remoteId=crypto.randomUUID();
let remoteCreates=0,checks=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++};
Object.assign(env,{BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'803179',BUNNY_API_KEY:'LOCAL_ONLY_PROVIDER_TEST_KEY',BUNNY_TOKEN_KEY:'LOCAL_ONLY_PLAYBACK_TEST_KEY'});
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://video.bunnycdn.com/')){
  if(options.method==='POST'&&String(url).endsWith('/videos')){remoteCreates++;return Response.json({guid:remoteId,videoLibraryId:803179})}
  return Response.json({guid:remoteId,videoLibraryId:803179,status:4,encodeProgress:100,title:'Local upload fixture',thumbnailFileName:'thumbnail.jpg'});
 }
 return originalFetch(url,options);
};
const call=async(path,method='GET',body)=>{
 try{return Response.json(await platformAdmin(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/'+path,{
  method,headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','Cf-Access-Jwt-Assertion':staff.owner},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 }),env,path,method))}
 catch(error){if(error instanceof HttpError)return Response.json({error:error.message},{status:error.status});throw error}
};
const read=async response=>{const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data};
try{
 const item=await read(await call('videos','POST',{title:{ru:'Тестовая загрузка',en:'Upload test'},description:{ru:'',en:''},category:'sermon',year:2026,source_type:'bunny',source_ref:'',access:'free',price_minor:0,currency:'EUR',state:'draft'}));
 const resumePath='videos/'+item.id+'/resume',uploadPath='videos/'+item.id+'/upload';
 check((await read(await call(resumePath))).upload,null);
 const invalidResume=await call(resumePath,'PUT',{location:'https://video.bunnycdn.com/tusupload/local-upload',file_size:1024,fingerprint:'a'.repeat(64)});
 check(invalidResume.status,409);
 check((await invalidResume.json()).error,'bunny_video_not_bound');
 const grant=await read(await call(uploadPath,'POST',{}));
 check(grant.endpoint,'https://video.bunnycdn.com/tusupload');
 const bound=db.prepare('SELECT source_ref,bunny_library_id FROM videos WHERE id=?').get(item.id);
 check(bound.source_ref,remoteId);
 check(bound.bunny_library_id,'803179');
 check(remoteCreates,1);
 const location='https://video.bunnycdn.com/tusupload/local-upload';
 await read(await call(resumePath,'PUT',{location,file_size:1024,fingerprint:'a'.repeat(64)}));
 check((await read(await call(resumePath))).upload.location,location);
 check((await read(await call('videos/'+item.id+'/status','POST',{}))).ready,true);
 const published=await read(await call('videos/'+item.id,'PUT',{title:item.title,description:item.description,category:item.category,year:item.year,source_type:'bunny',source_ref:'',access:'free',price_minor:0,currency:'EUR',state:'published',revision:item.revision}));
 check(published.state,'published');
 console.log(JSON.stringify({checks,flow:['draft','resume lookup','Bunny create','D1 bind','upload grant','resume persistence','status sync','publish'],remoteCreates,realUploads:0,productionWrites:0}));
}finally{
 globalThis.fetch=originalFetch;
 fixture.close();
}
