import {handleGetPlatinumWebhook} from '../../../media-worker/src/getplatinum-webhook.mjs';
export const onRequest=({request,env})=>handleGetPlatinumWebhook(request,env);
