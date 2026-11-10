import {HttpError} from './auth.mjs';
export function vkEmbed(value){
 let url;try{url=new URL(value)}catch{throw new HttpError(400,'vk_embed_required')}
 if(url.protocol!=='https:'||!['vk.com','vkvideo.ru'].includes(url.hostname)||url.port||url.username||url.password||url.hash)throw new HttpError(400,'vk_embed_required');
 const shared=url.pathname.match(/^\/video(-?\d+)_([1-9]\d*)\/?$/);
 if(shared){
  for(const key of url.searchParams.keys())if(key!=='hash'||url.searchParams.getAll(key).length!==1)throw new HttpError(400,'vk_embed_required');
  const hash=url.searchParams.get('hash');if(hash&&!/^[a-fA-F0-9]{8,128}$/.test(hash))throw new HttpError(400,'vk_embed_required');
  const embed=new URL('https://vk.com/video_ext.php');embed.searchParams.set('oid',shared[1]);embed.searchParams.set('id',shared[2]);if(hash)embed.searchParams.set('hash',hash);return embed.href;
 }
 if(url.pathname!=='/video_ext.php')throw new HttpError(400,'vk_embed_required');
 if(!/^-?[1-9]\d{0,18}$/.test(url.searchParams.get('oid')||'')||!/^[1-9]\d{0,18}$/.test(url.searchParams.get('id')||''))throw new HttpError(400,'vk_embed_required');
 const allowed=['oid','id','hash','hd'];for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)throw new HttpError(400,'vk_embed_required');
 if(url.searchParams.has('hash')&&!/^[a-fA-F0-9]{8,128}$/.test(url.searchParams.get('hash')))throw new HttpError(400,'vk_embed_required');
 if(url.searchParams.has('hd')&&!/^[0-4]$/.test(url.searchParams.get('hd')))throw new HttpError(400,'vk_embed_required');
 return url.href;
}
export async function vkThumbnail(value,fetcher=fetch){
 const embed=new URL(vkEmbed(value)),oid=embed.searchParams.get('oid'),id=embed.searchParams.get('id');
 const publicURL=`https://vk.com/video${oid}_${id}`,oembed=new URL('https://vk.com/oembed');
 oembed.searchParams.set('url',publicURL);oembed.searchParams.set('format','json');
 const metadataResponse=await fetcher(oembed,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
 if(!metadataResponse.ok||!metadataResponse.headers.get('Content-Type')?.toLowerCase().includes('application/json'))throw new HttpError(404,'thumbnail_unavailable');
 const metadata=await metadataResponse.json();let thumbnail;
 try{if(typeof metadata.thumbnail_url!=='string')throw new Error();thumbnail=new URL(metadata.thumbnail_url)}catch{throw new HttpError(404,'thumbnail_unavailable')}
 const allowedHost=thumbnail.hostname==='userapi.com'||thumbnail.hostname.endsWith('.userapi.com')||thumbnail.hostname==='vkuserphoto.ru'||thumbnail.hostname.endsWith('.vkuserphoto.ru')||thumbnail.hostname==='mycdn.me'||thumbnail.hostname.endsWith('.mycdn.me');
 if(thumbnail.protocol!=='https:'||thumbnail.username||thumbnail.password||thumbnail.port||!allowedHost)throw new HttpError(404,'thumbnail_unavailable');
 const response=await fetcher(thumbnail.href,{redirect:'error',signal:AbortSignal.timeout(5000)});
 const mime=response.headers.get('Content-Type')?.split(';')[0].toLowerCase();
 if(!response.ok||!['image/jpeg','image/png','image/webp'].includes(mime)||Number(response.headers.get('Content-Length'))>1048576)throw new HttpError(404,'thumbnail_unavailable');
 const reader=response.body?.getReader();if(!reader)throw new HttpError(404,'thumbnail_unavailable');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw new HttpError(404,'thumbnail_unavailable')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 return new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
export function youtubeId(value){
 if(typeof value!=='string')throw new HttpError(400,'invalid_youtube_id');
 if(/^[\w-]{11}$/.test(value))return value;
 let url;try{url=new URL(value)}catch{throw new HttpError(400,'invalid_youtube_id')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname))throw new HttpError(400,'invalid_youtube_id');
 const id=url.hostname==='youtu.be'?url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1]:url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})$/)?.[1];
 if(!/^[\w-]{11}$/.test(id||''))throw new HttpError(400,'invalid_youtube_id');return id;
}
