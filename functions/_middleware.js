import {routeSiteDisplay} from '../media-worker/src/site-display-router.mjs';
import {protectMediaPage} from '../media-worker/src/page-guard.mjs';
import {mediaTemplates} from '../media-worker/src/page-templates.mjs';
export const onRequest = context => routeSiteDisplay(context,()=>protectMediaPage(context, mediaTemplates));
