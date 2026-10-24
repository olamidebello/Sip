export function setupSignupCaptcha({document,get,now=Date.now}){
 const form=document.getElementById('signup'),status=document.getElementById('account-status');let pending=null,expires=0,validAfter=0;
 function ready(){return !pending&&!!form.elements.captchaId.value&&now()>=validAfter&&now()<expires;}
 async function refresh(){
  if(pending)return pending;
  expires=0;form.elements.captchaId.value='';form.elements.captchaAnswer.value='';
  pending=(async()=>{try{
   const result=await get('/api/register/captcha');
   if(!/^[a-f0-9-]{36}$/i.test(result.captchaId||'')||!(/^[a-f0-9]{64}$/).test(result.formToken||''))throw Error('Signup protection unavailable. Try again shortly.');
   form.elements.captchaId.value=result.captchaId;form.elements.captchaAnswer.value=result.formToken;
   expires=now()+Math.min(Number(result.expiresInSeconds)||300,300)*1000;
   validAfter=now()+Math.max(1000,Number(result.minimumWaitMs)||1000);
   await new Promise(resolve=>document.defaultView.setTimeout(resolve,1100));
  }catch(e){status.textContent=e.message;}finally{pending=null;}})();return pending;
 }
 function ensure(){if(!ready()&&!pending)void refresh();}
 const local=document.getElementById('signup-status');
 if(local)new document.defaultView.MutationObserver(()=>{local.textContent=status.textContent;}).observe(status,{childList:true,characterData:true,subtree:true});
 form.addEventListener('focusin',ensure);
 form.addEventListener('invalid',e=>{status.textContent=(e.target.labels?.[0]?.textContent.trim()||e.target.name)+': '+e.target.validationMessage;},true);
 document.addEventListener('click',e=>{if(e.target.closest('a[href="/pages/signup"]'))ensure();});
 document.defaultView.addEventListener('pageshow',()=>{if(document.defaultView.location.pathname.endsWith('/pages/signup'))ensure();});
 document.defaultView.addEventListener('popstate',()=>{if(document.defaultView.location.pathname.endsWith('/pages/signup'))ensure();});
 return {refresh,ready,ensure};
}
