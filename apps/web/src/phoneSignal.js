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
export function signalDetails({online=true,ready=false,downlink,rtt}={}){
 const status=!online?'Offline':ready?'Connected for calls':'Connecting for calls';
 const speed=online&&Number.isFinite(downlink)&&downlink>0?`Estimated download: ${downlink.toLocaleString(undefined,{maximumFractionDigits:2})} Mbps`:'Download speed unavailable';
 const latency=online&&Number.isFinite(rtt)&&rtt>0?`Estimated latency: ${Math.round(rtt)} ms`:'Latency unavailable';
 return `${status} · ${speed} · ${latency}`;
}
export function setupPhoneSignal({document,isReady}){
 const win=document.defaultView,network=win.navigator.connection;
 function refresh(){const node=document.getElementById('communication-status');if(!node)return;const quality=signalQuality({online:win.navigator.onLine,ready:isReady(),downlink:network?.downlink,rtt:network?.rtt});node.className='communication-status phone-signal';node.dataset.state=quality.state;node.setAttribute('aria-label',quality.label);node.removeAttribute('title');const details=signalDetails({online:win.navigator.onLine,ready:isReady(),downlink:network?.downlink,rtt:network?.rtt});node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label',details);node.setAttribute('aria-describedby','phone-signal-details');node.setAttribute('aria-expanded',String(node.dataset.open==='true'));const place=()=>{const tip=node.querySelector('.phone-signal-tooltip');if(!tip)return;const rect=node.getBoundingClientRect();tip.style.left=Math.max(16,Math.min(rect.left,win.innerWidth-296))+'px';tip.style.top=Math.max(8,Math.min(rect.bottom+8,win.innerHeight-130))+'px';};node.onpointerenter=place;node.onfocus=place;node.onclick=()=>{place();const open=node.dataset.open!=='true';node.dataset.open=String(open);node.setAttribute('aria-expanded',String(open));};node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.click();}if(event.key==='Escape'){node.dataset.open='false';node.setAttribute('aria-expanded','false');node.blur();}};node.replaceChildren();const phone=document.createElement('span');phone.textContent='☎';phone.setAttribute('aria-hidden','true');node.append(phone);const bars=document.createElement('span');bars.className='phone-signal-bars';bars.setAttribute('aria-hidden','true');for(let i=1;i<=4;i++){const bar=document.createElement('i');bar.style.height=(4+i*4)+'px';bar.className=i<=quality.bars?'filled':'';bars.append(bar);}node.append(bars);const tip=document.createElement('span');tip.id='phone-signal-details';tip.className='phone-signal-tooltip';tip.setAttribute('role','tooltip');tip.textContent=details;node.append(tip);place();}
 function dismiss(event){const node=document.getElementById('communication-status');if(node&&(!event||event.type==='blur'||!node.contains(event.target))){node.dataset.open='false';node.setAttribute('aria-expanded','false');}}
 document.addEventListener('pointerdown',dismiss);win.addEventListener('blur',dismiss);
 win.addEventListener('online',refresh);win.addEventListener('offline',refresh);network?.addEventListener?.('change',refresh);
 const timer=win.setInterval(refresh,5000);refresh();return {refresh,dispose(){document.removeEventListener('pointerdown',dismiss);win.removeEventListener('blur',dismiss);win.clearInterval(timer);win.removeEventListener('online',refresh);win.removeEventListener('offline',refresh);network?.removeEventListener?.('change',refresh);}};
}
