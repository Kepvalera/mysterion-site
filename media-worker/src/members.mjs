import {HttpError, verifyAccess} from './auth.mjs';
const deny=(status,code)=>{throw new HttpError(status,code)};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const now=()=>new Date().toISOString();
export async function viewerIdentity(request,env) {
 if(!env.MEDIA_VIEWER_ACCESS_AUD || env.MEDIA_VIEWER_ACCESS_AUD===env.MEDIA_ACCESS_AUD)deny(503,'viewer_identity_not_configured');
 return verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'),{...env,MEDIA_ACCESS_AUD:env.MEDIA_VIEWER_ACCESS_AUD});
}
function text(value,max=500){if(typeof value!=='string'||!value.trim()||value.length>max)deny(400,'invalid_fields');return value.trim()}
function translations(value,max){if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['ru','en','de'].includes(k)))deny(400,'invalid_translation');return JSON.stringify(Object.fromEntries(['ru','en','de'].map(k=>[k,text(value[k],max)])))}
const id=value=>{if(!uuid.test(value||''))deny(400,'invalid_id');return value};
const rows=async stmt=>(await stmt.all()).results;
async function auditBatch(env,user,action,target,detail,statements){
 return env.MEDIA_DB.batch([...statements,env.MEDIA_DB.prepare('INSERT INTO membership_audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,action,target,JSON.stringify(detail),now())]);
}
export async function memberRoute(request,env,path,method,user,readBody) {
 if(env.MEDIA_MEMBERS_ENABLED!=='true')deny(503,'members_not_configured');
 const db=env.MEDIA_DB;
 const inputBody=async()=>{const value=await readBody(request);if(!value||typeof value!=='object'||Array.isArray(value))deny(400,'invalid_fields');return value};
 if(path==='view/account' && method==='GET'){
  const claims=await viewerIdentity(request,env);
  const account=await db.prepare('SELECT id,active FROM users WHERE access_sub=?').bind(claims.sub).first();
  // The identity comes only from the verified JWT. Never echo the bearer token.
  if(!account)return {identity:claims.sub,registered:false,items:[]};
  if(!account.active)deny(403,'account_disabled');
  const items=await rows(db.prepare(`SELECT v.id,v.title,v.description,v.category,v.year,v.access,
   CASE WHEN p.id IS NOT NULL AND e.expires_at IS NULL THEN NULL
    WHEN g.id IS NULL THEN e.expires_at WHEN p.id IS NULL THEN g.expires_at
    WHEN julianday(g.expires_at)>julianday(e.expires_at) THEN g.expires_at ELSE e.expires_at END AS expires_at
   FROM videos v
   LEFT JOIN manual_grants g ON g.video_id=v.id AND g.user_id=? AND g.revoked_at IS NULL AND julianday(g.expires_at)>julianday(?)
   LEFT JOIN entitlements e ON e.video_id=v.id AND e.user_id=? AND e.revoked_at IS NULL AND (e.expires_at IS NULL OR julianday(e.expires_at)>julianday(?))
   LEFT JOIN purchases p ON p.id=e.purchase_id AND p.user_id=e.user_id AND p.video_id=e.video_id AND p.status='paid'
   WHERE v.state='published' AND v.publish_at<=? AND (g.id IS NOT NULL OR p.id IS NOT NULL)
   ORDER BY v.publish_at DESC LIMIT 200`).bind(account.id,now(),account.id,now(),now()));
  return {registered:true,items:items.map(r=>({...r,title:JSON.parse(r.title),description:JSON.parse(r.description)}))};
 }
 if(!user||user.role!=='admin')deny(403,'admin_required');
 if(path==='admin/members' && method==='GET')return {users:await rows(db.prepare('SELECT id,access_sub,role,active FROM users ORDER BY id LIMIT 500')),grants:await rows(db.prepare('SELECT * FROM manual_grants ORDER BY created_at DESC LIMIT 500'))};
 if(path==='admin/members' && method==='POST'){
  const input=await inputBody(),sub=text(input.access_sub,256),uid=crypto.randomUUID();
  if(Object.keys(input).some(k=>k!=='access_sub'))deny(400,'invalid_fields');
  await auditBatch(env,user,'viewer_create',uid,{},[db.prepare("INSERT INTO users(id,access_sub,role,active) VALUES (?,?,'viewer',1)").bind(uid,sub)]);
  return {id:uid};
 }
 const member=path.match(/^admin\/members\/([a-f0-9-]{36})$/);
 if(member && method==='PUT'){
  const input=await inputBody();if(Object.keys(input).length!==1||![0,1].includes(input.active))deny(400,'invalid_fields');
  const target=await db.prepare("SELECT id FROM users WHERE id=? AND role='viewer'").bind(id(member[1])).first();if(!target)deny(404,'not_found');
  await auditBatch(env,user,'viewer_active',target.id,{active:input.active},[db.prepare("UPDATE users SET active=? WHERE id=? AND role='viewer'").bind(input.active,target.id)]);return {ok:true};
 }
 if(path==='admin/grants' && method==='POST'){
  const input=await inputBody();
  if(Object.keys(input).some(k=>!['user_id','video_id','expires_at','reason'].includes(k)))deny(400,'invalid_fields');
  const uid=id(input.user_id),vid=id(input.video_id),reason=text(input.reason),date=new Date(input.expires_at);
  if(!Number.isFinite(date.getTime())||date<=new Date())deny(400,'invalid_expiry');
  if(!await db.prepare("SELECT id FROM users WHERE id=? AND role='viewer' AND active=1").bind(uid).first()||!await db.prepare("SELECT id FROM videos WHERE id=? AND state!='deleted'").bind(vid).first())deny(404,'not_found');
  await auditBatch(env,user,'manual_grant',uid,{video_id:vid,expires_at:date.toISOString(),reason},[db.prepare(`INSERT INTO manual_grants VALUES (?,?,?,?,NULL,?,?,?) ON CONFLICT(user_id,video_id) DO UPDATE SET expires_at=excluded.expires_at,revoked_at=NULL,granted_by=excluded.granted_by,reason=excluded.reason,created_at=excluded.created_at`).bind(crypto.randomUUID(),uid,vid,date.toISOString(),user.id,reason,now())]);return {ok:true};
 }
 const grant=path.match(/^admin\/grants\/([a-f0-9-]{36})$/);
 if(grant && method==='DELETE'){
  if(!await db.prepare('SELECT id FROM manual_grants WHERE id=?').bind(id(grant[1])).first())deny(404,'not_found');
  await auditBatch(env,user,'manual_revoke',grant[1],{},[db.prepare('UPDATE manual_grants SET revoked_at=? WHERE id=?').bind(now(),grant[1])]);return {ok:true};
 }
 if(path==='admin/collections' && method==='GET')return {items:(await rows(db.prepare('SELECT * FROM collections ORDER BY created_at DESC LIMIT 200'))).map(r=>({...r,title:JSON.parse(r.title),description:JSON.parse(r.description)}))};
 const collection=path.match(/^admin\/collections\/([a-f0-9-]{36})$/);
 if(path==='admin/collections' && method==='POST'||collection && method==='PUT'){
  const input=await inputBody(),cid=collection?id(collection[1]):crypto.randomUUID();
  if(Object.keys(input).some(k=>!['title','description','state','videos'].includes(k))||!['draft','published'].includes(input.state)||!Array.isArray(input.videos)||input.videos.length>20||new Set(input.videos).size!==input.videos.length)deny(400,'invalid_fields');
  const title=translations(input.title,180),description=translations(input.description,4000);
  if(collection&&!await db.prepare('SELECT id FROM collections WHERE id=?').bind(cid).first())deny(404,'not_found');
  for(const vid of input.videos)if(!await db.prepare("SELECT id FROM videos WHERE id=? AND state!='deleted'").bind(id(vid)).first())deny(404,'not_found');
  const statements=[db.prepare('INSERT INTO collections VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,state=excluded.state').bind(cid,title,description,input.state,now()),db.prepare('DELETE FROM collection_videos WHERE collection_id=?').bind(cid),...input.videos.map((vid,i)=>db.prepare('INSERT INTO collection_videos VALUES (?,?,?)').bind(cid,vid,i))];
  await auditBatch(env,user,'collection_save',cid,{videos:input.videos},statements);return {id:cid};
 }
 if(collection && method==='GET')return {items:await rows(db.prepare('SELECT video_id FROM collection_videos WHERE collection_id=? ORDER BY position').bind(id(collection[1])))};
 if(collection && method==='DELETE'){
  await auditBatch(env,user,'collection_delete',id(collection[1]),{},[db.prepare('DELETE FROM collection_videos WHERE collection_id=?').bind(collection[1]),db.prepare('DELETE FROM collections WHERE id=?').bind(collection[1])]);return {ok:true};
 }
 deny(404,'not_found');
}
