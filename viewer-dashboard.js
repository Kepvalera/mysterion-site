/* Viewer dashboard. The cookie stays HttpOnly; private data lives only in this closure. */
(() => {
 'use strict';
 const root=document.getElementById('viewer-signed-in');if(!root)return;
 const $=id=>document.getElementById(id),views=['home','courses','videos','purchases','profile'];
 let account=null,view='home',generation=0,controller=null,resetBusy=false;
 const copy={
  ru:{participantSpace:'КАБИНЕТ УЧАСТНИКА',participant:'Участник',mySpace:'МОЁ ПРОСТРАНСТВО',secureSession:'Защищённая сессия',home:'Главная',courses:'Мои курсы',videos:'Мои видео',purchases:'Мои покупки',profile:'Мой профиль',logout:'Выйти из аккаунта',loading:'Загружаем ваш кабинет…',retry:'Повторить',homeEyebrow:'ВАШЕ ПУТЕШЕСТВИЕ ПРОДОЛЖАЕТСЯ',welcome:'Добро пожаловать',intro:'Ваши материалы, обучение и личная информация — в одном месте.',availableCourses:'Доступных курсов',availableVideos:'Личных видеозаписей',emailVerified:'Почта подтверждена',learningLabel:'ШАГ ЗА ШАГОМ',continueTitle:'Продолжить обучение',continueCopy:'Когда в кабинете появится обучение, вы сможете вернуться к нему отсюда.',openCourses:'Мои курсы',yourLibrary:'Ваши материалы',personalLibrary:'ЛИЧНАЯ БИБЛИОТЕКА',coursesShort:'Обучение школы MYSTERION',videosShort:'Записи, доступные лично вам',publicTitle:'Открытая медиатека',publicCopy:'Бесплатные материалы доступны без регистрации.',coursesIntro:'Здесь будут курсы школы, к которым вам предоставлен доступ.',coursesTitle:'Всё начинается с первого шага',coursesCopy:'Пока в вашем кабинете нет доступных курсов. После предоставления доступа они появятся здесь.',coursesLink:'Познакомиться с онлайн-школой',videosIntro:'Ваши записи конференций, семинаров и проповедей.',videosTitle:'Ваша видеотека впереди',videosCopy:'Здесь появятся записи, приобретённые вами или предоставленные служением. Пока список пуст.',videosLink:'Открыть публичную медиатеку',accessLabel:'ВАШИ ПРИОБРЕТЕНИЯ',purchasesIntro:'Материалы, статусы оплаты и сроки доступа.',material:'Материал',paymentStatus:'Статус',accessUntil:'Срок доступа',purchasesTitle:'Пока без покупок',purchasesCopy:'История приобретений и сроки доступа появятся здесь. Сейчас для этого кабинета записей нет.',purchasesLink:'Посмотреть открытые материалы',profileLabel:'ЛИЧНАЯ ИНФОРМАЦИЯ',profileIntro:'Информация об аккаунте и управление вашей сессией.',name:'Имя',notProvided:'Не указано',joined:'Дата регистрации',sessionUntil:'Сессия действует до',passwordTitle:'Пароль и безопасность',passwordCopy:'Ссылку для смены пароля отправим на вашу подтверждённую почту.',changePassword:'Сменить пароль',sessionsTitle:'Ваши устройства',sessionCopy:'Одна активная сессия на аккаунт. Новый вход завершает предыдущую.',contact:'Связаться со служением',failed:'Не удалось загрузить кабинет. Повторите запрос.',resetFailed:'Не удалось отправить запрос. Повторите позже.',request_timeout:'Сервер не ответил вовремя. Проверьте соединение и повторите позже.',working:'Отправляем…',resetSent:'Если действие доступно для вашего адреса, письмо со ссылкой отправлено. Проверьте также папку «Спам».',retryWait:'Слишком много запросов. Повторите через {seconds} сек.'},
  en:{participantSpace:'PARTICIPANT AREA',participant:'Participant',mySpace:'MY SPACE',secureSession:'Secure session',home:'Home',courses:'My courses',videos:'My videos',purchases:'Purchases',profile:'My profile',logout:'Sign out',loading:'Loading your account…',retry:'Try again',homeEyebrow:'YOUR JOURNEY CONTINUES',welcome:'Welcome back',intro:'Your learning, personal materials and account — together in one place.',availableCourses:'Courses available',availableVideos:'Personal recordings',emailVerified:'Email verified',learningLabel:'STEP BY STEP',continueTitle:'Continue learning',continueCopy:'When learning becomes available in your account, you can return to it from here.',openCourses:'My courses',yourLibrary:'Your materials',personalLibrary:'PERSONAL LIBRARY',coursesShort:'Learning with MYSTERION',videosShort:'Recordings available to you',publicTitle:'Explore the media library',publicCopy:'Free materials are available without signing in.',coursesIntro:'School courses you have been granted access to will appear here.',coursesTitle:'Every journey begins with a step',coursesCopy:'You do not have any courses available in this account yet. They will appear here once access is granted.',coursesLink:'Explore the online school',videosIntro:'Your conference, seminar and sermon recordings.',videosTitle:'Your video library awaits',videosCopy:'Recordings you purchase or receive from the ministry will appear here. The list is currently empty.',videosLink:'Browse the public media library',accessLabel:'YOUR PURCHASES',purchasesIntro:'Materials, payment statuses and access periods.',material:'Material',paymentStatus:'Status',accessUntil:'Access period',purchasesTitle:'No purchases yet',purchasesCopy:'Your purchase history and access periods will appear here. There are currently no records for this account.',purchasesLink:'Explore public materials',profileLabel:'PERSONAL INFORMATION',profileIntro:'Your account details and session controls.',name:'Name',notProvided:'Not provided',joined:'Joined',sessionUntil:'Session expires',passwordTitle:'Password & security',passwordCopy:'We will send a password reset link to your verified email address.',changePassword:'Change password',sessionsTitle:'Your devices',sessionCopy:'One active session per account. Signing in again ends the previous session.',contact:'Contact the ministry',failed:'Unable to load your account. Please try again.',resetFailed:'Unable to send the request. Please try again later.',request_timeout:'The server did not respond in time. Check your connection and try again later.',working:'Sending…',resetSent:'If this action is available for your address, a reset email has been sent. Please check your spam folder too.',retryWait:'Too many requests. Try again in {seconds} sec.'}
 };
 const lang=()=>document.documentElement.lang==='en'?'en':'ru',t=key=>copy[lang()][key]||copy.ru[key]||copy[lang()].failed;
 function setAll(selector,value){root.querySelectorAll(selector).forEach(node=>node.textContent=value)}
 function formattedDate(value,includeTime=false){return Number.isFinite(value)?new Intl.DateTimeFormat(lang()==='ru'?'ru-RU':'en-GB',{day:'numeric',month:'long',year:'numeric',...(includeTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(value)):'—'}
 function render(){
  root.querySelectorAll('[data-member-text]').forEach(node=>node.textContent=t(node.dataset.memberText));
  root.setAttribute('aria-label',lang()==='ru'?'Личный кабинет':'Participant account');
  root.querySelector('.member-nav').setAttribute('aria-label',lang()==='ru'?'Разделы кабинета':'Account sections');
  if(!account)return;
  setAll('[data-member-email]',account.profile.email);
  setAll('[data-member-initial]',(account.profile.name||account.profile.email).slice(0,1).toUpperCase());
  setAll('[data-member-value="name"]',account.profile.name||t('notProvided'));
  setAll('[data-member-value="email"]',account.profile.email);
  setAll('[data-member-value="joined"]',formattedDate(account.profile.joinedAt));
  setAll('[data-member-value="expires"]',formattedDate(account.session.expiresAt,true));
  // These views intentionally have no playback/payment controls until the viewer
  // entitlement model is connected on the server. Browser state grants nothing.
  for(const key of ['courses','videos'])setAll('[data-member-count="'+key+'"]',String(account.features.materialAccess?account.library[key].length:0));
  window.dispatchEvent(new CustomEvent('mysterion:participant-data',{detail:account}));
 }
 function navigate(next,focus=true){
  if(!views.includes(next)||!account)return;view=next;
  root.querySelectorAll('[data-member-panel]').forEach(panel=>panel.hidden=panel.dataset.memberPanel!==view);
  root.querySelectorAll('.member-nav [data-member-section]').forEach(button=>{if(button.dataset.memberSection===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  history.replaceState(null,'',location.pathname+location.search+'#'+view);
  if(focus)root.querySelector('[data-member-panel="'+view+'"] h1').focus({preventScroll:true});
 }
 function wipePrivateDOM(){
  account=null;resetBusy=false;
  window.dispatchEvent(new Event('mysterion:participant-clear'));
  setAll('[data-member-email]','');setAll('[data-member-initial]','M');setAll('[data-member-value]','');
  setAll('[data-member-count]','0');$('member-profile-status').textContent='';$('member-change-password').disabled=false;$('member-views').hidden=true;
 }
 function clear(){
  generation++;controller?.abort();controller=null;wipePrivateDOM();
  $('member-loading').hidden=false;root.querySelector('.member-load-error').hidden=true;root.querySelector('.member-main').removeAttribute('data-ready');
 }
 async function request(path,body,signal){
  const abort=new AbortController();let timer;
  const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)abort.abort();
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('request_timeout'));abort.abort()},20000)});
  try{return await Promise.race([(async()=>{
   const response=await fetch('/api/viewer/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal,headers:body?{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}:{},...(body?{body:JSON.stringify(body)}:{})});
   let value;try{value=await response.json()}catch{throw Error('failed')}
   if(!response.ok){const error=Error(response.status===401?'authentication_required':'failed'),retry=Number(response.headers.get('Retry-After')||value.retryAfter);if(response.status===429&&Number.isInteger(retry)&&retry>0&&retry<=3600)error.retryAfter=retry;throw error}
   return value;
  })(),deadline])}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
 }
 async function load(){
  controller?.abort();controller=new AbortController();const mine=++generation;wipePrivateDOM();
  $('member-views').hidden=true;$('member-loading').hidden=false;root.querySelector('.member-load-error').hidden=true;root.querySelector('.member-main').setAttribute('aria-busy','true');
  try{
   const data=await request('account',undefined,controller.signal);
   if(mine!==generation||root.hidden)return;
   if(typeof data.profile?.email!=='string'||data.profile.emailVerified!==true||!data.library||!['courses','videos','purchases','continueLearning'].every(k=>Array.isArray(data.library[k]))||!Number.isFinite(data.session?.expiresAt)||!data.features)throw Error('failed');
   account=data;render();$('member-loading').hidden=true;$('member-views').hidden=false;root.querySelector('.member-main').dataset.ready='true';
   navigate(views.includes(location.hash.slice(1))?location.hash.slice(1):'home',false);
  }catch(error){
   if(mine!==generation)return;
   if(error.message==='authentication_required'){clear();window.dispatchEvent(new Event('mysterion:viewer-unauthorized'));return}
   account=null;setAll('[data-member-email]','');setAll('[data-member-value]','');$('member-loading').hidden=true;root.querySelector('.member-load-error').hidden=false;$('member-load-status').textContent=t(error.message);
  }finally{if(mine===generation)root.querySelector('.member-main').setAttribute('aria-busy','false')}
 }
 root.querySelectorAll('[data-member-section]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.memberSection)));
 root.querySelectorAll('[data-member-logout]').forEach(button=>button.addEventListener('click',()=>$('viewer-logout').click()));
 $('member-retry').addEventListener('click',()=>load());
 $('member-change-password').addEventListener('click',async()=>{
  if(!account||resetBusy)return;resetBusy=true;const mine=generation,email=account.profile.email,button=$('member-change-password');button.disabled=true;$('member-profile-status').textContent=t('working');
  try{await request('forgot-password',{email},controller?.signal);if(mine===generation)$('member-profile-status').textContent=t('resetSent')}
  catch(error){if(mine===generation)$('member-profile-status').textContent=error.retryAfter?t('retryWait').replace('{seconds}',String(error.retryAfter)):t(error.message==='request_timeout'?'request_timeout':'resetFailed')}
  finally{if(mine===generation){resetBusy=false;button.disabled=false}}
 });
 window.addEventListener('mysterion:viewer-session',event=>{if(!event.detail.showAccount){clear();return}if(!account||account.session.expiresAt!==event.detail.expiresAt)load()});
 window.addEventListener('mysterion:session-expired',clear);
 window.addEventListener('mysterion:participant-refresh',event=>{if(account&&event.detail?.profile?.email===account.profile.email){account=event.detail;render()}});
 window.addEventListener('mysterion:language',()=>render());
 window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(views.includes(next))navigate(next,false)});
 render();if(!root.hidden)load();
})();
