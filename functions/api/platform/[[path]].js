import {handlePlatform} from '../../../media-worker/src/platform.mjs';
export const onRequest=context=>handlePlatform(context.request,context.env);
