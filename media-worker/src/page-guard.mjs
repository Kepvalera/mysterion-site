import {administrator, verifySiteIdentity, HttpError} from './auth.mjs';
import {requireMediaOrigin} from './origin.mjs';
import {siteHeader} from './site-header.mjs';
import {staffIdentity} from './platform-data.mjs';
import {platformAdminTemplate} from './platform-admin-template.mjs';

const securityHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self' https://video.bunnycdn.com; frame-src https://player.mediadelivery.net https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const messages = {
  ru: ['Управление и вход защищены', 'Сервис временно недоступен. Проверьте серверную настройку медиатеки по коду причины ниже.', 'Вернуться в медиатеку', 'Вход не подтверждён сервером. Повторите вход через Cloudflare Access; проверьте issuer и audience приложения.', 'Вход подтверждён, но для этой учётной записи нет активной роли администратора или редактора в D1.', 'Этот адрес не совпадает с разрешённым адресом медиатеки.'],
  en: ['Management and sign-in are protected', 'The service is unavailable. Check the media server configuration using the reason code below.', 'Return to the library', 'The server could not verify this sign-in. Sign in through Cloudflare Access again; check the application issuer and audience.', 'Sign-in was verified, but this account has no active administrator or editor role in D1.', 'This address does not match the permitted media origin.']
};
const reasonCodes=new Set(['origin_not_configured','wrong_origin','media_disabled','database_not_bound','access_issuer_not_configured','access_audience_not_configured','viewer_identity_not_configured','authentication_required','invalid_identity','forbidden','identity_store_unavailable']);
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
  let phase='origin';
  try {
    requireMediaOrigin(context.request, context.env);
    phase='configuration';
    if(context.env.MEDIA_ENABLED!=='true')throw new HttpError(503,'media_disabled');
    if(!context.env.MEDIA_DB)throw new HttpError(503,'database_not_bound');
    if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(context.env.MEDIA_ACCESS_ISSUER||''))throw new HttpError(503,'access_issuer_not_configured');
    if(!context.env.MEDIA_ACCESS_AUD)throw new HttpError(503,'access_audience_not_configured');
    phase=admin?'administrator':'viewer_identity';
    if (admin) {if(context.env.VIEWER_PLATFORM_ENABLED==='true')await staffIdentity(context.request,context.env);else await administrator(context.request, context.env);}
    else {
      await verifySiteIdentity(context.request,context.env);
    }
    // Full UI is returned only after authentication. Static aliases never contain the form.
    phase='template';
    const original = admin&&context.env.VIEWER_PLATFORM_ENABLED==='true'?new Response(platformAdminTemplate,{headers:{'Content-Type':'text/html; charset=utf-8'}}):templates ? new Response(admin ? templates.admin : templates.login, {headers:{'Content-Type':'text/html; charset=utf-8'}}) : await context.next();
    const response = new Response(original.body, original);
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) {
    const language = context.request.headers.get('Accept-Language')?.match(/^(ru|en)\b/i)?.[1].toLowerCase() || 'ru';
    const [title, unavailable, back, authentication, forbidden, wrongOrigin] = messages[language];
    const status=error instanceof HttpError ? error.status : 503;
    const code=error instanceof HttpError && reasonCodes.has(error.message) ? error.message : 'internal_unavailable';
    const message=status===401?authentication:status===403?forbidden:status===421?wrongOrigin:unavailable;
    // Fixed allowlisted codes and stage labels only; never log headers, identity,
    // exception messages/stacks, SQL, request URLs or environment values.
    if(status===503)console.warn(JSON.stringify({event:'mysterion_media_unavailable',code,phase}));
    // Only trusted translations enter HTML; no URL, token or upstream error is echoed.
    return new Response(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MYSTERION MEDIA</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/media.css"><link rel="stylesheet" href="/account.css"><script defer src="/script.js"></script><script defer src="/account.js"></script></head><body>${siteHeader}<main class="media-platform"><div class="container"><p class="eyebrow">MYSTERION MEDIA</p><h1 data-i18n="authProtected">${title}</h1><p data-i18n="${status===401?'authAuthentication':status===403?'authForbidden':status===421?'authWrongOrigin':'authUnavailable'}">${message}</p><p><code>${code}</code></p><a href="/media.html" data-i18n="authReturn">${back}</a></div></main></body></html>`, {
      status,
      headers:{...securityHeaders, 'Content-Type':'text/html; charset=utf-8','X-Mysterion-Media-Error':code}
    });
  }
}
