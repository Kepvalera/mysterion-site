// Isolated in-memory fixtures. Never seed a real catalog with these records.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {handle} from '../media-worker/src/worker.mjs';
const sql=new DatabaseSync(':memory:');sql.exec(await fs.readFile(new URL('../media-worker/migrations/0001_media.sql',import.meta.url),'utf8'));
// Migration must preserve existing foreign-key relationships, not just an empty schema.
sql.exec(`INSERT INTO users VALUES ('migration-user','migration-sub','viewer',1);
 INSERT INTO videos VALUES ('migration-video','{}','{}','sermon',2026,'r2','videos/legacy.mp4','free',0,'EUR','draft','2026-01-01T00:00:00.000Z',NULL,NULL,1,'2026-01-01T00:00:00.000Z','migration');
 INSERT INTO purchases VALUES ('migration-purchase','migration-user','migration-video','migration-ref','paid',100,'EUR');
 INSERT INTO entitlements VALUES ('migration-grant','migration-user','migration-video','migration-purchase',NULL,NULL);
 INSERT INTO audit_log VALUES ('migration-audit','migration-user','migration-video','create','2026-01-01T00:00:00.000Z');`);
sql.exec('BEGIN');sql.exec(await fs.readFile(new URL('../media-worker/migrations/0002_bunny_stream.sql',import.meta.url),'utf8'));sql.exec('COMMIT');
assert.equal(sql.prepare('SELECT source_ref FROM videos WHERE id=?').get('migration-video').source_ref,'videos/legacy.mp4');
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM purchases').get().n,1);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM entitlements').get().n,1);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,1);
assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
sql.exec('DELETE FROM audit_log;DELETE FROM entitlements;DELETE FROM purchases;DELETE FROM videos;DELETE FROM users;');
const prepare=query=>({bind(...args){this.args=args;return this},first(){return sql.prepare(query).get(...(this.args||[]))||null},all(){return {results:sql.prepare(query).all(...(this.args||[]))}},run(){const result=sql.prepare(query).run(...(this.args||[]));return {meta:{changes:Number(result.changes)}}}});
const objects=new Map();const env={MEDIA_ENABLED:'true',MEDIA_PUBLIC_ORIGIN:'http://localhost',MEDIA_ACCESS_ISSUER:'https://test-team.cloudflareaccess.com',MEDIA_ACCESS_AUD:'test-audience',MEDIA_DB:{prepare,batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}},MEDIA_BUCKET:{head:async key=>objects.has(key)?{}:null,put:async(key,value)=>objects.set(key,value),delete:async key=>objects.delete(key),get:async key=>objects.has(key)?{body:objects.get(key),size:objects.get(key).length}:null}};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='local-test-key';
const fetchOriginal=globalThis.fetch;globalThis.fetch=async url=>{assert.equal(url,env.MEDIA_ACCESS_ISSUER+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]})};
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function token(sub='admin-sub',overrides={},header={alg:'RS256',kid:jwk.kid}){const payload=b64(header)+'.'+b64({iss:env.MEDIA_ACCESS_ISSUER,aud:[env.MEDIA_ACCESS_AUD],iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,sub,...overrides});return payload+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(payload))).toString('base64url')}
sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('admin','admin-sub','admin',1);sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('editor','editor-sub','editor',1);sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('viewer','viewer-sub','viewer',1);sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('disabled','disabled-sub','admin',0);
const admin=await token(),editor=await token('editor-sub');let tests=0;
async function call(path='',method='GET',data,identity=admin,headers={}){return handle(new Request('http://localhost/api/media/'+path,{method,headers:{...(identity?{'Cf-Access-Jwt-Assertion':identity}:{}),...(method!=='GET'?{Origin:env.MEDIA_PUBLIC_ORIGIN,'Content-Type':'application/json'}:{}),...headers},...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}),env)}
async function expect(status,path,method,data,identity,headers){const response=await call(path,method,data,identity,headers);assert.equal(response.status,status,`${path} ${await response.clone().text()}`);tests++;return response.json()}
try{
 assert.equal((await handle(new Request('http://localhost/api/media/videos'),{})).status,503);tests++;
 await expect(401,'admin/me','GET',undefined,null);
 for(const bad of [await token('admin-sub',{exp:1}),await token('admin-sub',{aud:['wrong']}),await token('admin-sub',{iss:'https://evil.invalid'}),await token('admin-sub',{}, {alg:'none',kid:jwk.kid}),admin.slice(0,-10)+'aaaaaaaaaa'])await expect(401,'admin/me','GET',undefined,bad);
 for(const sub of ['viewer-sub','disabled-sub','unknown-sub'])await expect(403,'admin/me','GET',undefined,await token(sub));
 await expect(200,'admin/me');
 const record={title:{ru:'TEST_ONLY',en:'TEST_ONLY',de:'TEST_ONLY'},description:{ru:'',en:'',de:''},category:'sermon',year:2026,source_type:'youtube',source_ref:'abcdefghijk',access:'free',price_minor:0,currency:'EUR',state:'draft',publish_at:new Date().toISOString()};
 await expect(403,'admin/videos','POST',record,admin,{Origin:'https://evil.invalid'});
 await expect(403,'admin/videos','POST',record,admin,{Origin:''});
 await expect(415,'admin/videos','POST',record,admin,{'Content-Type':'text/plain'});
 await expect(413,'admin/videos','POST','x'.repeat(33000));
 await expect(400,'admin/videos','POST',{...record,extra:'bad'});
 await expect(400,'admin/videos','POST',{...record,source_ref:'javascript:alert(1)'});
 await expect(400,'admin/videos','POST',{...record,access:'paid',price_minor:100});
 await expect(409,'admin/videos','POST',{...record,access:'paid',source_type:'bunny',source_ref:'00000000-0000-4000-8000-000000000000',price_minor:100,state:'published'});
 await expect(403,'admin/videos','POST',{...record,state:'published'},editor);
 const {id}=await expect(201,'admin/videos','POST',record,editor);
 assert.equal((await expect(200,'videos')).items.length,0);
 await expect(200,'admin/videos/'+id,'PUT',{...record,revision:1,state:'published'});
 await expect(409,'admin/videos/'+id,'PUT',{...record,revision:1});
 const catalog=await expect(200,'videos?q=TEST');assert.equal(catalog.items.length,1);assert.ok(!JSON.stringify(catalog).includes('abcdefghijk'));assert.ok(!('source_ref' in catalog.items[0]));
 await expect(200,'videos/'+id+'/play','GET',undefined,null);
 await expect(400,'videos?category=unknown');assert.equal((await expect(200,'videos?q=%27%20OR%201%3D1--')).items.length,0);
 await expect(415,'admin/videos/'+id+'/cover','PUT','<svg onload="bad"/>');
 await expect(403,'admin/videos/'+id,'DELETE',undefined,editor,{'If-Match':'2'});
 await expect(409,'admin/videos/'+id,'DELETE',undefined,admin,{'If-Match':'1'});
 await expect(200,'admin/videos/'+id,'DELETE',undefined,admin,{'If-Match':'2'});
 await expect(404,'videos/'+id+'/play');assert.equal((await expect(200,'videos')).items.length,0);
 const paid=await expect(201,'admin/videos','POST',{...record,source_type:'bunny',source_ref:'',access:'paid',price_minor:100});sql.prepare("UPDATE videos SET state='published' WHERE id=?").run(paid.id);await expect(402,'videos/'+paid.id+'/play');await expect(402,'videos/'+paid.id+'/stream');
 // Provider calls are intercepted locally: no paid Bunny resources are ever created.
 const {createHash,createHmac}=await import('node:crypto');
 Object.assign(env,{BUNNY_ENABLED:'true',BUNNY_SECURITY_CONFIRMED:'true',BUNNY_LIBRARY_ID:'123',BUNNY_API_KEY:crypto.randomUUID(),BUNNY_TOKEN_KEY:crypto.randomUUID(),BUNNY_CDN_TOKEN_KEY:crypto.randomUUID(),BUNNY_CDN_HOST:'vz-test.b-cdn.net',MEDIA_VIEWER_ACCESS_AUD:'viewer-audience'});
 const provider=new Map();let providerCalls=0,deleteFails=false;
 globalThis.fetch=async (address,options={})=>{
  const url=new URL(address);if(url.hostname==='test-team.cloudflareaccess.com')return Response.json({keys:[jwk]});
  if(url.hostname==='vz-test.b-cdn.net'){
   assert.equal(options.redirect,'error');const expected=createHmac('sha256',env.BUNNY_CDN_TOKEN_KEY).update(url.pathname+url.searchParams.get('expires')).digest('base64url');assert.equal(url.searchParams.get('token'),'HS256-'+expected);
   return new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});
  }
  assert.equal(url.origin,'https://video.bunnycdn.com');assert.equal(options.headers.AccessKey,env.BUNNY_API_KEY);assert.ok(url.pathname.startsWith('/library/123/videos'));providerCalls++;
  const id=url.pathname.split('/')[4],method=options.method||'GET';
  if(method==='POST'&&!id){const guid=crypto.randomUUID();provider.set(guid,{guid,videoLibraryId:123,status:0,encodeProgress:0,thumbnailFileName:'thumbnail.jpg'});return Response.json(provider.get(guid))}
  if(!provider.has(id))return Response.json({error:'not found'},{status:404});
  if(method==='DELETE'){if(deleteFails)return Response.json({error:'upstream failure: secret must not escape'},{status:500});provider.delete(id);return Response.json({success:true})}
  if(method==='POST'){const data=JSON.parse(options.body);provider.get(id).title=data.title;return Response.json({success:true})}
  return Response.json(provider.get(id));
 };
 const bunnyRecord={...record,source_type:'bunny',source_ref:'',access:'paid',price_minor:100};
 const created=await expect(201,'admin/videos','POST',bunnyRecord);
 const op='admin/videos/'+created.id+'/bunny/';
 await expect(401,op+'upload','POST',undefined,null);
 await expect(403,op+'upload','POST',undefined,editor);
 await expect(403,op+'upload','POST',undefined,admin,{Origin:'https://evil.invalid'});
 const before=providerCalls;env.BUNNY_SECURITY_CONFIRMED='false';await expect(503,op+'upload','POST');assert.equal(providerCalls,before);env.BUNNY_SECURITY_CONFIRMED='true';
 await expect(403,'admin/videos','POST',{...bunnyRecord,source_ref:crypto.randomUUID()});
 const grant=await expect(200,op+'upload','POST');
 const row=()=>sql.prepare('SELECT * FROM videos WHERE id=?').get(created.id);
 assert.equal(grant.headers.VideoId,row().source_ref);assert.equal(grant.headers.LibraryId,'123');assert.ok(grant.expires>Date.now()/1000&&grant.expires<Date.now()/1000+901);
 assert.equal(grant.headers.AuthorizationSignature,createHash('sha256').update('123'+env.BUNNY_API_KEY+grant.expires+row().source_ref).digest('hex'));
 assert.ok(!JSON.stringify(grant).includes(env.BUNNY_API_KEY));assert.ok(!JSON.stringify(grant).includes(env.BUNNY_TOKEN_KEY));
 await expect(200,op+'upload','POST');assert.equal(provider.size,1);
 sql.prepare('INSERT INTO bunny_leases VALUES (?,?,?)').run(created.id,'busy',Math.floor(Date.now()/1000)+60);await expect(409,op+'upload','POST');sql.prepare('DELETE FROM bunny_leases').run();
 await expect(409,'admin/videos/'+created.id,'PUT',{...bunnyRecord,source_ref:crypto.randomUUID(),revision:row().revision});
 env.MEDIA_PAID_ENABLED='true';
 await expect(409,'admin/videos/'+created.id,'PUT',{...bunnyRecord,source_ref:row().source_ref,revision:row().revision,state:'published'});
 provider.get(row().source_ref).status=4;provider.get(row().source_ref).encodeProgress=100;
 const synced=await expect(200,op+'sync','POST');assert.equal(synced.ready,true);
 await expect(409,op+'upload','POST');
 const preview=await expect(200,op+'preview','POST');assert.equal(preview.type,'bunny');
 await expect(200,'admin/videos/'+created.id,'PUT',{...bunnyRecord,source_ref:row().source_ref,revision:row().revision,state:'published'});
 const catalogBunny=await expect(200,'videos');assert.ok(!JSON.stringify(catalogBunny).includes(row().source_ref));assert.ok(!JSON.stringify(catalogBunny).includes('thumbnail.jpg'));
 const coverResponse=await call('videos/'+created.id+'/cover','GET',undefined,null);assert.equal(coverResponse.status,200);tests++;
 await expect(401,'view/play/'+created.id,'POST',undefined,null);
 await expect(401,'view/play/'+created.id,'POST',undefined,admin); // Admin application's audience cannot impersonate a viewer.
 const viewer=await token('viewer-sub',{aud:['viewer-audience']});
 const viewerAud=env.MEDIA_VIEWER_ACCESS_AUD;env.MEDIA_VIEWER_ACCESS_AUD=env.MEDIA_ACCESS_AUD;await expect(503,'view/play/'+created.id,'POST',undefined,admin);env.MEDIA_VIEWER_ACCESS_AUD=viewerAud;
 await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare('INSERT INTO purchases VALUES (?,?,?,?,?,?,?)').run('purchase','viewer',created.id,'test-payment','paid',100,'EUR');
 sql.prepare('INSERT INTO entitlements VALUES (?,?,?,?,?,?)').run('grant','viewer',created.id,'purchase',null,null);
 const permitted=await expect(200,'view/play/'+created.id,'POST',undefined,viewer);const signed=new URL(permitted.url);assert.equal(signed.searchParams.get('token'),createHash('sha256').update(env.BUNNY_TOKEN_KEY+row().source_ref+permitted.expires).digest('hex'));assert.ok(permitted.expires<Date.now()/1000+181);assert.ok(!permitted.url.includes(env.BUNNY_TOKEN_KEY));
 await expect(403,'view/play/'+created.id,'POST',undefined,viewer,{Origin:'https://evil.invalid'});
 sql.prepare("UPDATE purchases SET status='refunded' WHERE id='purchase'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare("UPDATE purchases SET status='paid' WHERE id='purchase'").run();sql.prepare("UPDATE entitlements SET revoked_at='2026-01-01' WHERE id='grant'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare("UPDATE entitlements SET revoked_at=NULL,expires_at='2000-01-01' WHERE id='grant'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare("UPDATE entitlements SET expires_at='invalid-date' WHERE id='grant'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare("UPDATE entitlements SET expires_at=NULL,purchase_id=NULL WHERE id='grant'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare("UPDATE entitlements SET purchase_id='purchase' WHERE id='grant'").run();sql.prepare("UPDATE purchases SET user_id='admin' WHERE id='purchase'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);sql.prepare("UPDATE purchases SET user_id='viewer' WHERE id='purchase'").run();
 sql.prepare("UPDATE entitlements SET expires_at=NULL WHERE id='grant'").run();sql.prepare("UPDATE users SET active=0 WHERE id='viewer'").run();await expect(403,'view/play/'+created.id,'POST',undefined,viewer);sql.prepare("UPDATE users SET active=1 WHERE id='viewer'").run();
 env.MEDIA_PAID_ENABLED='false';await expect(503,'view/play/'+created.id,'POST',undefined,viewer);env.MEDIA_PAID_ENABLED='true';
 await expect(402,'videos/'+created.id+'/play');await expect(402,'videos/'+created.id+'/stream');
 deleteFails=true;await expect(202,'admin/videos/'+created.id,'DELETE',undefined,admin,{'If-Match':String(row().revision)});assert.equal(row().bunny_delete_pending,1);await expect(404,'view/play/'+created.id,'POST',undefined,viewer);
 deleteFails=false;await expect(200,op+'delete','POST');assert.equal(provider.size,0);assert.equal(row().bunny_delete_pending,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM purchases').get().n,1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 const bucket=env.MEDIA_BUCKET;delete env.MEDIA_BUCKET;await expect(200,'videos');await expect(503,'admin/videos/'+paid.id+'/cover','PUT','TEST');env.MEDIA_BUCKET=bucket;
 console.log(JSON.stringify({passed:tests,sqlite:'in-memory only; populated migration preserves relations',bunny:'mock API only; SHA256 and HMAC signatures independently checked',paidPlayback:'JWT + active user + paid purchase + current entitlement',productionMigrations:0,realBunnyResources:0}));
}finally{globalThis.fetch=fetchOriginal;sql.close()}
