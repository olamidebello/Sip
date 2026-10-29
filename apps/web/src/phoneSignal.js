export function signalQuality({online=true,ready=false,downlink,rtt}={}){
 if(!online)return {bars:0,state:'offline',label:'Phone offline'};
 if(!ready)return {bars:0,state:'connecting',label:'Phone connecting'};
 const speed=Number.isFinite(downlink)&&downlink>0?downlink:null;
 const latency=Number.isFinite(rtt)&&rtt>0?rtt:null;
 if(speed===null&&latency===null)return {bars:0,state:'unknown',label:'Phone ready · network quality unavailable'};
 let bars=speed===null?4:speed>=5?4:speed>=1.5?3:speed>=0.5?2:1;
 if(latency!==null)bars=Math.min(bars,latency>=1000?1:latency>=500?2:latency>=200?3:4);
 return {bars,state:'ready',label:`Phone ready · ${bars} of 4 bars · estimated network quality`};
}
export function phoneStatusText(message){
 if(/^(Registered|Waiting for SIP registration.*|SIP registration lost.*|Connecting your SIP account.*)$/i.test(message))return '';
 return String(message).replace(/SIP registration/gi,'Phone connection').replace(/\bSIP\b/g,'Phone');
}
export function setupPhoneSignal({document,isReady}){
 const win=document.defaultView,network=win.navigator.connection;
 function refresh(){const node=document.getElementById('communication-status');if(!node)return;const quality=signalQuality({online:win.navigator.onLine,ready:isReady(),downlink:network?.downlink,rtt:network?.rtt});node.className='communication-status phone-signal';node.dataset.state=quality.state;node.setAttribute('aria-label',quality.label);node.title=quality.label;node.replaceChildren();const phone=document.createElement('span');phone.textContent='☎';phone.setAttribute('aria-hidden','true');node.append(phone);const bars=document.createElement('span');bars.className='phone-signal-bars';bars.setAttribute('aria-hidden','true');for(let i=1;i<=4;i++){const bar=document.createElement('i');bar.style.height=(4+i*4)+'px';bar.className=i<=quality.bars?'filled':'';bars.append(bar);}node.append(bars);}
 win.addEventListener('online',refresh);win.addEventListener('offline',refresh);network?.addEventListener?.('change',refresh);
 const timer=win.setInterval(refresh,5000);refresh();return {refresh,dispose(){win.clearInterval(timer);win.removeEventListener('online',refresh);win.removeEventListener('offline',refresh);network?.removeEventListener?.('change',refresh);}};
}
