import {handleTributeWebhook} from '../../../media-worker/src/tribute-webhook.mjs';
export const onRequest=({request,env})=>handleTributeWebhook(request,env);
