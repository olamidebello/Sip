// SimpleUser.register resolves when the request is sent, not when it is accepted.
export function waitForSipRegistration(phone,{timeoutMs=20000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimer(timer);error?reject(error):resolve();};
  const timer=setTimer(()=>finish(new Error('SIP registration timed out: the switch did not accept REGISTER')),timeoutMs);
  const refused=response=>{const code=Number(response?.message?.statusCode)||0;const labels={401:'credentials or SIP realm not accepted',403:'account denied by switch policy',404:'SIP account or domain not found',423:'registration interval rejected',500:'switch internal error',503:'switch temporarily unavailable'};finish(new Error(`SIP registration rejected (${code||'unknown'}): ${labels[code]||'switch refused REGISTER'}`));};
  try{Promise.resolve(phone.register({requestDelegate:{onAccept:()=>finish(),onReject:refused,onRedirect:refused}})).catch(finish);}catch(error){finish(error);}
 });
}
