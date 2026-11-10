const cache = new Map();
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; } }
const identityReasons=new Set(['issuer_mismatch','audience_mismatch','token_expired','subject_missing','jwks_fetch_failed','jwks_key_not_found','signature_invalid','token_format']);
function identityError(reason){const error=new HttpError(401,'invalid_identity');error.identityReason=identityReasons.has(reason)?reason:'token_format';return error}
// Opt-in AND canonical staging origin. Never log claims, headers or exceptions.
export function logAccessFailure(error,request,env,requestId){
 if(env.MEDIA_ACCESS_DIAGNOSTICS!=='true'||env.MEDIA_PUBLIC_ORIGIN!=='https://mysterion-viewer-staging.pages.dev'||!identityReasons.has(error?.identityReason)||!/^[a-f0-9-]{36}$/.test(requestId))return false;
 console.warn(JSON.stringify({requestId,reason:error.identityReason,source:request.headers.has('Cf-Access-Jwt-Assertion')?'assertion':'cookie',audHasWhitespace:typeof env.MEDIA_ACCESS_AUD==='string'&&/\s/.test(env.MEDIA_ACCESS_AUD)}));return true;
}
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export function accessToken(request) {
  // An explicit assertion is authoritative: never retry a rejected header with
  // another credential. Cookie fallback still requires full JWT verification.
  if(request.headers.has('Cf-Access-Jwt-Assertion'))return request.headers.get('Cf-Access-Jwt-Assertion');
  const cookie=request.headers.get('Cookie')||'';
  if(cookie.length>32768)throw identityError('token_format');
  const matches=cookie.split(';').map(part=>part.trim()).filter(part=>part.startsWith('CF_Authorization='));
  if(matches.length>1)throw identityError('token_format');
  return matches.length?matches[0].slice('CF_Authorization='.length):null;
}
export const verifyRequestAccess=(request,env)=>verifyAccess(accessToken(request),env);
export async function verifySiteIdentity(request,env){
  const audiences=[...new Set([env.MEDIA_ACCESS_AUD,env.MEDIA_VIEWER_ACCESS_AUD].filter(Boolean))];
  if(!audiences.length)throw new HttpError(503,'viewer_identity_not_configured');
  let last;
  for(const audience of audiences){try{return await verifyRequestAccess(request,{...env,MEDIA_ACCESS_AUD:audience})}catch(error){if(!(error instanceof HttpError)||error.status!==401)throw error;last=error}}
  throw last;
}
export async function siteSession(request,env){
  if(!accessToken(request))return {authenticated:false,reason:'signed_out'};
  const claims=await verifySiteIdentity(request,env);
  if(env.VIEWER_PLATFORM_ENABLED==='true'){
    // Management always requires the administrative application's audience.
    let administrative;try{administrative=await verifyRequestAccess(request,env)}catch{return {authenticated:true,canManage:false,role:null,expiresAt:claims.exp*1000}}
    const staff=await env.MEDIA_DB.prepare('SELECT role FROM platform_staff WHERE access_sub=? AND active=1').bind(administrative.sub).first();
    return {authenticated:true,role:staff?.role||null,canManage:Boolean(staff),registered:Boolean(staff),expiresAt:claims.exp*1000};
  }
  const user=await env.MEDIA_DB.prepare('SELECT role,active FROM users WHERE access_sub=?').bind(claims.sub).first();
  if(user&&!user.active)return {authenticated:false,reason:'account_disabled'};
  return {authenticated:true,role:user?.role||null,canManage:user?.active===1&&user.role==='admin',registered:Boolean(user),expiresAt:claims.exp*1000};
}
export async function verifyAccess(token, env) {
  if (!token) throw new HttpError(401,'authentication_required');
  if (token.length > 16000) throw identityError('token_format');
  let reason='token_format';
  try {
    const parts = token.split('.');
    if(parts.length!==3) throw Error();
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now=Date.now()/1000;
    if(!header||!claims||header.alg!=='RS256'||typeof header.kid!=='string')throw Error();
    if(claims.iss!==env.MEDIA_ACCESS_ISSUER){reason='issuer_mismatch';throw Error()}
    if(![claims.aud].flat().includes(env.MEDIA_ACCESS_AUD)){reason='audience_mismatch';throw Error()}
    if(!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||(claims.nbf!==undefined&&!Number.isFinite(claims.nbf)))throw Error();
    if(claims.exp<=now||claims.iat>now+60||(claims.nbf!==undefined&&claims.nbf>now+60)){reason='token_expired';throw Error()}
    if(typeof claims.sub!=='string'||!claims.sub||claims.sub.length>256){reason='subject_missing';throw Error()}
    const signature=decode(parts[2]);
    let entry=cache.get(claims.iss);
    if(!entry || entry.until<Date.now()) {
      reason='jwks_fetch_failed';
      const response=await fetch(claims.iss+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(4000)});
      if(!response.ok) throw Error();
      const jwks=await response.json();
      if(!Array.isArray(jwks.keys)) throw Error();
      entry={keys:jwks.keys.slice(0,16),until:Date.now()+300000};
      cache.clear(); cache.set(claims.iss,entry);
    }
    reason='jwks_key_not_found';
    const jwk=entry.keys.find(k=>k.kid===header.kid && k.kty==='RSA' && (!k.alg || k.alg==='RS256'));
    if(!jwk) throw Error();
    reason='signature_invalid';
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(parts[0]+'.'+parts[1]))) throw Error();
    return claims;
  } catch { throw identityError(reason); }
}
export async function entitledViewer(request, env, videoId) {
  const audience=env.MEDIA_VIEWER_ACCESS_AUD||env.MEDIA_ACCESS_AUD;
  if(!audience)throw new HttpError(503,'viewer_identity_not_configured');
  const claims = await verifyRequestAccess(request, {...env, MEDIA_ACCESS_AUD: audience});
  // A role, email, request parameter or localStorage value never grants paid viewing.
  const user = await env.MEDIA_DB.prepare('SELECT id FROM users WHERE access_sub=? AND active=1').bind(claims.sub).first();
  if (!user) throw new HttpError(403, 'viewing_right_required');
  if(env.MEDIA_MEMBERS_ENABLED==='true') {
    const manual=await env.MEDIA_DB.prepare('SELECT id FROM manual_grants WHERE user_id=? AND video_id=? AND revoked_at IS NULL AND julianday(expires_at)>julianday(?)').bind(user.id,videoId,new Date().toISOString()).first();
    if(manual)return user;
  }
  const grant = await env.MEDIA_DB.prepare(`SELECT e.id FROM entitlements e JOIN purchases p ON p.id=e.purchase_id
    WHERE e.user_id=? AND e.video_id=? AND e.revoked_at IS NULL AND (e.expires_at IS NULL OR julianday(e.expires_at)>julianday(?))
    AND p.user_id=e.user_id AND p.video_id=e.video_id AND p.status='paid'`).bind(user.id, videoId, new Date().toISOString()).first();
  if (!grant) throw new HttpError(403, 'viewing_right_required');
  return user;
}
export async function administrator(request,env) {
  const claims=await verifyRequestAccess(request,env);
  let user;
  try {
    user=await env.MEDIA_DB.prepare('SELECT id,role FROM users WHERE access_sub=? AND active=1').bind(claims.sub).first();
  } catch {
    // Do not expose D1 errors: they can contain SQL, identifiers or bound data.
    throw new HttpError(503,'identity_store_unavailable');
  }
  if(!user || !['admin','editor'].includes(user.role)) throw new HttpError(403,'forbidden');
  return user;
}
