import assert from 'node:assert/strict';
import {platformFixture} from './platform-local-fixture.mjs';
import {platformAdmin} from '../media-worker/src/platform-admin.mjs';

const fixture=await platformFixture(),{db,env,staff}=fixture,rutubeId='4aac9bdff052c90373852bd914dff1f6';
const call=(path,method,data)=>platformAdmin(new Request(env.MEDIA_PUBLIC_ORIGIN+'/api/platform/admin/'+path,{method,headers:{Origin:env.MEDIA_PUBLIC_ORIGIN,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','Cf-Access-Jwt-Assertion':staff.owner},body:JSON.stringify(data)}),env,path,method);
const base={title:{ru:'Локальный тест Rutube',en:'Local Rutube test'},description:{ru:'',en:''},category:'sermon',year:2026,source_type:'youtube',source_ref:'',youtube_ref:'',vk_ref:'',rutube_ref:`https://rutube.ru/video/${rutubeId}/`,access:'free',price_minor:0,currency:'EUR',state:'draft'};

try{
 const created=await call('videos','POST',base);
 assert.equal(created.rutube_ref,rutubeId);
 assert.equal(created.source_ref,'');
 const edited=await call('videos/'+created.id,'PUT',{...base,youtube_ref:'https://youtu.be/abcdefghijk',vk_ref:'https://vk.com/video-123_456',revision:created.revision});
 assert.equal(edited.youtube_ref,'abcdefghijk');
 assert.equal(edited.vk_ref,'https://vk.com/video_ext.php?oid=-123&id=456');
 assert.equal(edited.rutube_ref,rutubeId);
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM videos WHERE id=?').get(created.id).count,1);
 await assert.rejects(call('videos','POST',{...base,rutube_ref:`https://evil.invalid/video/${rutubeId}/`}),/invalid_rutube_id/);
 await assert.rejects(call('videos','POST',{...base,access:'paid',price_minor:100}),/protected_storage_required/);
 console.log(JSON.stringify({checks:7,rutubeOnly:true,threeSourcesStoredOnOneRecord:true,invalidHostRejected:true,paidExternalSourceRejected:true,remoteWrites:0}));
}finally{
 fixture.close();
}
