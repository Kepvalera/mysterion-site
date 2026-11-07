import {protectMediaPage} from '../media-worker/src/page-guard.mjs';
import {mediaTemplates} from '../media-worker/src/page-templates.mjs';
export const onRequest = context => protectMediaPage(context, mediaTemplates);
