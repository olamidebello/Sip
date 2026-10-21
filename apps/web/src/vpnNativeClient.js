// The platform supplies each account's private setup only after authentication.
export function createVpnNativeClient({plugin,getConfig,onStatus=()=>{}}){
 let owner=null,generation=0;
 return {
  available:()=>!!plugin(),
  async login(userId){const p=plugin();if(!p||owner===userId)return;owner=userId;const seq=++generation;try{const r=await getConfig();if(seq!==generation)return;await p.connect({userId,config:r.config});if(seq===generation)onStatus('VPN started on this device. Confirm a recent server handshake for connectivity.');}catch(e){if(seq===generation)onStatus(e.message||'VPN could not connect');}},
  async logout(){const p=plugin();owner=null;generation++;if(p)await p.disconnect();},
  retry(userId){owner=null;return this.login(userId);}
 };
}
