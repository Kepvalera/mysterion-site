import {routeSiteDisplay} from '../media-worker/src/site-display-router.mjs';
import {protectMediaPage} from '../media-worker/src/page-guard.mjs';
import {mediaTemplates} from '../media-worker/src/page-templates.mjs';
export const onRequest = context => {
 const url=new URL(context.request.url);
 if(/^\/sermons(?:\.html)?\/?$/i.test(url.pathname)){
  const target=new URL('/media.html',url.origin);
  const lang=url.searchParams.get('lang');if(['ru','en'].includes(lang))target.searchParams.set('lang',lang);
  return new Response(null,{status:308,headers:{Location:target.href,'Cache-Control':'public, max-age=3600'}});
 }
 return routeSiteDisplay(context,()=>protectMediaPage(context,mediaTemplates));
};
