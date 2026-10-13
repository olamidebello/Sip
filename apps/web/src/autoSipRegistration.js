export function createAutoSipRegistration({session,connect,disconnect,connected,onStatus,setTimer=setTimeout,clearTimer=clearTimeout}){
  let owner=null,generation=0,timer=null,busy=false,attempt=0,notBefore=0;
  function schedule(delay){clearTimer(timer);if(owner){timer=setTimer(tick,delay);timer?.unref?.();}}
  async function tick(){
    if(!owner||busy)return;
    if(Date.now()<notBefore){schedule(notBefore-Date.now());return;}
    busy=true;const current=generation;
    try{
      const account=await session();
      if(current!==generation)return;
      if(account.status!=='active'){onStatus(account.note||'SIP activation pending');schedule(30000);return;}
      if(!connected()){
        onStatus('Connecting your SIP account…');
        await connect(account,()=>current===generation&&!!owner);
        if(current!==generation)return;
      }
      if(!connected()){onStatus('Waiting for SIP registration…');schedule(5000);return;}
      attempt=0;onStatus('SIP connected. Ready for calls.');schedule(60000);
    }catch(error){
      if(current!==generation)return;
      if(error.status===401||error.status===403){owner=null;generation++;clearTimer(timer);await disconnect();onStatus('SIP disconnected: '+error.message);return;}
      if(error.status===429){const delay=Math.max(60000,Math.min(300000,Number(error.retryAfter||60)*1000));notBefore=Date.now()+delay;onStatus('SIP reconnect paused by rate limit. Retrying in '+Math.ceil(delay/1000)+' seconds.');schedule(delay);return;}
      onStatus('SIP reconnect pending: '+error.message);schedule(Math.min(60000,3000*2**Math.min(attempt++,5)));
    }finally{busy=false;if(current!==generation&&owner)schedule(0);}
  }
  return {
    start(id){if(owner===id)return;owner=id;generation++;attempt=0;notBefore=0;schedule(0);},
    async stop(){owner=null;generation++;notBefore=0;clearTimer(timer);await disconnect();},
    wake(){if(owner&&!busy)schedule(0);},
    dropped(){if(owner)schedule(3000);}
  };
}
