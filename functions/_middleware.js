import {protectMediaPage} from '../media-worker/src/page-guard.mjs';
export const onRequest = protectMediaPage;
