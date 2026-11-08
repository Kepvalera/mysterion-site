import {HttpError} from './auth.mjs';
export function mailConfigured(env){return Boolean(env.VIEWER_MAILER?.fetch)||(env.VIEWER_EMAIL_PROVIDER==='resend'&&typeof env.RESEND_API_KEY==='string'&&env.RESEND_API_KEY.length>0&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.VIEWER_EMAIL_FROM||''))}
export async function deliver(env,{email,token,purpose,locale,id}){
 const url=env.MEDIA_PUBLIC_ORIGIN+'/viewer-account.html#'+new URLSearchParams({action:purpose,token});
 const ru=locale!=='en',subject=purpose==='verify'?(ru?'Подтверждение почты MYSTERION':'Verify your MYSTERION email'):(ru?'Сброс пароля MYSTERION':'Reset your MYSTERION password');
 const text=(ru?'Откройте ссылку и подтвердите действие. Если вы не запрашивали письмо, проигнорируйте его.':'Open this link to confirm. If you did not request this email, ignore it.')+'\n\n'+url;
 let response;
 if(env.VIEWER_MAILER?.fetch)response=await env.VIEWER_MAILER.fetch(new Request('https://mailer.internal/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:email,subject,text})}));
 else response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.VIEWER_EMAIL_FROM,to:[email],subject,text})});
 if(!response.ok)throw new HttpError(503,'email_delivery_unavailable');
}
