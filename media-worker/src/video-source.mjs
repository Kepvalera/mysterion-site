import {HttpError} from './auth.mjs';
export function vkEmbed(value){
 let url;try{url=new URL(value)}catch{throw new HttpError(400,'vk_embed_required')}
 if(url.protocol!=='https:'||!['vk.com','vkvideo.ru'].includes(url.hostname)||url.port||url.username||url.password||url.pathname!=='/video_ext.php'||url.hash)throw new HttpError(400,'vk_embed_required');
 if(!/^-?[1-9]\d{0,18}$/.test(url.searchParams.get('oid')||'')||!/^[1-9]\d{0,18}$/.test(url.searchParams.get('id')||''))throw new HttpError(400,'vk_embed_required');
 const allowed=['oid','id','hash','hd'];for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)throw new HttpError(400,'vk_embed_required');
 if(url.searchParams.has('hash')&&!/^[a-fA-F0-9]{8,128}$/.test(url.searchParams.get('hash')))throw new HttpError(400,'vk_embed_required');
 if(url.searchParams.has('hd')&&!/^[0-4]$/.test(url.searchParams.get('hd')))throw new HttpError(400,'vk_embed_required');
 return url.href;
}
export function youtubeId(value){
 if(typeof value!=='string')throw new HttpError(400,'invalid_youtube_id');
 if(/^[\w-]{11}$/.test(value))return value;
 let url;try{url=new URL(value)}catch{throw new HttpError(400,'invalid_youtube_id')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname))throw new HttpError(400,'invalid_youtube_id');
 const id=url.hostname==='youtu.be'?url.pathname.slice(1):url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1];
 if(!/^[\w-]{11}$/.test(id||''))throw new HttpError(400,'invalid_youtube_id');return id;
}
