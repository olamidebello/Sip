export function profilePayload(form){
 const keys=['displayName','phone','address1','address2','city','region','postalCode','country'];
 const b=Object.fromEntries(keys.map(k=>[k,form.elements[k].value.trim()]));b.country=b.country.toUpperCase();
 const limits={displayName:100,phone:16,address1:160,address2:160,city:100,region:100,postalCode:32,country:2};
 if(keys.some(k=>b[k].length>limits[k])||!b.displayName||!/^\+[1-9][0-9]{7,14}$/.test(b.phone)||!b.address1||!b.city||!b.region||!b.postalCode||!/^[A-Z]{2}$/.test(b.country))throw Error('Complete name, international phone, address, city, region, postal code and two-letter country are required.');
 return b;
}
export function setupUserProvisionControls({document,parent,get,request,isSuper,onChanged}){
 const root=document.createElement('div');root.dataset.userProvisionControls='true';
 root.innerHTML=`<h4>Selected user management</h4><p data-overview>Select a user above.</p>
 <details><summary>1. Profile and address</summary><form data-profile-form>
 <label>Name <input name="displayName" maxlength="100" required></label><label>Profile phone <input name="phone" type="tel" maxlength="16" placeholder="+19452205026" required></label>
 <label>Address line 1 <input name="address1" maxlength="160" required></label><label>Address line 2 <input name="address2" maxlength="160"></label>
 <label>City <input name="city" maxlength="100" required></label><label>Region/state <input name="region" maxlength="100" required></label>
 <label>Postal code <input name="postalCode" maxlength="32" required></label><label>Country code <input name="country" maxlength="2" placeholder="NG / US" required></label>
 <button>Save user profile</button><button type="button" data-reset>Reset profile form</button><p>Changing the phone number does not authorize the replacement as caller ID. Review and authorize it separately.</p></form></details>
 <details><summary>2. Subscription and plan</summary><label>Active tenant plan <select data-plan></select></label><button type="button" data-plans>Refresh plans</button>
 <label>Subscription status <select data-subscription-status><option value="pending_payment">Pending payment</option><option value="active">Active</option><option value="cancelled">Cancelled</option></select></label>
 <button type="button" data-subscription-save>Save subscription</button><p>Activating a subscription grants service access; it does not record receipt of payment.</p></details>
 <details><summary>3. Trial calling allowance</summary><label>Remaining seconds (0–3600) <input data-seconds type="number" min="0" max="3600" step="1"></label>
 <label>Adjustment reason <textarea data-reason maxlength="255"></textarea></label><button type="button" data-allowance-save>Set remaining allowance</button><p>Sets the remaining seconds. Pending calls must settle before an adjustment.</p></details>
 <details><summary>4. SIP provisioning</summary><p data-sip>Provisioning queues the existing SIP account setup worker. A queued request is not confirmation of registration.</p><button type="button" data-provision>Queue / retry SIP provisioning</button></details>
 <p data-management-status role="status"></p>`;
 parent.append(root);const $=s=>root.querySelector(s),form=$('[data-profile-form]'),status=$('[data-management-status]');let user=null,version=0,busy=false,plans=[];
 function buttons(){for(const el of root.querySelectorAll('input,textarea,select,button'))el.disabled=!user||busy;}
 function fill(){if(!user)return;const fields={displayName:user.display_name,phone:user.phone_e164,address1:user.address_line1,address2:user.address_line2,city:user.city,region:user.region,postalCode:user.postal_code,country:user.country};for(const [k,v]of Object.entries(fields))form.elements[k].value=v||'';$('[data-seconds]').value=Number(user.remaining_seconds||0);$('[data-reason]').value='';$('[data-subscription-status]').value=user.subscription_status||'pending_payment';$('[data-overview]').textContent=`${user.display_name||user.email} · ${user.email} · Account: ${user.status||'unknown'} · SIP: ${user.sip_status||'not provisioned'} · Subscription: ${user.subscription_status||'none'} · Remaining trial: ${Number(user.remaining_seconds||0)} seconds`;renderPlans();}
 function renderPlans(){const list=$('[data-plan]');list.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Select active tenant plan';list.append(empty);for(const p of plans){const option=document.createElement('option');option.value=p.id;option.textContent=`${p.name} · ${(Number(p.monthly_cents)/100).toFixed(2)} USD/month`;list.append(option);}if(user?.plan_id)list.value=user.plan_id;}
 async function loadPlans(){const token=version;try{const data=await get('/api/plans');if(token!==version||!isSuper())return;plans=data.plans||[];renderPlans();}catch(e){if(token===version)status.textContent=e.message;}}
 async function write(action,payload,method,label){if(!user||busy||!isSuper())return;const target=user,token=version;if(!document.defaultView.confirm(`${label} for ${target.email}?`))return;busy=true;buttons();
 try{const result=await request('/api/admin/platform-control/users/'+encodeURIComponent(target.id)+'/'+action,payload,method);if(token!==version||!isSuper())return;await onChanged();if(isSuper())status.textContent=action==='provision'?'SIP provisioning queued. Refresh user status after the worker runs.':`${label} saved.`;return result;}catch(e){if(token===version)status.textContent=e.message;}finally{busy=false;buttons();}}
 form.onsubmit=async event=>{event.preventDefault();try{await write('profile',profilePayload(form),'PUT','Save profile');}catch(e){status.textContent=e.message;}};
 $('[data-reset]').onclick=()=>{fill();status.textContent='Profile form reset.';};$('[data-plans]').onclick=loadPlans;
 $('[data-subscription-save]').onclick=()=>{const planId=$('[data-plan]').value,state=$('[data-subscription-status]').value;if(!plans.some(p=>p.id===planId)){status.textContent='Select an active tenant plan.';return;}void write('subscription',{planId,status:state},'PUT','Set subscription to '+state);};
 $('[data-allowance-save]').onclick=()=>{const raw=$('[data-seconds]').value,seconds=Number(raw),reason=$('[data-reason]').value.trim();if(!raw||!Number.isInteger(seconds)||seconds<0||seconds>3600||!reason){status.textContent='Enter 0–3600 whole seconds and an adjustment reason.';return;}void write('allowance',{remainingSeconds:seconds,reason},'PUT','Set remaining allowance to '+seconds+' seconds');};
 $('[data-provision]').onclick=()=>write('provision',{},'POST','Queue SIP provisioning');buttons();
 return {setUser(value){version++;user=value;status.textContent='';fill();buttons();void loadPlans();},clear(){version++;user=null;form.reset();$('[data-seconds]').value='';$('[data-reason]').value='';$('[data-overview]').textContent='Select a user above.';status.textContent='';plans=[];renderPlans();buttons();}};
}
