export function createSessionWatch({check,onRevoked,window,interval=5000}){
  let timer=null,generation=0,busy=false;
  async function verify(){
    if(!timer||busy)return;busy=true;const version=generation;
    try{const active=await check();if(version===generation&&!active){stop();await onRevoked();}}catch{/* Network outages do not prove session revocation. */}finally{busy=false;}
  }
  function stop(){generation++;clearInterval(timer);timer=null;}
  window.addEventListener('focus',verify);
  window.document.addEventListener('visibilitychange',()=>{if(window.document.visibilityState==='visible')void verify();});
  return {start(){stop();timer=setInterval(verify,interval);timer.unref?.();},stop,verify};
}
