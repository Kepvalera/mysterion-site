/* One server-verified session for the shared header. No credentials are read or stored here. */
(() => {
 'use strict';
 const root=document.querySelector('.site-account');if(!root)return;
 const entry=root.querySelector('.account-entry'),toggle=root.querySelector('.account-menu-toggle'),menu=root.querySelector('.account-menu'),manage=root.querySelector('[data-account=manage]');
 const copy={ru:{login:'Войти',account:'Личный кабинет',manage:'Панель управления',logout:'Выйти',menu:'Меню аккаунта',expired:'Сессия истекла. Войдите снова, чтобы продолжить.',unavailable:'Не удалось подтвердить сессию. Проверьте соединение или войдите снова.',disabled:'Доступ к аккаунту приостановлен. Обратитесь к администратору.',again:'Войти снова',close:'Закрыть сообщение'},en:{login:'Sign in',account:'My account',manage:'Management panel',logout:'Sign out',menu:'Account menu',expired:'Your session has expired. Sign in again to continue.',unavailable:'Your session could not be confirmed. Check your connection or sign in again.',disabled:'Account access is suspended. Contact the administrator.',again:'Sign in again',close:'Dismiss message'}};
 let state={authenticated:false},controller,timer,lastCheck=0,hadSession=false;
 try{hadSession=sessionStorage.getItem('mysterion-had-session')==='1'}catch{}
 const text=()=>copy[document.documentElement.lang]||copy.ru;
 const banner=document.createElement('aside');banner.className='account-session-notice';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 const message=document.createElement('span'),login=document.createElement('a'),dismiss=document.createElement('button');login.href='/media-login.html';dismiss.type='button';dismiss.textContent='×';banner.append(message,login,dismiss);document.body.append(banner);dismiss.onclick=()=>banner.hidden=true;
 function close(){menu.hidden=true;toggle.setAttribute('aria-expanded','false')}
 function render(){const t=text();entry.textContent=state.authenticated?t.account:t.login;entry.href=state.viewerEnabled?'/viewer-account.html':'/media-login.html';toggle.hidden=!state.authenticated;toggle.setAttribute('aria-label',t.menu);menu.setAttribute('aria-label',t.menu);manage.hidden=!(state.authenticated&&state.canManage===true);manage.textContent=t.manage;
  root.querySelector('[data-account=account]').textContent=t.account;root.querySelector('[data-account=logout]').textContent=t.logout;login.textContent=t.again;login.href=state.viewerEnabled?'/viewer-account.html':'/media-login.html';root.querySelector('[data-account=account]').href=entry.href;dismiss.setAttribute('aria-label',t.close);message.textContent=t[banner.dataset.reason||'expired'];if(!state.authenticated)close();
 }
 function expired(reason='expired'){clearTimeout(timer);state={authenticated:false,viewerEnabled:state.viewerEnabled};banner.dataset.reason=reason;banner.hidden=false;render();window.dispatchEvent(new CustomEvent('mysterion:session-expired'))}
 window.mysterionSessionExpired=()=>expired();
 window.mysterionAuthenticatedFetch=async(url,options={})=>{
  const target=new URL(typeof url==='string'?url:url.url,location.href);
  const privateApi=target.origin===location.origin&&/^\/api\/media\/(admin\/|view\/)/.test(target.pathname);
  const headers=new Headers(options.headers);if(privateApi)headers.set('X-Requested-With','XMLHttpRequest');
  try{const response=await fetch(url,{credentials:'same-origin',redirect:'error',...options,headers});if(privateApi&&response.status===401)expired();return response}catch(error){if(privateApi&&hadSession)expired('unavailable');throw error}
 };
 async function refresh(force=false){if(document.hidden||(!force&&Date.now()-lastCheck<10000))return;lastCheck=Date.now();controller?.abort();controller=new AbortController();
  try{const response=await fetch('/api/media/session',{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'X-Requested-With':'XMLHttpRequest'}});if(!response.ok)throw Error();let data=await response.json();if(!data.authenticated){try{const viewer=await fetch('/api/viewer/session',{credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});if(viewer.ok){const identity=await viewer.json();data={...identity,viewerEnabled:true,viewerSession:identity.authenticated}}}catch(error){if(error.name==='AbortError')throw error}}state=data;
   clearTimeout(timer);if(state.authenticated){hadSession=true;try{sessionStorage.setItem('mysterion-had-session','1')}catch{}banner.hidden=true;if(Number.isFinite(state.expiresAt))timer=setTimeout(()=>expired(),Math.max(0,Math.min(2147483647,state.expiresAt-Date.now())))}
   else if(data.reason==='account_disabled')expired('disabled');else if(data.reason==='session_expired'||hadSession)expired(data.reason==='unavailable'?'unavailable':'expired');render();
   window.dispatchEvent(new CustomEvent('mysterion:session',{detail:{authenticated:Boolean(state.authenticated)}}));
  }catch(error){if(error.name==='AbortError')return;state={authenticated:false};if(hadSession)expired('unavailable');else render()}
 }
 toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden))};
 document.addEventListener('click',e=>{if(!root.contains(e.target))close()});window.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=!menu.hidden;close();if(open)toggle.focus()}});
 root.querySelector('[data-account=logout]').addEventListener('click',async event=>{const viewerSession=state.viewerSession;if(viewerSession){event.preventDefault();try{const response=await fetch('/api/viewer/logout',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:'{}'});if(!response.ok)throw Error()}catch{expired('unavailable');return}}controller?.abort();clearTimeout(timer);state={authenticated:false,viewerEnabled:state.viewerEnabled};hadSession=false;try{sessionStorage.removeItem('mysterion-had-session')}catch{}banner.hidden=true;render();window.dispatchEvent(new CustomEvent('mysterion:session-expired'));if(viewerSession)location.assign('/viewer-account.html')});
 window.addEventListener('mysterion:language',render);window.addEventListener('pageshow',()=>refresh(true));window.addEventListener('focus',()=>refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 render();refresh(true);
 window.addEventListener('mysterion:viewer-auth-changed',()=>refresh(true));
 setInterval(()=>{if(state.authenticated&&!document.hidden)refresh()},60000);
})();
