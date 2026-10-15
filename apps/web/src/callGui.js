import {icon} from './messengerIcons.js';

export function setupCallGui({document,openVideo,openAudio=()=>{}}) {
  const incoming=document.getElementById('incoming');
  const active=document.getElementById('active');
  let timer,started;
  const captions=[];
  const names=[];
  const numbers=[];
  for(const [panel,label] of [[incoming,'Incoming audio call'],[active,'Audio call']]) {
    panel.classList.add('call-screen');
    const hero=document.createElement('div');hero.className='call-hero';
    const avatar=document.createElement('div');avatar.className='call-avatar';avatar.textContent='☎';avatar.setAttribute('aria-hidden','true');
    const name=document.createElement('h3');name.textContent='Olamide call';names.push(name);
    const caption=document.createElement('p');caption.textContent=label;captions.push(caption);
    const number=document.createElement('p');number.className='call-number';number.hidden=true;numbers.push(number);
    hero.append(avatar,name,number,caption);panel.prepend(hero);
    const controls=document.createElement('div');controls.className='call-controls';
    for(const button of [...panel.children].filter(child=>child.tagName==='BUTTON'))controls.append(button);
    panel.append(controls);
    const minimize=document.createElement('button');minimize.type='button';minimize.className='call-minimize';minimize.textContent='Minimize';minimize.setAttribute('aria-expanded','true');
    minimize.onclick=()=>{const small=panel.classList.toggle('call-minimized');minimize.textContent=small?'Expand call':'Minimize';minimize.setAttribute('aria-expanded',String(!small));};panel.append(minimize);
  }
  incoming.querySelector('strong')?.remove();
  document.body.append(incoming,active);
  const duration=document.createElement('p');duration.className='call-duration';duration.setAttribute('aria-label','Call duration');active.querySelector('.call-hero').append(duration);
  for(const id of ['answer','reject','hangup']) {
    const button=document.getElementById(id);const label=button.textContent;
    button.innerHTML=icon('calls')+`<span>${label}</span>`;button.setAttribute('aria-label',label+' audio call');
  }
  const video=document.createElement('button');video.type='button';video.className='chat-video-call';video.innerHTML=icon('video');video.setAttribute('aria-label','Open video meeting invitation');
  video.onclick=openVideo;document.querySelector('.chat-thread-header')?.insertBefore(video,document.querySelector('.chat-thread-header button[aria-label="Conversation menu"]'));
  const keypad=document.createElement('div');keypad.className='call-keypad';keypad.hidden=true;keypad.setAttribute('aria-label','In-call keypad');
  for(const digit of '123456789*0#'){const b=document.createElement('button');b.type='button';b.textContent=digit;b.onclick=()=>{const input=document.getElementById('tone');if(input){input.value=digit;document.getElementById('send-tone')?.click();}};keypad.append(b);}active.append(keypad);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='call-keypad-toggle';toggle.textContent='Keypad';toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{keypad.hidden=!keypad.hidden;toggle.setAttribute('aria-expanded',String(!keypad.hidden));};active.querySelector('.call-controls').prepend(toggle);
  const audio=document.createElement('button');audio.type='button';audio.className='call-audio-output';audio.textContent='Audio output';audio.onclick=openAudio;active.querySelector('.call-controls').prepend(audio);
  function controls(connected){for(const b of [document.getElementById('hold'),document.getElementById('mute'),toggle,...keypad.querySelectorAll('button')])if(b)b.disabled=!connected;}
  controls(false);
  const live=document.getElementById('meeting-live');
  if(live){
    live.classList.add('video-call-overlay');
    document.body.append(live);
    const minimize=document.createElement('button');minimize.type='button';minimize.className='video-minimize';minimize.textContent='Minimize video';minimize.setAttribute('aria-expanded','true');
    minimize.onclick=()=>{const small=live.classList.toggle('video-minimized');minimize.textContent=small?'Expand video':'Minimize video';minimize.setAttribute('aria-expanded',String(!small));};live.prepend(minimize);
  }
  return {
    number(address){const value=String(address||'').replace(/^sips?:/i,'').split('@')[0].split(';')[0];for(const node of numbers){node.textContent=value;node.hidden=!value;}},
    pending(){incoming.hidden=true;active.hidden=false;duration.textContent='';captions[1].textContent='Calling…';controls(false);},
    identity(value){for(const name of names)name.textContent=value||'Unknown caller';},
    active(value){
      clearInterval(timer);timer=undefined;active.classList.remove('call-minimized');incoming.classList.remove('call-minimized');
      controls(value);keypad.hidden=true;toggle.setAttribute('aria-expanded','false');
      if(value){captions[1].textContent='Connected';incoming.hidden=true;started=Date.now();const tick=()=>{const seconds=Math.floor((Date.now()-started)/1000);duration.textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};tick();timer=setInterval(tick,1000);}
      else duration.textContent='';
    },
    dispose(){clearInterval(timer);}
  };
}
