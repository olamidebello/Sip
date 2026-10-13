export function setupMessengerOverflow({document,nav,trigger,show,newChat,readAll,openHub=()=>{},isAdmin=false,allow=()=>true,hasExtras=true,isCalls=false,clearCalls=()=>{},scheduledCalls=()=>{}}){
 const controller=new document.defaultView.AbortController(),signal=controller.signal;
 const menu=document.createElement('div');menu.id='messenger-overflow';menu.className='messenger-overflow';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Chat menu');
 trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-haspopup','menu');
 function close(){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}
 function item(label,run,note){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','menuitem');if(note){button.disabled=true;button.title=note;button.setAttribute('aria-label',label+' — '+note);}else button.onclick=()=>{close();run();};menu.append(button);}
 function render(){menu.replaceChildren();
 if(typeof isCalls==='function'?isCalls():isCalls){item('Clear call log',clearCalls);item('Scheduled calls',scheduledCalls);item('Settings',()=>show('messenger-settings'));}else{
 item('New chat',newChat);
 item('New group',()=>openHub('group'));item('New community',()=>openHub('community'));item('New broadcast',()=>openHub('broadcast'));item('Linked sessions',()=>openHub('sessions'));item('Starred',()=>openHub('starred'));item('Storage & data',()=>openHub('storage'));
 item('Read all',readAll);if(allow('money'))item('Money $',()=>show('money'));item('Settings',()=>show('messenger-settings'));item('Privacy',()=>show('contact-presence-settings'));item('Appearance',()=>show('background-user'));item('Help',()=>show('support'));if(hasExtras)item('More tools',()=>nav.classList.toggle('show-user-tools'));
 }
 if(isAdmin)item('Administration',()=>show('admin'));
 }
 render();
 nav.append(menu);
 trigger.onclick=()=>{const open=menu.hidden;if(open)render();menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)menu.querySelector('button:not(:disabled)')?.focus();};
 document.addEventListener('click',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))close();},{signal});
 document.addEventListener('keydown',event=>{if(menu.hidden)return;if(event.key==='Escape'){close();trigger.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const choices=[...menu.querySelectorAll('button:not(:disabled)')],index=choices.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[next]?.focus();}},{signal});
 return {dispose(){controller.abort();menu.remove();}};
}
