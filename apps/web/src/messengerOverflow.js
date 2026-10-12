export function setupMessengerOverflow({document,nav,trigger,show,newChat,readAll,isAdmin=false}){
 const controller=new document.defaultView.AbortController(),signal=controller.signal;
 const menu=document.createElement('div');menu.id='messenger-overflow';menu.className='messenger-overflow';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Chat menu');
 trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-haspopup','menu');
 function close(){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}
 function item(label,run,note){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','menuitem');if(note){button.disabled=true;button.title=note;button.setAttribute('aria-label',label+' — '+note);}else button.onclick=()=>{close();run();};menu.append(button);}
 item('New chat',newChat);
 item('New group',null,'Group chats are not implemented');item('New community',null,'Communities are not implemented');item('New broadcast',null,'User broadcasts are not implemented');item('Linked devices',null,'Linked-device sessions are not implemented');item('Starred',null,'Starred messages are not implemented');
 item('Read all',readAll);item('Money $',()=>show('money'));item('Settings',()=>show('account'));item('More tools',()=>nav.classList.toggle('show-user-tools'));
 if(isAdmin)item('Administration',()=>show('admin'));
 nav.append(menu);
 trigger.onclick=()=>{const open=menu.hidden;menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)menu.querySelector('button:not(:disabled)')?.focus();};
 document.addEventListener('click',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))close();},{signal});
 document.addEventListener('keydown',event=>{if(menu.hidden)return;if(event.key==='Escape'){close();trigger.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const choices=[...menu.querySelectorAll('button:not(:disabled)')],index=choices.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next]?.focus();}},{signal});
 return {dispose(){controller.abort();menu.remove();}};
}
