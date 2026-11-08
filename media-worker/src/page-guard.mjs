import {administrator, verifyAccess, HttpError} from './auth.mjs';
import {requireMediaOrigin} from './origin.mjs';

const securityHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self' https://video.bunnycdn.com; frame-src https://player.mediadelivery.net https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const messages = {
  ru: ['Управление и вход защищены', 'Доступ пока закрыт. Нужны настроенный домен, Cloudflare Access и разрешённая сервером учётная запись.', 'Вернуться в медиатеку'],
  en: ['Management and sign-in are protected', 'Access is closed. A configured domain, Cloudflare Access and a server-authorized identity are required.', 'Return to the library'],
  de: ['Verwaltung und Anmeldung sind geschützt', 'Der Zugang ist gesperrt. Eine konfigurierte Domain, Cloudflare Access und eine serverseitig erlaubte Identität sind erforderlich.', 'Zur Mediathek']
};
export async function protectMediaPage(context, templates) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(context.request.url).pathname); }
  catch { return new Response('Invalid URL', {status:400, headers:securityHeaders}); }
  const admin = /^\/admin-media(?:\.html)?\/?$/.test(pathname);
  const login = /^\/media-login(?:\.html)?\/?$/.test(pathname);
  // Included child paths never fall back to an unguarded static HTML document.
  if (!admin && !login) {
    if (/^\/(admin-media|media-login)\//.test(pathname)) return new Response('Not found', {status:404, headers:securityHeaders});
    return context.next();
  }
  try {
    requireMediaOrigin(context.request, context.env);
    if (context.env.MEDIA_ENABLED !== 'true' || !context.env.MEDIA_DB ||
        !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(context.env.MEDIA_ACCESS_ISSUER || '') ||
        !context.env.MEDIA_ACCESS_AUD) throw new HttpError(503, 'not_configured');
    if (admin) await administrator(context.request, context.env);
    else {
      if (!context.env.MEDIA_VIEWER_ACCESS_AUD || context.env.MEDIA_VIEWER_ACCESS_AUD === context.env.MEDIA_ACCESS_AUD) throw new HttpError(503, 'viewer_identity_not_configured');
      await verifyAccess(context.request.headers.get('Cf-Access-Jwt-Assertion'), {...context.env, MEDIA_ACCESS_AUD:context.env.MEDIA_VIEWER_ACCESS_AUD});
    }
    // Full UI is returned only after authentication. Static aliases never contain the form.
    const original = templates ? new Response(admin ? templates.admin : templates.login, {headers:{'Content-Type':'text/html; charset=utf-8'}}) : await context.next();
    const response = new Response(original.body, original);
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) {
    const language = context.request.headers.get('Accept-Language')?.match(/^(ru|en|de)\b/i)?.[1].toLowerCase() || 'ru';
    const [title, message, back] = messages[language];
    // Only trusted translations enter HTML; no URL, token or upstream error is echoed.
    return new Response(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MYSTERION MEDIA</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/media.css"></head><body><main class="media-platform"><div class="container"><p class="eyebrow">MYSTERION MEDIA</p><h1>${title}</h1><p>${message}</p><a href="/media.html">${back}</a></div></main></body></html>`, {
      status:error instanceof HttpError ? error.status : 503,
      headers:{...securityHeaders, 'Content-Type':'text/html; charset=utf-8'}
    });
  }
}
