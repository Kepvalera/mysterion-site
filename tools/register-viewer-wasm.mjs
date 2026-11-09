// Node-only test hook. Cloudflare uses native statically imported WASM modules.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({load(url,context,next){
 if(url.endsWith('.wasm')&&url.includes('/media-worker/vendor/hash-wasm/')){
  const data=readFileSync(new URL(url)).toString('base64');
  return {format:'module',shortCircuit:true,source:`export default new WebAssembly.Module(Uint8Array.from(atob('${data}'),c=>c.charCodeAt(0)))`};
 }
 return next(url,context);
}});
