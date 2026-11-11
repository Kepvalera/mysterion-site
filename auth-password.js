/* Visibility stays in this document only; passwords are never copied or stored. */
(() => {
 'use strict';
 const controls=[...document.querySelectorAll('[data-password-toggle]')];
 const text=visible=>document.documentElement.lang==='en'?(visible?'Hide password':'Show password'):(visible?'Скрыть пароль':'Показать пароль');
 function render(button,input){const visible=input.type==='text';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',text(visible));button.title=text(visible);button.querySelector('[data-eye-slash]').setAttribute('visibility',visible?'visible':'hidden')}
 function hideAll(){for(const button of controls){const input=document.getElementById(button.dataset.passwordToggle);if(input){input.type='password';render(button,input)}}}
 for(const button of controls){const input=document.getElementById(button.dataset.passwordToggle);if(!input)continue;button.addEventListener('click',event=>{event.preventDefault();input.type=input.type==='password'?'text':'password';render(button,input)});render(button,input)}
 window.MysterionPasswords={hideAll};
 window.addEventListener('mysterion:language',()=>{for(const b of controls){const input=document.getElementById(b.dataset.passwordToggle);if(input)render(b,input)}});
 window.addEventListener('pagehide',hideAll);document.addEventListener('visibilitychange',()=>{if(document.hidden)hideAll()});hideAll();
})();
