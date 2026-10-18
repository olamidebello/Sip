export function createCallSounds({makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),setTimer=setInterval,clearTimer=clearInterval}={}){
 let context,nodes=[],timer,mode=null;
 function arm(){try{context??=makeContext();if(context.state==='suspended')void context.resume().catch(()=>{});}catch{}}
 function stop(){mode=null;if(timer!==undefined)clearTimer(timer);timer=undefined;for(const n of nodes){try{n.stop?.();n.disconnect();}catch{}}nodes=[];}
 function play(next){if(mode===next&&nodes.length)return;stop();arm();if(!context)return;mode=next;try{
  const gain=context.createGain();gain.connect(context.destination);nodes.push(gain);
  for(const frequency of next==='dial'?[350,440]:[659.25,783.99]){const oscillator=context.createOscillator();oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.start();nodes.push(oscillator);}
  const pulse=()=>{const t=context.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(0.025,t);if(next==='incoming'){gain.gain.setValueAtTime(0,t+0.4);gain.gain.setValueAtTime(0.025,t+0.6);gain.gain.setValueAtTime(0,t+1);}};
  pulse();if(next==='incoming')timer=setTimer(pulse,3000);
 }catch{stop();}}
 return {arm,stop,dial:()=>play('dial'),incoming:()=>play('incoming')};
}
export function setupCallSounds({document,tones=createCallSounds(),canDial=()=>true,busy=()=>false}){
 let panel=null,pendingIncoming=false,enabled=true;
 const input=document.querySelector('#dial').elements.target;
 function update(){if(!enabled)return tones.stop();if(pendingIncoming)return tones.incoming();if(panel==='keypad'&&canDial()&&!busy()&&!input.value.trim())tones.dial();else tones.stop();}
 function arm(){tones.arm();if(pendingIncoming&&enabled)tones.incoming();}
 document.addEventListener('pointerdown',arm);document.addEventListener('keydown',arm);
 input.addEventListener('input',update);
 document.querySelector('#dial').addEventListener('submit',()=>{pendingIncoming=false;tones.stop();},{capture:true});
 const host=document.querySelector('#softphone-tools');if(host){const label=document.createElement('label');label.innerHTML='<input type="checkbox" checked> Dial tone and incoming ringtone';label.querySelector('input').onchange=e=>{enabled=e.target.checked;update();};host.append(label);}
 document.defaultView?.addEventListener('pagehide',()=>{pendingIncoming=false;tones.stop();});
 return {panel(mode){panel=mode;update();},incoming(){pendingIncoming=true;panel=null;update();},stop(){pendingIncoming=false;tones.stop();},refresh:update};
}
