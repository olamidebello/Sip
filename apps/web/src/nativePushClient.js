export function createNativePushClient({request,onStatus,plugin:provided}){
 let token=null,generation=0,tokenListener,inFlight=null;
 const plugin=provided||(()=>window.Capacitor?.Plugins?.NativePush);
 const client={
  start(){
   if(inFlight)return inFlight;
   const native=plugin();if(!native)return Promise.resolve();const current=generation;
   inFlight=(async()=>{try{
    if(native.addListener&&!tokenListener)tokenListener=await native.addListener('tokenChanged',()=>{void client.start();});
    const result=await native.getToken();if(current!==generation)return;
    await request('/api/native-push/device',{token:result.token,platform:result.platform||'android'});
    if(current!==generation){await request('/api/native-push/device',{token:result.token,platform:result.platform||'android'},'DELETE').catch(()=>{});return;}
    token=result.token;await native.setEnabled({enabled:true});
    if(current!==generation)await native.setEnabled({enabled:false});
    else onStatus('Background call device registered. Notification and battery settings still apply.');
   }catch(error){if(current===generation)onStatus('Background calls: '+error.message);}finally{inFlight=null;}})();return inFlight;
  },
  async stop(){generation++;if(tokenListener){await tokenListener.remove();tokenListener=null;}const native=plugin();if(native)await native.setEnabled({enabled:false}).catch(()=>{});if(token){const old=token;token=null;await request('/api/native-push/device',{token:old},'DELETE').catch(()=>{});}}
 };
 return client;
}
