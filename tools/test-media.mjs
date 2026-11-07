// Isolated in-memory fixtures. Never seed a real catalog with these records.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {handle} from '../media-worker/src/worker.mjs';
const sql=new DatabaseSync(':memory:');sql.exec(await fs.readFile(new URL('../media-worker/migrations/0001_media.sql',import.meta.url),'utf8'));
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
 await expect(409,'admin/videos','POST',{...record,access:'paid',source_type:'r2',source_ref:'videos/test.mp4',price_minor:100,state:'published'});
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
 const paid=await expect(201,'admin/videos','POST',{...record,source_type:'r2',source_ref:'videos/test.mp4',access:'paid',price_minor:100});sql.prepare("UPDATE videos SET state='published' WHERE id=?").run(paid.id);await expect(402,'videos/'+paid.id+'/play');await expect(402,'videos/'+paid.id+'/stream');
 console.log(JSON.stringify({passed:tests,sqlite:'in-memory only',paidPlayback:'blocked',productionMigrations:0}));
}finally{globalThis.fetch=fetchOriginal;sql.close()}
