const cache = new Map();
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; } }
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export async function verifyAccess(token, env) {
  if (!token || token.length > 16000) throw new HttpError(401,'authentication_required');
  try {
    const parts = token.split('.');
    if(parts.length!==3) throw Error();
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now=Date.now()/1000;
    if(header.alg!=='RS256' || typeof header.kid!=='string' || claims.iss!==env.MEDIA_ACCESS_ISSUER || ![claims.aud].flat().includes(env.MEDIA_ACCESS_AUD) || !Number.isFinite(claims.exp) || claims.exp<=now || !Number.isFinite(claims.iat) || claims.iat>now+60 || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf>now+60)) || typeof claims.sub!=='string' || !claims.sub || claims.sub.length>256) throw Error();
    let entry=cache.get(claims.iss);
    if(!entry || entry.until<Date.now()) {
      const response=await fetch(claims.iss+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(4000)});
      if(!response.ok) throw Error();
      const jwks=await response.json();
      if(!Array.isArray(jwks.keys)) throw Error();
      entry={keys:jwks.keys.slice(0,16),until:Date.now()+300000};
      cache.clear(); cache.set(claims.iss,entry);
    }
    const jwk=entry.keys.find(k=>k.kid===header.kid && k.kty==='RSA' && (!k.alg || k.alg==='RS256'));
    if(!jwk) throw Error();
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))) throw Error();
    return claims;
  } catch { throw new HttpError(401,'invalid_identity'); }
}
export async function entitledViewer(request, env, videoId) {
  if (!env.MEDIA_VIEWER_ACCESS_AUD || env.MEDIA_VIEWER_ACCESS_AUD === env.MEDIA_ACCESS_AUD) throw new HttpError(503, 'viewer_identity_not_configured');
  const claims = await verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'), {...env, MEDIA_ACCESS_AUD: env.MEDIA_VIEWER_ACCESS_AUD});
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
  const claims=await verifyAccess(request.headers.get('Cf-Access-Jwt-Assertion'),env);
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
