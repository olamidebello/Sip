import {icon} from './messengerIcons.js';

export function setupCallGui({document,openVideo}) {
  const incoming=document.getElementById('incoming');
  const active=document.getElementById('active');
  let timer,started;
  const names=[];
  for(const [panel,label] of [[incoming,'Incoming audio call'],[active,'Audio call']]) {
    panel.classList.add('call-screen');
    const hero=document.createElement('div');hero.className='call-hero';
    const avatar=document.createElement('div');avatar.className='call-avatar';avatar.textContent='☎';avatar.setAttribute('aria-hidden','true');
    const name=document.createElement('h3');name.textContent='Olamide call';names.push(name);
    const caption=document.createElement('p');caption.textContent=label;
    hero.append(avatar,name,caption);panel.prepend(hero);
    const controls=document.createElement('div');controls.className='call-controls';
    for(const button of [...panel.children].filter(child=>child.tagName==='BUTTON'))controls.append(button);
    panel.append(controls);
    const minimize=document.createElement('button');minimize.type='button';minimize.className='call-minimize';minimize.textContent='Minimize';minimize.setAttribute('aria-expanded','true');
    minimize.onclick=()=>{const small=panel.classList.toggle('call-minimized');minimize.textContent=small?'Expand call':'Minimize';minimize.setAttribute('aria-expanded',String(!small));};panel.append(minimize);
  }
  incoming.querySelector('strong')?.remove();
  const duration=document.createElement('p');duration.className='call-duration';duration.setAttribute('aria-label','Call duration');active.querySelector('.call-hero').append(duration);
  for(const id of ['answer','reject','hangup']) {
    const button=document.getElementById(id);const label=button.textContent;
    button.innerHTML=icon('calls')+`<span>${label}</span>`;button.setAttribute('aria-label',label+' audio call');
  }
  const video=document.createElement('button');video.type='button';video.className='chat-video-call';video.innerHTML=icon('video');video.setAttribute('aria-label','Open video meeting invitation');
  video.onclick=openVideo;document.querySelector('.chat-thread-header')?.insertBefore(video,document.querySelector('.chat-thread-header button[aria-label="Conversation menu"]'));
  const live=document.getElementById('meeting-live');
  if(live){
    live.classList.add('video-call-overlay');
    const minimize=document.createElement('button');minimize.type='button';minimize.className='video-minimize';minimize.textContent='Minimize video';minimize.setAttribute('aria-expanded','true');
    minimize.onclick=()=>{const small=live.classList.toggle('video-minimized');minimize.textContent=small?'Expand video':'Minimize video';minimize.setAttribute('aria-expanded',String(!small));};live.prepend(minimize);
  }
  return {
    identity(value){for(const name of names)name.textContent=value||'Unknown caller';},
    active(value){
      clearInterval(timer);timer=undefined;active.classList.remove('call-minimized');incoming.classList.remove('call-minimized');
      if(value){incoming.hidden=true;started=Date.now();const tick=()=>{const seconds=Math.floor((Date.now()-started)/1000);duration.textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};tick();timer=setInterval(tick,1000);}
      else duration.textContent='';
    },
    dispose(){clearInterval(timer);}
  };
}
