import {HttpError} from './auth.mjs';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

function normalizedOrigin(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const local = localHosts.has(url.hostname);
    if (url.origin !== value || url.username || url.password ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(env) {
  const primary = normalizedOrigin(env.MEDIA_PUBLIC_ORIGIN);
  if (!primary) return null;
  const allowed = new Set([primary]);
  if (env.MEDIA_ALLOWED_ORIGINS === undefined || env.MEDIA_ALLOWED_ORIGINS === '') return allowed;
  if (typeof env.MEDIA_ALLOWED_ORIGINS !== 'string') return null;
  const additional = env.MEDIA_ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  if (additional.some(origin => !origin)) return null;
  for (const origin of additional) {
    const normalized = normalizedOrigin(origin);
    if (!normalized) return null;
    allowed.add(normalized);
  }
  return allowed;
}

// Trust exact configured origins and the request URL, never Host/Forwarded headers.
export function isAllowedMediaOrigin(origin, env) {
  const allowed = configuredOrigins(env);
  const normalized = normalizedOrigin(origin);
  return Boolean(allowed && normalized && allowed.has(normalized));
}

export function isSameOriginMediaRequest(request, env) {
  let origin;
  try {
    origin = new URL(request.url).origin;
  } catch {
    return false;
  }
  return isAllowedMediaOrigin(origin, env) &&
    request.headers.get('Origin') === origin &&
    request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

export function requireMediaOrigin(request, env) {
  const allowed = configuredOrigins(env);
  if (!allowed) throw new HttpError(503, 'origin_not_configured');
  let requestOrigin;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new HttpError(421, 'wrong_origin');
  }
  if (!allowed.has(requestOrigin)) throw new HttpError(421, 'wrong_origin');
  return requestOrigin;
}
