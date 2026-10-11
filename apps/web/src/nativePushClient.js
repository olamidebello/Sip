export function createNativePushClient({request,onStatus}){
 let token=null,generation=0;
 const plugin=()=>window.Capacitor?.Plugins?.NativePush;
 return {
  async start(){const native=plugin();if(!native)return;const current=++generation;try{const result=await native.getToken();if(current!==generation)return;await request('/api/native-push/device',{token:result.token});if(current!==generation){await request('/api/native-push/device',{token:result.token},'DELETE').catch(()=>{});return;}token=result.token;await native.setEnabled({enabled:true});if(current!==generation)await native.setEnabled({enabled:false});}catch(error){onStatus('Background calls: '+error.message);}},
  async stop(){generation++;const native=plugin();if(native)await native.setEnabled({enabled:false}).catch(()=>{});if(token){const old=token;token=null;await request('/api/native-push/device',{token:old},'DELETE').catch(()=>{});}}
 };
}
