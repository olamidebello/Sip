export function createLocationMonitor({get,post,geolocation=globalThis.navigator?.geolocation,onState=()=>{},onDenied=()=>{},interval=setInterval,clear=clearInterval,now=Date.now}){
 let running=false,timer,watch,mode=false,generation=0,busy=false,lastPost=0,last={allowed:false,reason:'Checking location policy'};
 function state(v){last=v;onState(v);if(!v.allowed)onDenied(v);return v;}
 function clearWatch(){if(watch!==undefined){geolocation?.clearWatch(watch);watch=undefined;}}
 async function submit(position,token){
  if(!running||token!==generation)return last;
  const c=position?.coords||{};
  try{const v=await post('/api/location/heartbeat',{source:'gps',latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,timestamp:position?.timestamp||0});if(token===generation){lastPost=now();return state(v);}}
  catch(e){if(token===generation)return state({allowed:false,restricted:true,reason:e.message});}
  return last;
 }
 async function tick(){
  if(!running||busy)return last;busy=true;const token=generation;
  try{
   const p=await get('/api/location/policy');if(token!==generation)return last;
   mode=p.restricted;
   if(!p.restricted){clearWatch();return state({...p,allowed:true,reason:'No geofence restriction'});}
   state({...p,allowed:p.allowed,reason:p.reason||'Location required'});
   if(!p.allowsVpn){clearWatch();const v=await post('/api/location/heartbeat',{source:'ip'});return token===generation?state(v):last;}
   if(!geolocation){await submit(null,token);return state({allowed:false,restricted:true,reason:'Device location is unavailable'});}
   if(watch===undefined)watch=geolocation.watchPosition(position=>{if(!busy&&mode&&now()-lastPost>=5000)void submit(position,generation);},()=>{void submit(null,generation);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
   const position=await new Promise((resolve,reject)=>geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:10000}));
   return await submit(position,token);
  }catch(e){if(token===generation){await submit(null,token);return state({allowed:false,restricted:true,reason:e.message||'Location permission denied or unavailable'});}return last;}
  finally{busy=false;}
 }
 return {start(){if(running)return;running=true;generation++;void tick();timer=interval(()=>void tick(),15000);},stop(){running=false;generation++;clearWatch();if(timer!==undefined)clear(timer);timer=undefined;},async ensure(){if(!running)this.start();if(busy)return {allowed:false,reason:'Location verification in progress; try again shortly'};return tick();},current:()=>last};
}
