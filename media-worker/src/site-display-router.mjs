import {loadServiceExample} from './service-example.mjs';
import {siteDisplayState} from './site-display-mode.mjs';
import {servicePage,serviceLanguage,serviceHeaders} from './service-page.mjs';
const noStore={'Cache-Control':'private, no-store, max-age=0','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store'};
function uncached(response){const next=new Response(response.body,response);for(const [k,v]of Object.entries(noStore))next.headers.set(k,v);return next}
export async function routeSiteDisplay(context,next){
 const url=new URL(context.request.url);let path;try{path=decodeURIComponent(url.pathname).toLowerCase()}catch{return new Response('Invalid URL',{status:400,headers:noStore})}
 // Authenticated management, all API handlers/webhooks and inert assets remain
 // reachable. API catalog and purchase gates enforce the mode independently.
 if(path==='/api'||path.startsWith('/api/')||/^\/admin-media(?:\.html)?(?:\/|$)/.test(path)||/^\/media-login(?:\.html)?(?:\/|$)/.test(path)||/\.(?:js|css|svg|ico|png|jpe?g|webp|avif|gif|woff2?|ttf|otf|mp4|webm|pdf)$/.test(path))return next();
 let state;try{state=await siteDisplayState(context.env)}catch{return new Response('Site mode unavailable. / Режим сайта временно недоступен.',{status:503,headers:{...noStore,'Content-Type':'text/plain; charset=utf-8'}})}
 if(state.mode==='main')return uncached(await next());
 if(/^\/viewer-account(?:\.html)?\/?$/.test(path)){
  const response=await next();const rewritten=new HTMLRewriter()
   .on('body',{element(e){e.setAttribute('class',(e.getAttribute('class')||'')+' site-services-account')}})
   .on('head',{element(e){e.append('<link rel="stylesheet" href="/site-mode-account.css?v=site-mode-20261115">',{html:true})}})
   .on('.desktop-nav,.mobile-nav,.header-cta,.menu-toggle',{element(e){e.setAttribute('aria-hidden','true');e.setAttribute('inert','')}})
   .transform(response);return uncached(rewritten);
 }
 if(path==='/robots.txt')return new Response('User-agent: *\nDisallow: /api/\nDisallow: /admin-media\nDisallow: /viewer-account\nSitemap: https://mysterion-international.com/sitemap.xml\n',{headers:{...noStore,'Content-Type':'text/plain; charset=utf-8'}});
 if(path==='/sitemap.xml')return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://mysterion-international.com/</loc></url></urlset>',{headers:{...noStore,'Content-Type':'application/xml; charset=utf-8'}});
 let example=null;if(context.request.method==='GET')try{example=await loadServiceExample(context.env)}catch{}
 const headers={...serviceHeaders,'Content-Language':serviceLanguage(context.request)};if(!['/','/index','/index.html'].includes(path))headers['X-Robots-Tag']='noindex, follow';
 return new Response(context.request.method==='HEAD'?null:servicePage(context.request,state,example),{status:['GET','HEAD'].includes(context.request.method)?200:405,headers});
}
