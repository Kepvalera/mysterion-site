/* Isolated in-memory test data only. Never connects to Cloudflare. */
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs/promises';
export async function platformFixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of (await fs.readdir('media-worker/migrations')).filter(f=>/^000[1-8]_/.test(f)).sort()){db.exec('BEGIN');try{db.exec(await fs.readFile('media-worker/migrations/'+name,'utf8'));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
 const prepare=sql=>({args:[],bind(...args){this.args=args;return this},first(){return db.prepare(sql).get(...this.args)||null},all(){return {results:db.prepare(sql).all(...this.args)}},run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}}}});
 const env={MEDIA_ENABLED:'true',VIEWER_AUTH_ENABLED:'true',VIEWER_PLATFORM_ENABLED:'true',MEDIA_PAID_ENABLED:'false',MEDIA_PUBLIC_ORIGIN:'https://local.invalid',VIEWER_RATE_KEY:'LOCAL_PLATFORM_FIXTURE_RATE_KEY_NOT_A_SECRET',MEDIA_ACCESS_ISSUER:'https://platform-test.cloudflareaccess.com',MEDIA_ACCESS_AUD:'local-platform-only',MEDIA_DB:{prepare,batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}};
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'local-platform'};
 const encode=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
 const token=async(sub,claims={})=>{const a=encode({alg:'RS256',kid:jwk.kid}),b=encode({iss:env.MEDIA_ACCESS_ISSUER,aud:env.MEDIA_ACCESS_AUD,sub,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...claims});return a+'.'+b+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(a+'.'+b))).toString('base64url')};
 const originalFetch=globalThis.fetch;globalThis.fetch=async(input,...args)=>{if(String(input)===env.MEDIA_ACCESS_ISSUER+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});return originalFetch(input,...args)};
 const staff={};for(const role of ['owner','publisher','uploader']){const sub='local-fixture-'+role+'-subject';db.prepare('INSERT INTO platform_staff VALUES (?,?,1,?,?)').run(sub,role,1,1);staff[role]=await token(sub)}
 return {db,env,staff,token,close(){globalThis.fetch=originalFetch;db.close()}};
}
