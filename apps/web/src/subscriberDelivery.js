export function setupSubscriberDelivery({request,isRegistered}){
 let timer,active=false;
 async function beat(){if(active)await request('/api/account/subscriber-registration',{registered:!!isRegistered()}).catch(()=>{});}
 return {wake:beat,async start(){active=true;clearInterval(timer);await beat();timer=setInterval(beat,30000);},stop(){active=false;clearInterval(timer);}};
}
