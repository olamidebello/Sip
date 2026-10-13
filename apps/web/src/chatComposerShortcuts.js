import {icon} from './messengerIcons.js';
export function setupChatComposerShortcuts({document,moneyAllowed,payContact}){
 const form=document.getElementById('send-message'),select=document.getElementById('contact-list'),body=form.querySelector('[name=body]'),toolbar=form.querySelector('.messenger-media-tools');
 form.classList.add('chat-icon-composer');body.placeholder='Message';
 const video=document.createElement('button');video.type='button';video.className='chat-compose-video';video.innerHTML=icon('video');video.setAttribute('aria-label','Video call');video.title='Video call';video.onclick=()=>document.querySelector('.chat-video-call')?.click();
 const money=document.createElement('button');money.type='button';money.className='chat-compose-money';money.innerHTML=icon('money');money.setAttribute('aria-label','Send money');money.title='Send money';money.onclick=()=>payContact(select.selectedOptions[0]?.dataset.email);
 toolbar.append(video,money);
 function disabled(node,value){if(node&&node.disabled!==value)node.disabled=value;}
 function refresh(){const submit=form.querySelector('button[type=submit]');if(submit)submit.hidden=!body.value.trim();const selected=select.selectedOptions[0],unavailable=!selected?.value||body.disabled;disabled(video,!selected?.value||document.getElementById('meetings').hidden);disabled(money,!selected?.dataset.email||!moneyAllowed());money.title=moneyAllowed()?'Send money to this contact':'Money access is not enabled for your account';disabled(form.querySelector('.chat-attach'),unavailable||form.querySelector('input[type=file]').disabled);disabled(form.querySelector('.chat-record'),unavailable);disabled(form.querySelector('.chat-emoji-toggle'),unavailable);}
 select.addEventListener('change',refresh);body.addEventListener('input',refresh);const reset=()=>document.defaultView.queueMicrotask(refresh);form.addEventListener('reset',reset);
 const observer=new document.defaultView.MutationObserver(refresh);observer.observe(select,{childList:true,subtree:true,attributes:true});observer.observe(form,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});observer.observe(form.querySelector('input[type=file]'),{attributes:true,attributeFilter:['disabled']});refresh();
 return {refresh,dispose(){observer.disconnect();select.removeEventListener('change',refresh);body.removeEventListener('input',refresh);form.removeEventListener('reset',reset);}};
}
