import {handle} from '../../media-worker/src/worker.mjs';
export const onRequest = ({request,env}) => handle(request,env);
