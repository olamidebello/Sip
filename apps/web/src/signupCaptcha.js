export function setupSignupCaptcha({document,get,now=Date.now}){
 const form=document.getElementById('signup'),image=document.getElementById('signup-captcha-image'),refreshButton=document.getElementById('signup-captcha-refresh'),submit=form.querySelector('button:last-child'),status=document.getElementById('account-status');let generation=0,expires=0,loading=false;

 const localStatus=document.getElementById('signup-status');
 if(localStatus){
  const observer=new document.defaultView.MutationObserver(()=>{localStatus.textContent=status.textContent;});
  observer.observe(status,{childList:true,characterData:true,subtree:true});
  form.addEventListener('invalid',event=>{
   const field=event.target;
   status.textContent=(field.labels?.[0]?.textContent.trim()||field.name)+': '+field.validationMessage;

  },true);
 }
 function ready(){return !loading&&!!form.elements.captchaId.value&&now()<expires;}
 async function refresh(){const current=++generation;loading=true;expires=0;form.elements.captchaId.value='';form.elements.captchaAnswer.value='';image.removeAttribute('src');refreshButton.disabled=true;submit.disabled=true;status.textContent='Loading CAPTCHA…';try{const result=await get('/api/register/captcha');if(current!==generation)return;if(!/^[0-9a-f-]{36}$/i.test(result.captchaId||'')||!/^data:image\/png;base64,/.test(result.image||'')||!Number.isFinite(result.expiresInSeconds)||result.expiresInSeconds<=0)throw Error('CAPTCHA challenge unavailable. Tap New CAPTCHA to retry.');image.src=result.image;form.elements.captchaId.value=result.captchaId;expires=now()+Math.min(result.expiresInSeconds,300)*1000;status.textContent='Enter the six digits shown. CAPTCHA expires in five minutes.';}catch(e){if(current===generation)status.textContent=e.message;}finally{if(current===generation){loading=false;refreshButton.disabled=false;submit.disabled=!ready();}}}
 function ensure(){if(!ready()&&!loading)void refresh();}
 document.addEventListener('click',event=>{if(event.target.closest('a[href="/pages/signup"]'))ensure();});
 form.addEventListener('focusin',ensure);refreshButton.onclick=refresh;const onPage=()=>{if(document.defaultView.location.pathname.endsWith('/pages/signup'))ensure();};document.defaultView.addEventListener('popstate',onPage);document.defaultView.addEventListener('pageshow',onPage);image.onerror=()=>{expires=0;form.elements.captchaId.value='';submit.disabled=true;status.textContent='CAPTCHA image could not load. Tap New CAPTCHA to retry.';};
 return {refresh,ready,ensure};
}
