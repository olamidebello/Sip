export function createRingback({makeContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),setTimer=setInterval,clearTimer=clearInterval}={}){
 let context,nodes=[],timer;
 function arm(){try{context??=makeContext();if(context.state==='suspended')void context.resume().catch(()=>{});}catch{/* Audio unavailable: calls still work. */}}
 function stop(){
  if(timer!==undefined){clearTimer(timer);timer=undefined;}
  for(const node of nodes){try{node.stop?.();node.disconnect();}catch{}}
  nodes=[];
 }
 function start(){
  if(nodes.length)return;
  arm();if(!context)return;
  try{
   const gain=context.createGain();gain.connect(context.destination);nodes.push(gain);
   for(const frequency of [440,480]){const oscillator=context.createOscillator();oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.start();nodes.push(oscillator);}
   const pulse=()=>{const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(0.035,now);gain.gain.setValueAtTime(0,now+2);};
   pulse();timer=setTimer(pulse,6000);
  }catch{stop();}
 }
 return {arm,start,stop};
}
