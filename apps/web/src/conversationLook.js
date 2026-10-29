import {icon} from './messengerIcons.js';
export function setupConversationLook({document,form,mode='chat'}){
 if(form.dataset.conversationLook)return {refresh(){},dispose(){}};
 form.dataset.conversationLook='compact';
 if(!document.getElementById('conversation-look-css')){const sheet=document.createElement('link');sheet.id='conversation-look-css';sheet.rel='stylesheet';sheet.href=new URL('./conversationLook.css?no-inline',import.meta.url).href;document.head.append(sheet);}
 const sms=mode==='sms',body=form.querySelector('textarea[name=body]'),send=form.querySelector('button:not([type=button])');
 if(!body||!send)return {refresh(){},dispose(){}};
 const el=(tag,cls)=>{const n=document.createElement(tag);n.className=cls;return n;};
 const row=el('div','phone-message-row'),pill=el('div','phone-message-pill'),actions=el('div','phone-message-action');
 const extras=el('details','phone-message-extras'),summary=document.createElement('summary');summary.textContent=sms?'SMS options':'More tools';extras.append(summary);
 const tools=form.querySelector(sms?'.sms-composer-tools':'.messenger-media-tools');
 const emoji=form.querySelector(sms?'.sms-emoji-toggle':'.chat-emoji-toggle');
 const attach=form.querySelector(sms?'.sms-attach':'.chat-attach');
 const camera=form.querySelector(sms?'.sms-camera':'button[aria-label="Take photo or video"]');
 const mic=form.querySelector(sms?'.sms-microphone':'.chat-record');
 const label=body.closest('label')||body;
 for(const [button,name,glyph]of [[emoji,'Choose emoji','emoji'],[attach,'Attach or share','attach'],[camera,sms?'SMS media options':'Take photo or video','camera']]){
  if(!button)continue;
  // Keep existing click handlers and service permissions.
  button.innerHTML=icon(glyph==='camera'?'video':glyph);button.classList.add('phone-message-icon');
  if(button===camera){button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 9.5 3h5L16 5h4v15H4V5z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';}
  button.setAttribute('aria-label',name);
 }
 if(emoji)pill.append(emoji);pill.append(label);if(attach)pill.append(attach);if(camera)pill.append(camera);
 body.placeholder='Message';body.rows=1;body.dir='auto';send.type='submit';send.innerHTML=icon('send');send.setAttribute('aria-label',sms?'Send SMS':'Send message');send.classList.add('phone-message-send');
 actions.append(send);if(mic){mic.classList.add('phone-message-mic');if(sms){mic.innerHTML=icon('mic');mic.disabled=true;mic.title='Voice notes are available in App Chat, not this SMS connection';mic.setAttribute('aria-label',mic.title);}actions.append(mic);}
 row.append(pill,actions);
 for(const name of ['.sms-character-count','.chat-writing-count','.sms-composer-options','.chat-writing-tools']){const n=form.querySelector(name);if(n)extras.append(n);}
 if(tools)extras.append(tools);
 if(sms){for(const n of [...form.children])if(n.tagName==='LABEL'&&!n.contains(body))extras.append(n);}
 form.append(row,extras);
 const update=()=>{const hasText=!!body.value.trim(),hasMedia=!!form.querySelector('.chat-attachment-preview:not(:empty)');send.hidden=!(hasText||hasMedia);if(mic)mic.hidden=hasText||hasMedia;};
 body.addEventListener('input',update);form.addEventListener('reset',()=>document.defaultView.queueMicrotask(update));
 const observer=new document.defaultView.MutationObserver(update);if(tools)observer.observe(tools,{childList:true,subtree:true,characterData:true});update();
 return {refresh:update,dispose(){observer.disconnect();body.removeEventListener('input',update);}};
}
