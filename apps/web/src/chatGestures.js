// Gestures reveal existing controls; backend authorization stays in those handlers.
export function setupChatGestures(document){
  const root=document.getElementById('chat');let press=null,timer=null;
  const clear=()=>{clearTimeout(timer);timer=null;};
  const interactive=target=>target.closest('input,textarea,select,a,.message-actions,button:not(.chat-contact)');
  function reveal(target){
    if(target.matches('.chat-contact')){target.click();const options=root.querySelector('.chat-options');if(options){options.open=true;options.querySelector('summary')?.focus();}}
    else{target.classList.add('message-selected');target.querySelector('.message-actions button')?.focus();}
  }
  const down=event=>{
    if(event.button!==0||interactive(event.target))return;
    const target=event.target.closest('.message-bubble,.chat-contact,.chat-thread-header');if(!target)return;
    press={target,x:event.clientX,y:event.clientY,id:event.pointerId,long:false};
    timer=setTimeout(()=>{if(!press)return;press.long=true;reveal(target);},500);
  };
  const move=event=>{if(press&&(Math.abs(event.clientX-press.x)>12||Math.abs(event.clientY-press.y)>12))clear();};
  const up=event=>{
    clear();if(!press||press.id!==event.pointerId){press=null;return;}
    const {target,x,y,long}=press;press=null;const dx=event.clientX-x,dy=event.clientY-y;
    if(long||Math.abs(dx)<65||Math.abs(dy)>30)return;
    if(target.matches('.message-bubble')&&dx>0){[...target.querySelectorAll('.message-actions button')].find(button=>button.textContent==='Reply')?.click();}
    if(target.matches('.chat-thread-header')&&dx>0&&document.defaultView.matchMedia?.('(max-width:900px)').matches){root.classList.remove('thread-open','chat-overlay');}
  };
  const cancel=()=>{clear();press=null;};
  const context=event=>{const target=event.target.closest('.message-bubble,.chat-contact');if(target&&!interactive(event.target)){event.preventDefault();reveal(target);}};
  const key=event=>{if(event.key==='Escape'){root.querySelectorAll('.message-selected').forEach(item=>item.classList.remove('message-selected'));root.classList.remove('chat-overlay');}};
  const handlers={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,contextmenu:context,keydown:key};
  for(const [name,handler]of Object.entries(handlers))root.addEventListener(name,handler);
  // Avoid firing a delayed long press after leaving the chat or scrolling.
  root.addEventListener('scroll',cancel,true);
  return {dispose(){cancel();for(const [name,handler]of Object.entries(handlers))root.removeEventListener(name,handler);root.removeEventListener('scroll',cancel,true);}};
}
