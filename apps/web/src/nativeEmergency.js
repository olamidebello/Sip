import patterns from './emergencyPatterns.json' with {type:'json'};
// Recognize catalogued emergency numbers before ordinary SIP/extension routing.
// This catalog is a recognition aid, not proof of service availability in a location.
const emergency=new RegExp('^(?:'+patterns.join('|')+')$');
export function emergencyDialNumber(value){
 const raw=String(value||'').trim();
 // Explicit SIP identities remain explicit SIP calls. Plain keypad numbers only.
 if(/^sips?:/i.test(raw))return null;
 const number=raw.replace(/[\s().-]/g,'');
 return /^\d{1,6}$/.test(number)&&emergency.test(number)?number:null;
}
export function setupNativeEmergency({document,form,input,openNative=uri=>document.defaultView.location.assign(uri)}){
 let panel;
 const onSubmit=event=>{
  const number=emergencyDialNumber(input.dataset.routeTarget||input.value);
  if(!number)return;
  event.preventDefault();event.stopImmediatePropagation();
  panel?.remove();
  panel=document.createElement('section');panel.setAttribute('role','alert');panel.tabIndex=-1;
  panel.style.cssText='position:fixed;inset:8% 5% auto;max-height:80vh;overflow:auto;z-index:2147483647;background:#10232e;color:white;padding:24px;border:2px solid #21c976;border-radius:16px;box-shadow:0 4px 40px #000';
  const heading=document.createElement('h2');heading.textContent='Emergency call — '+number;
  const info=document.createElement('p');info.textContent='Continue in your phone’s native dialer. This website cannot confirm that the dialer opened or that a call connected. If it does not open, use your phone’s Emergency Call screen. Availability of this number depends on your location.';
  const call=document.createElement('a');call.href='tel:'+number;call.textContent='Open phone dialer: '+number;call.style.cssText='display:block;padding:16px;background:#21c976;color:#001b10;font-weight:bold;border-radius:10px';
  const location=document.createElement('button');location.type='button';location.textContent='Find nearby services using my location';
  const result=document.createElement('p');result.setAttribute('role','status');
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>panel.remove();
  location.onclick=()=>{
   const geo=document.defaultView.navigator.geolocation;
   if(!geo){result.textContent='Location unavailable. Use the native emergency dialer.';return;}
   location.disabled=true;result.textContent='Finding current location…';
   geo.getCurrentPosition(position=>{
    location.disabled=false;
    const {latitude,longitude}=position.coords;
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){result.textContent='Location unavailable.';return;}
    const link=document.createElement('a');link.target='_blank';link.rel='noopener noreferrer';
    link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('emergency services near '+latitude+','+longitude);
    link.textContent='View nearby services on Google Maps';
    result.replaceChildren(link,document.createTextNode(' — Map listings are not emergency dispatch routes. Your coordinates are shared with Google only when you open this link.'));
   },()=>{location.disabled=false;result.textContent='Location unavailable. You can still open your phone dialer.';},{enableHighAccuracy:true,maximumAge:0,timeout:5000});
  };
  panel.append(heading,info,call,location,result,close);document.body.append(panel);panel.focus();
  // Request the native handler synchronously from the user's Call gesture.
  try{openNative('tel:'+number);}catch{/* Keep the explicit native-dialer link available. */}
 };
 form.addEventListener('submit',onSubmit,true);
 return {destroy(){form.removeEventListener('submit',onSubmit,true);panel?.remove();}};
}
