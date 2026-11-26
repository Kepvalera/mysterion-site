import {mediaHeroPublic} from '../../../media-worker/src/media-hero.mjs';
export const onRequest=context=>mediaHeroPublic(context.request,context.env,new URL(context.request.url).pathname.replace(/^\/api\/media-hero\/?/,''));
