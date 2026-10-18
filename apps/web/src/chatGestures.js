// Gestures reveal the selected message's existing, authorized backend actions.
export function setupChatGestures(document,{holdMs=500}={}){
 const root=document.getElementById('chat');let press=null,timer=null,suppressClickUntil=0;
 const style=document.createElement('style');style.textContent=`
 #chat .message-bubble{touch-action:pan-y;transition:transform .15s ease}
 #chat .message-bubble.message-swiping{transition:none;user-select:none}
 #chat .message-bubble:not(.message-selected)>.message-actions{display:none}
 #chat .message-bubble.message-selected>.message-actions{display:flex;flex-wrap:wrap;gap:6px}
 #chat .message-options-trigger{float:right;display:inline-flex;align-items:center;justify-content:center;min-width:36px;min-height:36px;padding:4px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:23px;cursor:pointer}
 #chat .message-options-trigger:focus-visible{outline:3px solid #21c46b;outline-offset:2px}
 #chat .message-bubble.message-selected{outline:2px solid #21c46b;outline-offset:2px}
 @media(prefers-reduced-motion:reduce){#chat .message-bubble{transition:none}}
 `;document.head.append(style);
 const resetMotion=target=>{target?.classList.remove('message-swiping');if(target)target.style.transform='';};
 const clear=()=>{clearTimeout(timer);timer=null;};
 const interactive=target=>target.closest('input,textarea,select,a,audio,video,.message-actions,button:not(.chat-contact)');
 function dismiss(){root.querySelectorAll('.message-selected').forEach(item=>{item.classList.remove('message-selected');item.setAttribute('aria-expanded','false');item.querySelector('.message-options-trigger')?.setAttribute('aria-expanded','false');});}
 function reveal(target){
  if(target.matches('.chat-contact')){target.click();const options=root.querySelector('.chat-options');if(options){options.open=true;options.querySelector('summary')?.focus();}return;}
  if(!target.querySelector('.message-actions'))return;
  dismiss();target.classList.add('message-selected');target.setAttribute('aria-expanded','true');target.querySelector('.message-options-trigger')?.setAttribute('aria-expanded','true');target.querySelector('.message-actions button:not(:disabled)')?.focus({preventScroll:true});
 }
 const down=event=>{
  if((event.button??0)!==0||interactive(event.target))return;
  const target=event.target.closest('.message-bubble,.chat-contact,.chat-thread-header');if(!target)return;
  if(press)return;
  clear();press={target,x:event.clientX,y:event.clientY,id:event.pointerId,long:false,scrolled:false,horizontal:false};
  timer=setTimeout(()=>{if(!press||press.target!==target||press.scrolled)return;press.long=true;suppressClickUntil=Date.now()+600;reveal(target);},holdMs);
 };
 const move=event=>{if(!press||press.id!==event.pointerId)return;const dx=event.clientX-press.x,dy=event.clientY-press.y;if(Math.abs(dx)>12||Math.abs(dy)>12)clear();if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){press.scrolled=true;resetMotion(press.target);}if(!press.scrolled&&!press.long&&press.target.matches('.message-bubble')&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.25){press.horizontal=true;press.target.classList.add('message-swiping');press.target.style.transform=`translateX(${Math.max(-56,Math.min(56,dx*.65))}px)`;if(event.cancelable)event.preventDefault();}};
 const up=event=>{
  clear();if(!press||press.id!==event.pointerId){press=null;return;}
  const {target,x,y,long,scrolled}=press;press=null;resetMotion(target);const dx=event.clientX-x,dy=event.clientY-y;
  if(long||scrolled||Math.abs(dx)<65||Math.abs(dy)>30)return;
  if(target.matches('.message-bubble')){reveal(target);suppressClickUntil=Date.now()+400;}
  if(target.matches('.chat-thread-header')&&dx>0&&document.defaultView.matchMedia?.('(max-width:900px)').matches)root.classList.remove('thread-open','chat-overlay');
 };
 const cancel=()=>{clear();resetMotion(press?.target);press=null;};
 const context=event=>{const target=event.target.closest('.message-bubble,.chat-contact');if(target&&!interactive(event.target)){event.preventDefault();reveal(target);}};
 const key=event=>{const bubble=event.target.closest('.message-bubble');if(bubble&&!interactive(event.target)&&(event.key==='Enter'||event.key==='F10'&&event.shiftKey)){event.preventDefault();reveal(bubble);}if(event.key==='Escape'){dismiss();root.classList.remove('chat-overlay');}};
 const click=event=>{const trigger=event.target.closest('.message-options-trigger');if(trigger){const bubble=trigger.closest('.message-bubble');if(bubble.classList.contains('message-selected'))dismiss();else reveal(bubble);return;}if(!interactive(event.target)&&Date.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();return;}if(event.target.closest('.message-actions button')||!event.target.closest('.message-selected'))dismiss();};
 const change=event=>{if(event.target.closest('.message-actions select'))dismiss();};
 const handlers={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,contextmenu:context,keydown:key,click,change};
 for(const [name,handler]of Object.entries(handlers))root.addEventListener(name,handler);
 root.addEventListener('scroll',cancel,true);
 const navigate=()=>{cancel();dismiss();};document.addEventListener('messenger:navigate',navigate);
 return {dispose(){cancel();dismiss();style.remove();for(const [name,handler]of Object.entries(handlers))root.removeEventListener(name,handler);root.removeEventListener('scroll',cancel,true);document.removeEventListener('messenger:navigate',navigate);}};
}

