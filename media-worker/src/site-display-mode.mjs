// This state is independent of the Digital public-sales switch.
export async function siteDisplayState(env){
 if(!env.MEDIA_DB)throw Error('site_display_store_unavailable');
 const state=await env.MEDIA_DB.prepare('SELECT * FROM site_display_settings WHERE id=1').first();
 if(!state||!['main','services'].includes(state.mode))throw Error('site_display_state_invalid');
 return state;
}
export async function temporarySite(env){return (await siteDisplayState(env)).mode==='services'}
export async function newPurchasesAllowed(env){const s=await siteDisplayState(env);return s.mode==='main'&&s.purchases_paused===0}
export const serviceFieldNames=['consultation_description_ru','consultation_description_en','consultation_format_ru','consultation_format_en','consultation_duration_ru','consultation_duration_en','consultation_price_ru','consultation_price_en','terms_ru','terms_en','payments_refunds_ru','payments_refunds_en','privacy_ru','privacy_en','contact_email','contact_phone'];
export function serviceContent(state){let content;try{content=JSON.parse(state.content)}catch{content={}}return {...{contact_email:'mistirion@list.ru',contact_phone:'+7 926 728-34-00'},...content}}
