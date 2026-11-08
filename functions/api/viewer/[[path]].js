import {handleViewer} from '../../../media-worker/src/viewer-auth.mjs';
export const onRequest=context=>handleViewer(context.request,context.env,context);
