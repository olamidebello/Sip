import {setupSipVideoCall} from './sipVideoCall.js';
import {callAddressLabel,callIdentityLabel} from './callIdentity.js';
import {icon} from './messengerIcons.js';

export function setupCallGui({document,openVideo,openAudio=()=>{},getPhone=()=>undefined,onStatus=()=>{}}) {
  const incoming=document.getElementById('incoming');
  const active=document.getElementById('active');
  let timer,started,addressLabel='',connected=false;
  const captions=[];
  const names=[];
  const numbers=[];
  for(const [panel,label] of [[incoming,'Incoming audio call'],[active,'Audio call']]) {
    panel.classList.add('call-screen');panel.setAttribute('role','region');panel.setAttribute('aria-label',label);panel.tabIndex=-1;
    const hero=document.createElement('div');hero.className='call-hero';
    const avatar=document.createElement('div');avatar.className='call-avatar';avatar.textContent='☎';avatar.setAttribute('aria-hidden','true');
    const name=document.createElement('h3');name.textContent='Olamide call';names.push(name);
    const caption=document.createElement('p');caption.textContent=label;caption.setAttribute('role','status');caption.setAttribute('aria-live','polite');captions.push(caption);
    const number=document.createElement('p');number.className='call-number';number.hidden=true;numbers.push(number);
    hero.append(avatar,name,number,caption);panel.prepend(hero);
    const controls=document.createElement('div');controls.className='call-controls';
    for(const button of [...panel.children].filter(child=>child.tagName==='BUTTON'))controls.append(button);
    panel.append(controls);
    const minimize=document.createElement('button');minimize.type='button';minimize.className='call-minimize';minimize.textContent='Minimize';minimize.setAttribute('aria-expanded','true');
    minimize.onclick=()=>{const small=panel.classList.toggle('call-minimized');minimize.textContent=small?'Expand call':'Minimize';minimize.setAttribute('aria-expanded',String(!small));};panel.append(minimize);
  }
  const accessibility=document.getElementById('messenger-accessibility-form');
  if(accessibility){
    const label=document.createElement('label'),large=document.createElement('input');large.type='checkbox';large.name='largeCallControls';
    const apply=enabled=>{large.checked=enabled;document.body.classList.toggle('calling-large-controls',enabled);};
    try{apply(document.defaultView.localStorage.getItem('calling-large-controls')==='true');}catch{apply(false);}
    large.onchange=()=>{apply(large.checked);try{document.defaultView.localStorage.setItem('calling-large-controls',String(large.checked));}catch{}};
    label.append(large,' Larger calling controls (this device)');accessibility.append(label);
  }
  incoming.querySelector('strong')?.remove();
  document.body.append(incoming,active);
  const duration=document.createElement('p');duration.className='call-duration';duration.setAttribute('aria-label','Call duration');duration.setAttribute('aria-live','off');active.querySelector('.call-hero').append(duration);
  for(const id of ['answer','reject','hangup']) {
    const button=document.getElementById(id);const label=button.textContent;
    button.innerHTML=icon('calls')+`<span>${label}</span>`;button.setAttribute('aria-label',label+' audio call');
  }
  const video=document.createElement('button');video.type='button';video.className='chat-video-call';video.innerHTML=icon('video');video.setAttribute('aria-label','Open video meeting invitation');
  video.onclick=()=>{if(connected){void sipVideo.request().catch(error=>onStatus(error.message));return;}openVideo();};document.querySelector('.chat-thread-header')?.insertBefore(video,document.querySelector('.chat-thread-header button[aria-label="Conversation menu"]'));
  const keypad=document.createElement('div');keypad.className='call-keypad';keypad.hidden=true;keypad.setAttribute('aria-label','In-call keypad');
  const toneDisplay=document.createElement('output');toneDisplay.className='call-keypad-number';toneDisplay.setAttribute('aria-label','Entered call menu digits');toneDisplay.setAttribute('aria-live','polite');
  const resetTones=()=>{toneDisplay.textContent='';};keypad.append(toneDisplay);
  const letters=['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+',''];
  for(const [index,digit] of [...'123456789*0#'].entries()){
    const b=document.createElement('button');b.type='button';b.dataset.digit=digit;b.setAttribute('aria-label',digit+' '+letters[index]);
    const number=document.createElement('span');number.textContent=digit;const caption=document.createElement('small');caption.textContent=letters[index]||'\u00a0';b.append(number,caption);
    b.onclick=()=>{const input=document.getElementById('tone');if(input){input.value=digit;toneDisplay.textContent=(toneDisplay.textContent+digit).slice(-64);document.getElementById('send-tone')?.click();}};keypad.append(b);
  }
  const clear=document.createElement('button');clear.type='button';clear.className='call-keypad-clear';clear.textContent='Clear display';clear.onclick=resetTones;keypad.append(clear);
  const note=document.createElement('small');note.className='call-keypad-note';note.textContent='Call menu digits. Clearing this display does not undo tones already sent.';keypad.append(note);active.append(keypad);
  const keyboardTones=event=>{if(keypad.hidden||active.hidden||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;if(/^[0-9*#]$/.test(event.key)){event.preventDefault();if(!event.repeat)keypad.querySelector('[data-digit="'+event.key+'"]').click();}};
  document.addEventListener('keydown',keyboardTones);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='call-keypad-toggle';toggle.textContent='Keypad';toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{keypad.hidden=!keypad.hidden;toggle.setAttribute('aria-expanded',String(!keypad.hidden));active.classList.toggle('call-keypad-open',!keypad.hidden);};active.querySelector('.call-controls').prepend(toggle);
  const audio=document.createElement('button');audio.type='button';audio.className='call-audio-output';audio.textContent='Audio output';audio.onclick=openAudio;active.querySelector('.call-controls').prepend(audio);
  const tray=active.querySelector('.call-controls');
  const decorate=(b,g,label)=>{b.innerHTML=icon(g)+`<span>${label}</span>`;b.setAttribute('aria-label',label);};
  decorate(audio,'devices','Speaker');audio.setAttribute('aria-label','Speaker and audio output settings');
  const mute=document.getElementById('mute');if(mute)decorate(mute,'mic','Mute');
  const hangup=document.getElementById('hangup');decorate(hangup,'calls','End');
  const meetingAction=(label,g)=>{const b=document.createElement('button');b.type='button';decorate(b,g,label);b.setAttribute('aria-label',label+' — open separate video meeting invitation');b.title='Open a separate video meeting invitation';b.onclick=()=>{active.classList.add('call-minimized');const m=active.querySelector('.call-minimize');m.textContent='Expand call';m.setAttribute('aria-expanded','false');openVideo();};return b;};
  const participant=meetingAction('Add participant','people');participant.className='call-add-participant';active.append(participant);
  const extras=document.createElement('div');extras.className='call-more-actions';extras.id='call-more-actions';extras.hidden=true;
  const hold=document.getElementById('hold');if(hold)extras.append(hold);extras.append(toggle);active.append(extras);
  const more=document.createElement('button');more.type='button';decorate(more,'more','More');more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls',extras.id);more.onclick=()=>{extras.hidden=!extras.hidden;more.setAttribute('aria-expanded',String(!extras.hidden));};
  const inCallVideo=document.createElement('button');inCallVideo.type='button';inCallVideo.className='call-video-toggle';decorate(inCallVideo,'video','Video');inCallVideo.disabled=true;
  const sipVideo=setupSipVideoCall({document,active,button:inCallVideo,getPhone,onStatus});
  tray.append(audio,inCallVideo);if(mute)tray.append(mute);tray.append(more,meetingAction('Share','send'),hangup);
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
    number(address){const value=callAddressLabel(address);addressLabel=value;for(const name of names)name.textContent=value;for(const node of numbers){node.textContent=value;node.hidden=!value;}},
    incoming(){incoming.hidden=false;captions[0].textContent='Incoming call';document.getElementById('answer').focus();},
    pending(){resetTones();incoming.hidden=true;active.hidden=false;active.focus();duration.textContent='';captions[1].textContent='Calling…';controls(false);},
    identity(value){for(const name of names)name.textContent=callIdentityLabel(addressLabel,value);},
    held(value){captions[1].textContent=value?'On hold':'Connected';},
    video(){return sipVideo.request();},
    active(value){
      connected=!!value;
      sipVideo.active(value);inCallVideo.disabled=!value;
      clearInterval(timer);timer=undefined;active.classList.remove('call-minimized');incoming.classList.remove('call-minimized');
      controls(value);resetTones();extras.hidden=true;more.setAttribute('aria-expanded','false');keypad.hidden=true;active.classList.remove('call-keypad-open');toggle.setAttribute('aria-expanded','false');
      if(value){captions[1].textContent='Connected';incoming.hidden=true;started=Date.now();const tick=()=>{const seconds=Math.floor((Date.now()-started)/1000);duration.textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;};tick();timer=setInterval(tick,1000);}
      else duration.textContent='';
    },
    dispose(){sipVideo.dispose();clearInterval(timer);document.removeEventListener('keydown',keyboardTones);}
  };
}

