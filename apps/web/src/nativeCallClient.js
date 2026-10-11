// Match native actions to the exact SIP dialog; never answer a different call.
export function createNativeCallClient({plugin,wake,currentCall,answer,end,onError,now=Date.now}) {
 const pending=new Map();let listeners=[];
 async function action(event){
  if(typeof event.callId!=='string'||!['wake','answer','end'].includes(event.action))return;
  wake();if(event.action==='wake')return;
  const current=currentCall();
  if(current?.callId!==event.callId){pending.set(event.callId,{action:event.action,expires:now()+15000});return;}
  try{if(event.action==='answer')await answer();else await end();}catch(error){await plugin()?.completeCall?.({callId:event.callId,active:false});onError(error);}
 }
 async function drain(){try{const data=await plugin()?.drainActions?.();for(const event of data?.events||[])await action(event);}catch(error){onError(error);}}
 return {
  async start(){const native=plugin();if(!native?.drainActions||listeners.length)return;listeners.push(await native.addListener('callAction',drain));await drain();},
  async incoming(callId){if(!callId)return;const native=plugin();if(!native?.reportIncoming)return;await native.reportIncoming({callId});await drain();const event=pending.get(callId);pending.delete(callId);if(event&&event.expires>now())await action({callId,action:event.action});for(const [id,item] of pending)if(item.expires<=now())pending.delete(id);},
  async connected(callId){if(callId)await plugin()?.completeCall?.({callId,active:true});},
  async ended(callId){if(callId){pending.delete(callId);await plugin()?.completeCall?.({callId,active:false});}},
  async stop(){pending.clear();for(const listener of listeners)await listener.remove();listeners=[];}
 };
}
