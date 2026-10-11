export function createNativePushClient({request,onStatus}){
 let token=null,generation=0,tokenListener;
 const plugin=()=>window.Capacitor?.Plugins?.NativePush;
 return {
  async start(){const native=plugin();if(!native)return;const current=++generation;try{if(native.addListener&&!tokenListener)tokenListener=await native.addListener('tokenChanged',()=>{void this.start();});const result=await native.getToken();if(current!==generation)return;await request('/api/native-push/device',{token:result.token,platform:result.platform||'android'});if(current!==generation){await request('/api/native-push/device',{token:result.token,platform:result.platform||'android'},'DELETE').catch(()=>{});return;}token=result.token;await native.setEnabled({enabled:true});if(current!==generation)await native.setEnabled({enabled:false});}catch(error){onStatus('Background calls: '+error.message);}},
  async stop(){generation++;if(tokenListener){await tokenListener.remove();tokenListener=null;}const native=plugin();if(native)await native.setEnabled({enabled:false}).catch(()=>{});if(token){const old=token;token=null;await request('/api/native-push/device',{token:old},'DELETE').catch(()=>{});}}
 };
}
