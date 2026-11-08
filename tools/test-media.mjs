// Isolated in-memory fixtures. Never seed a real catalog with these records.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {handle} from '../media-worker/src/worker.mjs';
import {withLease} from '../media-worker/src/bunny.mjs';
import {HttpError} from '../media-worker/src/auth.mjs';
import {protectMediaPage} from '../media-worker/src/page-guard.mjs';
import {validateMediaRoutes} from './check-media-routes.mjs';
import {mediaTemplates} from '../media-worker/src/page-templates.mjs';
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
sql.exec(await fs.readFile(new URL('../media-worker/migrations/0003_media_members.sql',import.meta.url),'utf8'));
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
 await expect(200,'admin/me','GET',undefined,null,{Cookie:'CF_Authorization='+admin});
 await expect(401,'admin/me','GET',undefined,null,{Cookie:'CF_Authorization=forged'});
 await expect(401,'admin/me','GET',undefined,'forged',{Cookie:'CF_Authorization='+admin});
 await expect(401,'admin/me','GET',undefined,null,{Cookie:'CF_Authorization='+admin+'; CF_Authorization='+admin});
 await expect(401,'admin/me','GET',undefined,null,{Cookie:'CF_Authorization='+await token('admin-sub',{exp:1})});
 await expect(401,'admin/me','GET',undefined,null,{Cookie:'CF_Authorization='+await token('admin-sub',{aud:['other-app']})});
 await expect(403,'admin/me','GET',undefined,null,{Cookie:'CF_Authorization='+await token('unknown-sub')});
 await expect(401,'admin/me','GET',undefined,null,{'Cf-Access-Authenticated-User-Email':'local-fixture@example.invalid'});
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
 const provider=new Map();let providerCalls=0,deleteFails=false,providerFailure=null;
 globalThis.fetch=async (address,options={})=>{
  const url=new URL(address);if(url.hostname==='test-team.cloudflareaccess.com')return Response.json({keys:[jwk]});
  if(url.hostname==='vz-test.b-cdn.net'){
   assert.equal(options.redirect,'error');const expected=createHmac('sha256',env.BUNNY_CDN_TOKEN_KEY).update(url.pathname+url.searchParams.get('expires')).digest('base64url');assert.equal(url.searchParams.get('token'),'HS256-'+expected);
   return new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});
  }
  assert.equal(url.origin,'https://video.bunnycdn.com');assert.equal(options.headers.AccessKey,env.BUNNY_API_KEY);assert.ok(url.pathname.startsWith('/library/123/videos'));providerCalls++;
  if(providerFailure){if(providerFailure==='network')throw Error('PRIVATE_PROVIDER_SECRET');if(providerFailure==='timeout')throw new DOMException('PRIVATE_PROVIDER_SECRET','TimeoutError');if(providerFailure==='json')return new Response('PRIVATE_PROVIDER_SECRET',{status:200});return new Response('PRIVATE_PROVIDER_SECRET',{status:providerFailure})}
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
 const diagnosticLogs=[],originalWarn=console.warn;console.warn=entry=>diagnosticLogs.push(entry);
 try{
  for(const [upstream,code] of [[401,'bunny_auth_failed'],[403,'bunny_forbidden'],[404,'bunny_library_or_video_not_found'],[429,'bunny_rate_limited'],[500,'bunny_unavailable'],[400,'bunny_request_rejected'],['network','bunny_network_error'],['timeout','bunny_timeout'],['json','bunny_response_invalid']]){
   providerFailure=upstream;const response=await call(op+'upload','POST'),result=await response.json();assert.equal(response.status,502);assert.equal(result.error,code);assert.match(result.requestId,/^[a-f0-9-]{36}$/);assert.equal(response.headers.get('X-Mysterion-Request-ID'),result.requestId);assert.equal(result.upstreamStatus,typeof upstream==='number'?upstream:undefined);
   assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_SECRET'));assert.equal(provider.size,0);assert.equal(sql.prepare('SELECT source_ref FROM videos WHERE id=?').get(created.id).source_ref,'');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM bunny_leases').get().n,0);tests++;
  }
  assert.ok(diagnosticLogs.every(line=>!line.includes('PRIVATE_PROVIDER_SECRET')&&!line.includes(env.BUNNY_API_KEY)&&!line.includes(admin)));assert.ok(diagnosticLogs.every(line=>JSON.parse(line).phase==='bunny_create'));tests++;
 }finally{providerFailure=null;console.warn=originalWarn}
 const realDatabase=env.MEDIA_DB;
 for(const [message,code] of [['D1_ERROR: no such table: PRIVATE_DETAIL','bunny_store_schema_error'],['D1_ERROR: FOREIGN KEY constraint failed PRIVATE_DETAIL','bunny_store_constraint_error'],['D1_TYPE_ERROR: unsupported type for bind PRIVATE_DETAIL','bunny_store_binding_error'],['PRIVATE_DETAIL','bunny_store_unavailable']]){
  env.MEDIA_DB={...realDatabase,prepare(query){if(query.startsWith('INSERT INTO bunny_leases'))throw Error(message);return realDatabase.prepare(query)}};
  try{const result=await expect(503,op+'upload','POST');assert.equal(result.error,code);assert.equal(result.phase,'bunny_store_lease_acquire');assert.ok(!JSON.stringify(result).includes('PRIVATE_DETAIL'));assert.equal(provider.size,0)}finally{env.MEDIA_DB=realDatabase}
 }
 const badCleanup={MEDIA_DB:{prepare(query){return {bind(){return this},run(){if(query.startsWith('DELETE'))throw Error('PRIVATE_CLEANUP');return {meta:{changes:1}}}}}}};
 await assert.rejects(()=>withLease(badCleanup,created.id,()=>{throw new HttpError(502,'bunny_auth_failed')}),error=>error.message==='bunny_auth_failed');tests++;
 await assert.rejects(()=>withLease(badCleanup,created.id,()=>({ok:true})),error=>error.message==='bunny_store_unavailable'&&error.phase==='bunny_store_lease_release');tests++;
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
 const viewerAud=env.MEDIA_VIEWER_ACCESS_AUD;env.MEDIA_VIEWER_ACCESS_AUD=env.MEDIA_ACCESS_AUD;await expect(403,'view/play/'+created.id,'POST',undefined,admin);env.MEDIA_VIEWER_ACCESS_AUD=viewerAud;
 await expect(403,'view/play/'+created.id,'POST',undefined,viewer);
 sql.prepare('INSERT INTO purchases VALUES (?,?,?,?,?,?,?)').run('purchase','viewer',created.id,'test-payment','paid',100,'EUR');
 sql.prepare('INSERT INTO entitlements VALUES (?,?,?,?,?,?)').run('grant','viewer',created.id,'purchase',null,null);
 const permitted=await expect(200,'view/play/'+created.id,'POST',undefined,viewer);const signed=new URL(permitted.url);assert.equal(signed.searchParams.get('token'),createHash('sha256').update(env.BUNNY_TOKEN_KEY+row().source_ref+permitted.expires).digest('hex'));assert.ok(permitted.expires<Date.now()/1000+181);assert.ok(!permitted.url.includes(env.BUNNY_TOKEN_KEY));
 const distinctAudience=env.MEDIA_VIEWER_ACCESS_AUD;env.MEDIA_VIEWER_ACCESS_AUD=env.MEDIA_ACCESS_AUD;
 await expect(200,'view/play/'+created.id,'POST',undefined,await token('viewer-sub'));
 await expect(403,'admin/me','GET',undefined,await token('viewer-sub'));
 env.MEDIA_VIEWER_ACCESS_AUD=distinctAudience;
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

 // Members are opt-in: no queries to missing tables until migration is approved.
 await expect(503,'view/account','GET',undefined,viewer);
 env.MEDIA_MEMBERS_ENABLED='true';
 await expect(401,'view/account','GET',undefined,null);
 await expect(200,'view/account','GET',undefined,admin);
 const unknownViewer=await token('new-viewer',{aud:['viewer-audience']});
 assert.equal((await expect(200,'view/account','GET',undefined,unknownViewer)).registered,false);
 await expect(403,'admin/members','GET',undefined,editor);
 await expect(403,'admin/members','POST',{access_sub:'new-viewer'},admin,{Origin:'https://evil.invalid'});
 const member=await expect(200,'admin/members','POST',{access_sub:'new-viewer'});
 await expect(400,'admin/members','POST',{access_sub:'bad',role:'admin'});
 const baseGrant={user_id:member.id,video_id:created.id,expires_at:new Date(Date.now()+86400000).toISOString(),reason:'LOCAL TEST ONLY: confirmed manual permission'};
 await expect(400,'admin/grants','POST',{...baseGrant,expires_at:'invalid'});
 await expect(400,'admin/grants','POST',{...baseGrant,expires_at:'2000-01-01'});
 const bucketBefore=env.MEDIA_BUCKET;delete env.MEDIA_BUCKET;
 const imageBytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 const coverRequest=new Request('http://localhost/api/media/admin/videos/'+created.id+'/cover',{method:'PUT',headers:{'Cf-Access-Jwt-Assertion':admin,Origin:env.MEDIA_PUBLIC_ORIGIN,'Content-Type':'image/png'},body:imageBytes});
 assert.equal((await handle(coverRequest,env)).status,200);tests++;
 const imageResponse=await call('videos/'+created.id+'/cover','GET',undefined,null);
 assert.equal(imageResponse.status,200);assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()),imageBytes);tests++;
 env.MEDIA_BUCKET=bucketBefore;
 const purchasesBefore=sql.prepare('SELECT COUNT(*) AS n FROM purchases').get().n;
 await expect(200,'admin/grants','POST',baseGrant);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM purchases').get().n,purchasesBefore);
 assert.equal((await expect(200,'view/account','GET',undefined,unknownViewer)).items.length,1);
 await expect(200,'view/play/'+created.id,'POST',undefined,unknownViewer);
 const newGrant=sql.prepare('SELECT id FROM manual_grants WHERE user_id=?').get(member.id).id;
 await expect(200,'admin/grants/'+newGrant,'DELETE');
 await expect(403,'view/play/'+created.id,'POST',undefined,unknownViewer);
 await expect(200,'admin/grants','POST',baseGrant);
 sql.prepare('UPDATE manual_grants SET expires_at=? WHERE user_id=?').run('2000-01-01',member.id);
 await expect(403,'view/play/'+created.id,'POST',undefined,unknownViewer);
 await expect(200,'admin/grants','POST',baseGrant);
 await expect(200,'admin/members/'+member.id,'PUT',{active:0});
 await expect(403,'view/account','GET',undefined,unknownViewer);
 await expect(403,'view/play/'+created.id,'POST',undefined,unknownViewer);
 await expect(200,'admin/members/'+member.id,'PUT',{active:1});
 const collectionInput={title:{ru:'TEST',en:'TEST',de:'TEST'},description:{ru:'TEST',en:'TEST',de:'TEST'},state:'draft',videos:[created.id]};
 const c=await expect(200,'admin/collections','POST',collectionInput);
 assert.equal((await expect(200,'collections')).items.length,0);
 assert.equal((await expect(200,'videos?collection='+c.id)).items.length,0);
 await expect(200,'admin/collections/'+c.id,'PUT',{...collectionInput,state:'published'});
 assert.equal((await expect(200,'collections')).items.length,1);
 assert.equal((await expect(200,'videos?collection='+c.id)).items.length,1);
 await expect(403,'admin/collections','POST',collectionInput,editor);
 await expect(400,'admin/collections','POST',{...collectionInput,videos:[created.id,created.id]});
 await expect(200,'admin/collections/'+c.id,'DELETE');
 assert.equal((await expect(200,'collections')).items.length,0);
 assert.ok(sql.prepare('SELECT COUNT(*) AS n FROM membership_audit').get().n>5);


 const flow=await expect(201,'admin/videos','POST',{...bunnyRecord,access:'free',price_minor:0});
 const flowPath='admin/videos/'+flow.id;
 await expect(401,flowPath+'/publish','POST',{revision:1},null);
 await expect(403,flowPath+'/publish','POST',{revision:1},editor);
 await expect(403,flowPath+'/publish','POST',{revision:1},admin,{Origin:'https://evil.invalid'});
 await expect(200,flowPath+'/bunny/upload','POST');
 const flowRow=()=>sql.prepare('SELECT * FROM videos WHERE id=?').get(flow.id);
 await expect(409,flowPath+'/publish','POST',{revision:flowRow().revision});
 await expect(409,flowPath+'/bunny/retry','POST');
 const failedGuid=flowRow().source_ref;provider.get(failedGuid).status=5;
 await expect(403,flowPath+'/bunny/retry','POST',undefined,editor);
 await expect(200,flowPath+'/bunny/retry','POST');assert.notEqual(flowRow().source_ref,failedGuid);provider.delete(failedGuid); // fixture cleanup; production retains failed source
 provider.get(flowRow().source_ref).status=4;
 await expect(409,flowPath+'/publish','POST',{revision:flowRow().revision-1});
 await expect(400,flowPath+'/publish','POST',{revision:flowRow().revision,source_ref:'untrusted'});
 await expect(200,flowPath+'/publish','POST',{revision:flowRow().revision});assert.equal(flowRow().state,'published');
 await expect(200,'videos/'+flow.id+'/play','GET',undefined,null);
 await expect(200,flowPath+'/publish','POST',{revision:flowRow().revision-1});
 env.MEDIA_PAID_ENABLED='false';await expect(409,'admin/videos/'+created.id+'/publish','POST',{revision:row().revision});env.MEDIA_PAID_ENABLED='true';
 await expect(200,flowPath,'DELETE',undefined,admin,{'If-Match':String(flowRow().revision)});
 const importDraft=await expect(201,'admin/videos','POST',bunnyRecord);
 const importGuid=crypto.randomUUID();provider.set(importGuid,{guid:importGuid,videoLibraryId:123,status:4,encodeProgress:100,thumbnailFileName:'thumbnail.jpg'});
 await expect(403,'admin/videos/'+importDraft.id+'/bunny/import','POST',{guid:importGuid},editor);
 await expect(400,'admin/videos/'+importDraft.id+'/bunny/import','POST',{guid:'https://evil.invalid'});
 await expect(200,'admin/videos/'+importDraft.id+'/bunny/import','POST',{guid:importGuid});
 const imported=sql.prepare('SELECT * FROM videos WHERE id=?').get(importDraft.id);assert.equal(imported.source_ref,importGuid);assert.equal(imported.bunny_status,4);
 await expect(409,'admin/videos/'+importDraft.id+'/bunny/import','POST',{guid:importGuid});
 await expect(200,'admin/videos/'+importDraft.id,'DELETE',undefined,admin,{'If-Match':String(imported.revision)});
 env.MEDIA_MEMBERS_ENABLED='false';
 deleteFails=true;await expect(202,'admin/videos/'+created.id,'DELETE',undefined,admin,{'If-Match':String(row().revision)});assert.equal(row().bunny_delete_pending,1);await expect(404,'view/play/'+created.id,'POST',undefined,viewer);
 deleteFails=false;await expect(200,op+'delete','POST');assert.equal(provider.size,0);assert.equal(row().bunny_delete_pending,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM purchases').get().n,1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
 const bucket=env.MEDIA_BUCKET;delete env.MEDIA_BUCKET;await expect(200,'videos');await expect(503,'admin/videos/'+paid.id+'/cover','PUT','TEST');env.MEDIA_BUCKET=bucket;
 const canonical='https://mysterion-international.com',domainEnv={...env,MEDIA_PUBLIC_ORIGIN:canonical};
 const domainRequest=(origin,path='/api/media/admin/me',identity=admin,extra={})=>new Request(origin+path,{headers:{...(identity?{'Cf-Access-Jwt-Assertion':identity}:{}),...extra}});
 assert.equal((await handle(domainRequest(canonical),domainEnv)).status,200);tests++;
 for(const alternate of ['https://mysterion-international.pages.dev','https://preview.mysterion-international.pages.dev','https://www.mysterion-international.com','http://mysterion-international.com','https://mysterion-international.com:8443']){
  const response=await handle(domainRequest(alternate,undefined,admin,{Origin:canonical,Host:'mysterion-international.com','X-Forwarded-Host':'mysterion-international.com'}),domainEnv);assert.equal(response.status,421);tests++;
 }
 for(const badOrigin of ['',canonical+'/',canonical+'/path',canonical+'?x=1','https://user:password@mysterion-international.com','http://external.invalid']){assert.equal((await handle(domainRequest(canonical),{...domainEnv,MEDIA_PUBLIC_ORIGIN:badOrigin})).status,503);tests++}
 // Guard the HTML itself, even if external Access rules are missing on a hostname.
 let served=0;
 async function page(origin,path,identity,expected,pageEnv=domainEnv,headers={}){
  const before=served;
  const response=await protectMediaPage({request:domainRequest(origin,path,identity,headers),env:pageEnv,next:()=>{served++;return new Response('PRIVATE ADMIN TEMPLATE',{headers:{'Content-Type':'text/html'}})}});
  assert.equal(response.status,expected,origin+path);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(served-before,expected===200?1:0);const text=await response.text();assert.equal(text.includes('PRIVATE ADMIN TEMPLATE'),expected===200);tests++;
 }
 for(const path of ['/admin-media','/admin-media.html','/admin-media/','/%61dmin-media']){
  await page(canonical,path,null,401);await page(canonical,path,await token('viewer-sub'),403);await page(canonical,path,admin,200);
  await page('https://mysterion-international.pages.dev',path,admin,421);
  await page('https://preview.mysterion-international.pages.dev',path,admin,421);
 }
 await page(canonical,'/admin-media',admin.slice(0,-8)+'invalid',401);
 await page(canonical,'/admin-media',await token('disabled-sub'),403);
 await page(canonical,'/admin-media',admin,503,{...domainEnv,MEDIA_ENABLED:'false'});
 await page(canonical,'/admin-media',admin,503,{...domainEnv,MEDIA_PUBLIC_ORIGIN:undefined});
 await page(canonical,'/admin-media/private',admin,404);
 await page(canonical,'/media-login',null,401);
 await page(canonical,'/media-login',admin,200);
 await page(canonical,'/media-login',viewer,200);
 await page('https://preview.mysterion-international.pages.dev','/media-login.html',viewer,421);
 for(const lang of ['ru','en']){const response=await protectMediaPage({request:domainRequest(canonical,'/admin-media',null,{'Accept-Language':lang}),env:domainEnv,next:()=>{throw Error('Must not serve protected page')}});assert.ok((await response.text()).includes('lang="'+lang+'"'));tests++}
 const redirected=await protectMediaPage({request:domainRequest(canonical,'/admin-media.html',admin),env:domainEnv,next:()=>new Response(null,{status:308,headers:{Location:'/admin-media'}})});assert.equal(redirected.status,308);assert.equal(redirected.headers.get('Location'),'/admin-media');tests++;
 const routes=JSON.parse(await fs.readFile(new URL('../_routes.json',import.meta.url),'utf8'));validateMediaRoutes(routes);assert.throws(()=>validateMediaRoutes({...routes,include:[...routes.include,'/admin-media/']}),/Overlapping Pages route/);tests++;
 for(const [identity,expected] of [[null,401],[await token('viewer-sub'),403],[admin,200]]){
  const response=await protectMediaPage({request:domainRequest(canonical,'/admin-media.html',identity),env:domainEnv,next:()=>{throw Error('Must not use static fallback for server-rendered UI')}},mediaTemplates);
  assert.equal(response.status,expected);assert.equal((await response.text()).includes('id="media-editor"'),expected===200);tests++;
 }
 for(const file of ['admin-media.html','media-login.html']){const fallback=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');assert.ok(!fallback.includes('id="media-editor"'));assert.ok(!fallback.includes('<form'));assert.ok(!fallback.includes('src="admin-media.js"'));tests++}

 // Session metadata is signed server identity, never a frontend role or email.
 assert.equal((await expect(200,'session','GET',undefined,null)).authenticated,false);
 const adminSession=await expect(200,'session');assert.equal(adminSession.authenticated,true);assert.equal(adminSession.canManage,true);assert.equal(adminSession.role,'admin');assert.ok(!('sub' in adminSession));assert.ok(!('email' in adminSession));
 const editorSession=await expect(200,'session','GET',undefined,editor);assert.equal(editorSession.canManage,false);
 const viewerSession=await expect(200,'session','GET',undefined,viewer);assert.equal(viewerSession.authenticated,true);assert.equal(viewerSession.canManage,false);
 assert.equal((await expect(200,'session','GET',undefined,await token('disabled-sub'))).authenticated,false);
 assert.equal((await expect(200,'session','GET',undefined,await token('admin-sub',{exp:1}))).reason,'session_expired');
 assert.equal((await expect(200,'session','GET',undefined,await token('admin-sub',{aud:['not-trusted']}))).authenticated,false);
 const langRecord={...record,title:{ru:'РУ',en:'EN',de:'LEGACY_DE'},description:{ru:'',en:'',de:'LEGACY_DESCRIPTION'}};
 const oldLanguage=await expect(201,'admin/videos','POST',langRecord);
 await expect(200,'admin/videos/'+oldLanguage.id,'PUT',{...langRecord,title:{ru:'Новый',en:'New'},description:{ru:'',en:''},revision:1});
 const preserved=sql.prepare('SELECT title,description FROM videos WHERE id=?').get(oldLanguage.id);assert.equal(JSON.parse(preserved.title).de,'LEGACY_DE');assert.equal(JSON.parse(preserved.description).de,'LEGACY_DESCRIPTION');
 const interfaceRow=(await expect(200,'admin/videos')).items.find(r=>r.id===oldLanguage.id);assert.ok(!('de' in interfaceRow.title));
 env.MEDIA_MEMBERS_ENABLED='true';
 const legacyCollection=await expect(200,'admin/collections','POST',{title:{ru:'RU',en:'EN',de:'OLD_COLLECTION'},description:{ru:'RU',en:'EN',de:'OLD_DESCRIPTION'},state:'draft',videos:[]});
 await expect(200,'admin/collections/'+legacyCollection.id,'PUT',{title:{ru:'RU2',en:'EN2'},description:{ru:'RU',en:'EN'},state:'draft',videos:[]});assert.equal(JSON.parse(sql.prepare('SELECT title FROM collections WHERE id=?').get(legacyCollection.id).title).de,'OLD_COLLECTION');
 env.MEDIA_MEMBERS_ENABLED='false';
 // Errors stay fail-closed but expose only fixed diagnostic codes, not secrets.
 const warnings=[],warnOriginal=console.warn;console.warn=(...args)=>warnings.push(args.join(' '));
 try {
  async function diagnosed(pageEnv,identity,expectedStatus,expectedCode,templates=mediaTemplates,next=()=>{throw Error('must not serve')}){
   const response=await protectMediaPage({request:domainRequest(canonical,'/admin-media.html',identity),env:pageEnv,next},templates);
   assert.equal(response.status,expectedStatus);assert.equal(response.headers.get('X-Mysterion-Media-Error'),expectedCode);
   const body=await response.text();assert.ok(body.includes(expectedCode));assert.ok(!body.includes('id="media-editor"'));assert.ok(!body.includes('PRIVATE_EXCEPTION_MARKER'));assert.ok(!body.includes(admin));tests++;
  }
  await diagnosed({...domainEnv,MEDIA_PUBLIC_ORIGIN:undefined},admin,503,'origin_not_configured');
  await diagnosed({...domainEnv,MEDIA_ENABLED:'false'},admin,503,'media_disabled');
  await diagnosed({...domainEnv,MEDIA_DB:undefined},admin,503,'database_not_bound');
  await diagnosed({...domainEnv,MEDIA_ACCESS_ISSUER:'invalid'},admin,503,'access_issuer_not_configured');
  await diagnosed({...domainEnv,MEDIA_ACCESS_AUD:''},admin,503,'access_audience_not_configured');
  await diagnosed(domainEnv,null,401,'authentication_required');
  await diagnosed(domainEnv,await token('unknown-sub'),403,'forbidden');
  await diagnosed(domainEnv,await token('disabled-sub'),403,'forbidden');
  await diagnosed({...domainEnv,MEDIA_DB:{prepare(){throw Error('PRIVATE_EXCEPTION_MARKER '+admin)}}},admin,503,'identity_store_unavailable');
  await diagnosed(domainEnv,admin,503,'internal_unavailable',null,()=>{throw Error('PRIVATE_EXCEPTION_MARKER '+admin)});
  assert.ok(warnings.every(line=>!line.includes(admin)&&!line.includes('PRIVATE_EXCEPTION_MARKER')));
  assert.ok(warnings.map(line=>JSON.parse(line)).every(entry=>entry.event==='mysterion_media_unavailable'&&Object.keys(entry).sort().join(',')==='code,event,phase'));tests++;
 }finally{console.warn=warnOriginal}
 console.log(JSON.stringify({passed:tests,sqlite:'in-memory only; populated migration preserves relations',bunny:'mock API only; SHA256 and HMAC signatures independently checked',paidPlayback:'JWT + active user + paid purchase + current entitlement',domain:'canonical URL pinned; pages.dev and preview rejected',protectedHTML:'JWT checked before serving template; safe diagnostics distinguish configuration, identity and D1 failures',productionMigrations:0,realBunnyResources:0}));
}finally{globalThis.fetch=fetchOriginal;sql.close()}
