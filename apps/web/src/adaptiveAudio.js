export function audioProfile({availableKbps,loss=0,rtt=0,jitter=0}={}){
 if(loss>=0.08||rtt>0.8||jitter>0.08||Number.isFinite(availableKbps)&&availableKbps<45)return {name:'Low bandwidth',bitrate:12000};
 if(loss>=0.03||rtt>0.4||jitter>0.04||Number.isFinite(availableKbps)&&availableKbps<90)return {name:'Balanced voice',bitrate:20000};
 if(Number.isFinite(availableKbps)&&availableKbps>=180&&loss<0.01&&rtt<0.2)return {name:'High quality voice',bitrate:48000};
 return {name:'Clear voice',bitrate:32000};
}
export function codecOrder(codecs,profile){const order=profile?.bitrate<=20000?['audio/opus','audio/pcmu','audio/pcma','audio/g722']:['audio/opus','audio/g722','audio/pcmu','audio/pcma'];return [...codecs].sort((a,b)=>{const rank=c=>{const i=order.indexOf(c.mimeType.toLowerCase());return i<0?99:i;};return rank(a)-rank(b);});}
export function createAdaptiveAudio({onStatus=()=>{},interval=setInterval,clear=clearInterval,capabilities=()=>globalThis.RTCRtpReceiver?.getCapabilities('audio')?.codecs||[],connection=()=>globalThis.navigator?.connection}={}){
 let pc,timer,generation=0,busy=false,current=32000,good=0,last=new Map(),lastParamsError=false;
 function seed(){const c=connection();return audioProfile({availableKbps:Number.isFinite(c?.downlink)?c.downlink*1000:undefined,rtt:Number.isFinite(c?.rtt)?c.rtt/1000:0});}
 function prefer(){if(!pc)return;const codecs=codecOrder(capabilities(),seed());for(const t of pc.getTransceivers()){if(t.receiver?.track?.kind==='audio'&&t.setCodecPreferences&&codecs.length){try{t.setCodecPreferences(codecs);}catch{}}}}
 async function tick(){if(!pc||busy)return;busy=true;const token=generation,p=pc;try{
  const stats=await p.getStats();if(token!==generation)return;let availableKbps,rtt=0,jitter=0,loss=0,codec='Unknown',sendKbps=0;
  for(const s of stats.values()){
   if(s.type==='candidate-pair'&&s.state==='succeeded'&&(s.nominated||s.selected)){if(Number.isFinite(s.availableOutgoingBitrate))availableKbps=s.availableOutgoingBitrate/1000;if(Number.isFinite(s.currentRoundTripTime))rtt=s.currentRoundTripTime;}
   if(s.type==='remote-inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio')){if(Number.isFinite(s.roundTripTime))rtt=Math.max(rtt,s.roundTripTime);if(Number.isFinite(s.fractionLost))loss=Math.max(loss,s.fractionLost);}
   if((s.type==='inbound-rtp'||s.type==='outbound-rtp')&&(s.kind==='audio'||s.mediaType==='audio')){
    if(s.codecId&&s.type==='outbound-rtp')codec=stats.get(s.codecId)?.mimeType||codec;
    if(Number.isFinite(s.jitter))jitter=Math.max(jitter,s.jitter);
    const old=last.get(s.id);last.set(s.id,{time:s.timestamp,lost:s.packetsLost||0,received:s.packetsReceived||0,bytes:s.bytesSent||0});
    if(old){const lost=Math.max(0,(s.packetsLost||0)-old.lost),received=Math.max(0,(s.packetsReceived||0)-old.received);if(lost+received>0)loss=Math.max(loss,lost/(lost+received));if(s.type==='outbound-rtp'&&s.timestamp>old.time)sendKbps+=Math.max(0,(s.bytesSent-old.bytes)*8/(s.timestamp-old.time));}
   }
  }
  const profile=audioProfile({availableKbps,loss,rtt,jitter});let target=profile.bitrate;if(target>current){good++;if(good<3)target=current;}else good=0;
  let mode='Browser managed';
  for(const sender of p.getSenders().filter(s=>s.track?.kind==='audio')){const params=sender.getParameters();const opus=codec.toLowerCase()==='audio/opus';if(!opus){mode=codec==='Unknown'?'Waiting for negotiated codec':'Fixed carrier/browser codec';continue;}if(!params.encodings?.length)continue;for(const e of params.encodings)e.maxBitrate=target;try{await sender.setParameters(params);mode='Adaptive Opus';lastParamsError=false;}catch{mode='Browser managed; bitrate control unavailable';lastParamsError=true;}}
  if(token!==generation)return;current=target;onStatus({mode,profile:profile.name,codec,targetBitrate:target,availableKbps,sendKbps,loss,rtt,jitter,unsupported:lastParamsError});
 }catch(e){if(token===generation)onStatus({mode:'Browser managed; statistics unavailable',error:e.name});}finally{busy=false;}}
 return {prepare(peerConnection){this.stop();pc=peerConnection;current=seed().bitrate;prefer();const original=pc.createOffer.bind(pc);pc.createOffer=(...a)=>{prefer();return original(...a);};const answer=pc.createAnswer.bind(pc);pc.createAnswer=(...a)=>{prefer();return answer(...a);};timer=interval(()=>void tick(),5000);void tick();},stop(){generation++;pc=null;clear(timer);timer=undefined;last.clear();good=0;onStatus({mode:'Ready: automatic audio quality',codec:'Negotiated during call'});},tick};
}
