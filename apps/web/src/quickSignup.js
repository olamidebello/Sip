export function setupQuickSignup({document,get,request,getUserId}){
 const signup=document.getElementById('signup'),account=document.getElementById('account');
 if(!signup||!account)return {};
 const box=document.createElement('details');
 box.innerHTML=`<summary>Quick signup by SMS</summary>
 <p>Choose your login, then text the code from the phone you want to verify. Your phone number comes from the received SMS. Only text a code you generated here yourself.</p>
 <form><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
 <label>Password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required></label>
 <label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label>
 <label>Account PIN (if required)<input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{6,8}"></label>
 <input name="captchaId" type="hidden"><img alt="Enter the six CAPTCHA digits" width="240" height="76">
 <button type="button" data-captcha>New CAPTCHA</button><label>CAPTCHA digits<input name="captchaAnswer" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label>
 <button type="submit">Get my SMS signup code</button></form>
 <section hidden data-instructions><p>Text this exact message to <strong data-number></strong> within ten minutes:</p><p><strong data-message></strong></p><a data-sms>Open SMS app</a><p>Keep this page open. Your carrier may charge for the text. No outbound verification SMS is needed.</p><button type="button" data-check>Check verification</button></section><p role="status" aria-live="polite"></p>`;
 signup.before(box);
 const form=box.querySelector('form'),notice=box.querySelector('[role=status]'),instructions=box.querySelector('[data-instructions]');
 let pending=null,poll=null,checking=false,generation=0;
 function clear(){pending=null;clearInterval(poll);poll=null;try{document.defaultView.sessionStorage.removeItem('olamide-quick-signup');}catch{}}
 function remember(){try{document.defaultView.sessionStorage.setItem('olamide-quick-signup',JSON.stringify(pending));}catch{}}
 async function captcha(){const n=++generation,b=box.querySelector('[data-captcha]');b.disabled=true;form.elements.captchaId.value='';form.elements.captchaAnswer.value='';try{const c=await get('/api/register/captcha');if(n!==generation)return;form.elements.captchaId.value=c.captchaId;box.querySelector('img').src=c.image;}catch(e){notice.textContent=e.message;}finally{if(n===generation)b.disabled=false;}}
 box.querySelector('[data-captcha]').onclick=captcha;
 box.addEventListener('toggle',()=>{if(box.open&&!pending&&!form.elements.captchaId.value)void captcha();});
 function display(){instructions.hidden=false;form.hidden=true;box.open=true;box.querySelector('[data-number]').textContent=pending.number;box.querySelector('[data-message]').textContent=pending.message;box.querySelector('[data-sms]').href=`sms:${pending.number}?body=${encodeURIComponent(pending.message)}`;clearInterval(poll);poll=setInterval(()=>void check(),8000);}
 async function check(){
  if(!pending||checking)return;
  if(Date.now()>=pending.expires){clear();form.hidden=false;instructions.hidden=true;notice.textContent='Code expired. Start again.';void captcha();return;}
  checking=true;
  try{
   const r=await request('/api/register/quick/status',{token:pending.token});
   if(r.state==='verified'){
    document.getElementById('login').elements.email.value=pending.email;clear();instructions.hidden=true;
    notice.textContent='Phone verified. Your account is created. Sign in with your email and password, then complete your profile. SIP connection status is shown after sign-in.';
   }else if(r.state==='unavailable'){clear();form.hidden=false;instructions.hidden=true;notice.textContent='Signup could not be completed. Use sign-in or account recovery if you already have an account.';void captcha();}
   else notice.textContent='Waiting for your text. Verification completes when the carrier delivers it.';
  }catch(e){notice.textContent=e.message;}finally{checking=false;}
 }
 box.querySelector('[data-check]').onclick=check;
 form.onsubmit=async e=>{
  e.preventDefault();if(pending)return;
  if(form.elements.password.value!==form.elements.confirmPassword.value){notice.textContent='Passwords must match';return;}
  const b=form.querySelector('[type=submit]');b.disabled=true;
  try{const input=Object.fromEntries(new document.defaultView.FormData(form)),r=await request('/api/register/quick/start',input);pending={...r,email:input.email,expires:Date.now()+r.expiresInSeconds*1000};form.reset();remember();display();notice.textContent='Send the displayed code from your own phone.';}
  catch(e){notice.textContent=e.message;void captcha();}finally{b.disabled=false;}
 };
 try{const p=JSON.parse(document.defaultView.sessionStorage.getItem('olamide-quick-signup')||'null');if(p&&/^[a-f0-9]{64}$/.test(p.token||'')&&p.expires>Date.now()){pending=p;display();void check();}}catch{}
 const profile=document.createElement('section');profile.hidden=true;
 profile.innerHTML='<h3>Complete your profile</h3><p>Your phone is verified. Add your name and address to finish setting up your account.</p><form><label>Full name<input name="name" minlength="2" maxlength="100" required></label><label>Address<input name="address1" maxlength="160" required></label><label>Address line 2<input name="address2" maxlength="160"></label><label>City<input name="city" maxlength="100" required></label><label>State or region<input name="region" maxlength="100" required></label><label>Postal code<input name="postalCode" maxlength="32" required></label><label>Country code<input name="country" placeholder="US or NG" pattern="[A-Z]{2}" maxlength="2" required></label><button>Save profile</button><p role="status"></p></form>';
 account.prepend(profile);
 async function refreshProfile(){const owner=getUserId();profile.hidden=true;profile.querySelector('form').reset();if(!owner)return;try{const r=await get('/api/account/quick-profile');if(owner!==getUserId())return;profile.hidden=!r.required;}catch{}}
 profile.querySelector('form').onsubmit=async e=>{e.preventDefault();const owner=getUserId(),f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{await request('/api/account/quick-profile',Object.fromEntries(new document.defaultView.FormData(f)),'PUT');if(owner===getUserId()){profile.hidden=true;f.reset();}}catch(e){if(owner===getUserId())f.querySelector('[role=status]').textContent=e.message;}finally{b.disabled=false;}};
 return {refreshProfile};
}
