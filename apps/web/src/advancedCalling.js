export function parseToneSequence(value){
 const sequence=String(value).replace(/\s/g,'');
 if(!sequence||sequence.length>64||!/^[0-9*#,]+$/.test(sequence))throw Error('Enter up to 64 digits, * or #; use a comma for a two-second pause.');
 return [...sequence];
}
export function createToneSequence({sendTone,isActive,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let revision=0,busy=false;
 return {cancel(){revision++;busy=false;},async send(value){
  const sequence=parseToneSequence(value);if(busy)throw Error('A tone sequence is already running.');if(!isActive())throw Error('Connect a call before sending tones.');
  busy=true;const own=++revision;
  try{for(const tone of sequence){if(own!==revision||!isActive())return false;if(tone===',')await delay(2000);else{await sendTone(tone);await delay(350);}}return own===revision&&isActive();}
  finally{if(own===revision)busy=false;}
 }};
}
export function setupAdvancedCalling({document,getPhone,isActive,isRegistered,getCall}){
 const panel=document.createElement('details');panel.id='advanced-calling';
 panel.innerHTML=`<summary>Advanced calling tools</summary>
 <p>Send menu tones during a connected call. Sequences are used for this session only.</p>
 <form data-tones><label>DTMF sequence <input name="sequence" maxlength="64" autocomplete="off" placeholder="1234#,56#" required></label><button>Send sequence</button><button type="button" data-cancel>Stop tones</button></form>
 <label><input type="checkbox" data-processing checked> Echo cancellation, noise suppression and automatic gain</label><button type="button" data-apply>Apply to current microphone</button>
 <button type="button" data-mic>Test microphone access</button><button type="button" data-diagnostics>Check calling connection</button>
 <p data-feedback role="status"></p>`;
 document.getElementById('softphone-tools')?.append(panel);
 if(!panel.isConnected)document.getElementById('dial')?.after(panel);
 const feedback=panel.querySelector('[data-feedback]');const say=text=>{feedback.textContent=text;};
 let callToken,probeRevision=0,uiRevision=0;
 const tones=createToneSequence({sendTone:tone=>getPhone().sendDTMF(tone),isActive:()=>isActive()&&getCall()===callToken});
 panel.querySelector('[data-tones]').onsubmit=async event=>{event.preventDefault();callToken=getCall();const own=uiRevision;try{say('Sending tones…');const complete=await tones.send(event.target.elements.sequence.value);if(own===uiRevision)say(complete?'Tone sequence sent.':'Tone sequence stopped.');}catch(error){if(own===uiRevision)say(error.message);}};
 panel.querySelector('[data-cancel]').onclick=()=>{tones.cancel();say('Tone sequence stopped.');};
 panel.querySelector('[data-apply]').onclick=async()=>{try{const tracks=getPhone()?.localMediaStream?.getAudioTracks()||[];if(!isActive()||!tracks.length)throw Error('Connect a call before changing microphone processing.');const enabled=panel.querySelector('[data-processing]').checked;await Promise.all(tracks.map(track=>track.applyConstraints({echoCancellation:enabled,noiseSuppression:enabled,autoGainControl:enabled})));say('Microphone processing requested. Browser and device support determine the applied settings.');}catch(error){say(error.message);}};
 panel.querySelector('[data-mic]').onclick=async()=>{if(isActive())return say('End the call before testing microphone access.');const own=++probeRevision;let stream;try{say('Requesting microphone access…');stream=await document.defaultView.navigator.mediaDevices.getUserMedia({audio:true});if(own===probeRevision)say('Microphone access passed. Test capture released; make a call to verify audio.');}catch(error){if(own===probeRevision)say(error.message);}finally{stream?.getTracks().forEach(track=>track.stop());}};
 panel.querySelector('[data-diagnostics]').onclick=()=>{const phone=getPhone(),track=phone?.localMediaStream?.getAudioTracks()[0];say(`Network: ${document.defaultView.navigator.onLine?'online':'offline'}; SIP transport: ${phone?.isConnected()?'connected':'disconnected'}; registration: ${isRegistered()?'accepted':'not registered'}; call: ${isActive()?'connected':'idle'}; microphone: ${track?(track.enabled?'enabled':'muted'):'no active track'}.`);};
 return {reset(){uiRevision++;tones.cancel();probeRevision++;panel.querySelector('[data-tones]').reset();say('');}};
}
