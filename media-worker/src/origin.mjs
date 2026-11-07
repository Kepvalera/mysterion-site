import {HttpError} from './auth.mjs';

// Trust operator configuration and the actual URL only, never Host/Forwarded headers.
// There is deliberately no fallback to pages.dev or an inferred preview hostname.
export function requireMediaOrigin(request, env) {
  let configured;
  try {
    configured = new URL(env.MEDIA_PUBLIC_ORIGIN);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname);
    if (configured.origin !== env.MEDIA_PUBLIC_ORIGIN || configured.username || configured.password ||
        (configured.protocol !== 'https:' && !(local && configured.protocol === 'http:'))) throw Error();
  } catch { throw new HttpError(503, 'origin_not_configured'); }
  if (new URL(request.url).origin !== configured.origin) throw new HttpError(421, 'wrong_origin');
  return configured.origin;
}
