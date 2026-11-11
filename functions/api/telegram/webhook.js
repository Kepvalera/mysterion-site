import {handleTelegramWebhook} from '../../../media-worker/src/telegram-access.mjs';
export const onRequest=({request,env})=>handleTelegramWebhook(request,env);
