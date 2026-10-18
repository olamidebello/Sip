export async function renderPlatformControl({document,get,request,isSuperAdmin,show}){
 const anchor=document.querySelector('#admin-plans');if(!anchor)return;
 let panel=document.querySelector('#platform-control-admin');
 if(!isSuperAdmin){panel?.remove();return;}
 if(!panel){
  panel=document.createElement('section');panel.id='platform-control-admin';
  panel.innerHTML=`<h3>Super-admin platform controls</h3>
  <p>Manage users in this tenant. Provider secrets stay write-only.</p>
  <nav><button type="button" data-open="provider-credentials-admin">Carrier API keys</button>
  <button type="button" data-open="wallet-providers-admin">Payment keys</button>
  <button type="button" data-open="carrier-admin">Trunks and provisioning</button>
  <button type="button" data-open="carrier-adapter-admin">Adapter keys and health</button>
  <button type="button" data-open="sip-profile-admin">SIP profile permissions</button><button type="button" data-open="inhouse-admin">DID inventory and assignments</button></nav>
  <p data-key-status></p><label>User <select data-user></select></label><button type="button" data-refresh>Refresh users</button>
  <p data-account></p><div data-security>
   <button type="button" data-action="activate">Activate account</button><button type="button" data-action="suspend">Suspend account</button>
   <button type="button" data-action="promote">Make tenant admin</button><button type="button" data-action="demote">Make standard user</button>
   <button type="button" data-action="revoke_sessions">Revoke sessions</button></div>
  <form data-profile><h4>User profile</h4>
   <label>Name <input name="displayName" maxlength="100" required></label>
   <label>Profile phone <input name="phone" placeholder="+12147489556" required></label>
   <label>Address <input name="address1" maxlength="160" required></label>
   <label>Address line 2 <input name="address2" maxlength="160"></label>
   <label>City <input name="city" maxlength="100" required></label>
   <label>State / region <input name="region" maxlength="100" required></label>
   <label>Postal code <input name="postalCode" maxlength="32" required></label>
   <label>Country code <input name="country" maxlength="2" placeholder="US" required></label>
   <button>Save profile</button></form>
  <form data-cli><h4>Outbound caller ID</h4>
   <label>Number <input name="number" placeholder="+12147489556"></label>
   <label>Authorization reference <input name="evidence" maxlength="255" required></label>
   <label><input name="authorized" type="checkbox"> Authorize this caller ID for Flowroute</label>
   <p>Clearing authorization explicitly blocks this user's external calls. Profile phone changes do not authorize a new caller ID.</p><button>Save caller ID</button></form>
  <form data-subscription><h4>User subscription</h4><label>Plan <select name="planId"></select></label>
   <label>Status <select name="status"><option value="active">Active</option><option value="pending_payment">Pending payment</option><option value="cancelled">Cancelled</option></select></label><button>Save subscription</button></form>
  <form data-allowance><h4>Remaining calling time</h4><label>Seconds remaining <input name="remainingSeconds" type="number" min="0" max="3600" step="1" required></label><label>Reason <input name="reason" maxlength="255" required></label><button>Set remaining time</button></form>
  <button type="button" data-provision>Provision / retry selected SIP account</button>
  <p role="status"></p><h4>Recent administrator activity</h4><ul data-events></ul>`;
  anchor.before(panel);
 }
 const status=panel.querySelector('[role="status"]'),select=panel.querySelector('[data-user]');
 const root='/api/admin/platform-control';let generation=0;
 async function loadSelected(){
  if(!select.value)return;const id=select.value,token=++generation;
  const {user}=await get(root+'/users/'+id);if(token!==generation||select.value!==id)return;
  panel.querySelector('[data-account]').textContent=user.email+' · '+(user.subscription_status||'no subscription');
  const f=panel.querySelector('[data-profile]');
  const fields={displayName:'display_name',phone:'phone_e164',address1:'address_line1',address2:'address_line2',city:'city',region:'region',postalCode:'postal_code',country:'country'};
  for(const [key,col] of Object.entries(fields))f.elements[key].value=user[col]||'';
  const cli=panel.querySelector('[data-cli]');cli.elements.number.value=user.caller_id||user.phone_e164||'';cli.elements.evidence.value=user.evidence||'';cli.elements.authorized.checked=!!Number(user.authorized);
  const sub=panel.querySelector('[data-subscription]');sub.elements.planId.value=user.plan_id||'';sub.elements.status.value=user.subscription_status||'pending_payment';
  panel.querySelector('[data-allowance]').elements.remainingSeconds.value=Number(user.remaining_seconds||0);
 }
 async function refresh(){
  const previous=select.value;const [data,plans]=await Promise.all([get(root),get('/api/admin/plans')]);
  select.replaceChildren();for(const u of data.users){const o=document.createElement('option');o.value=u.id;o.textContent=u.display_name+' — '+u.email+' · SIP '+(u.sip_status||'missing');select.append(o);}
  if([...select.options].some(o=>o.value===previous))select.value=previous;
  const planSelect=panel.querySelector('[data-subscription]').elements.planId;planSelect.replaceChildren();
  for(const p of plans.plans.filter(p=>Number(p.active))){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;planSelect.append(o);}
  panel.querySelector('[data-key-status]').textContent=Object.entries(data.keyStatus).map(([k,v])=>k+': '+(v?'configured':'missing')).join(' · ');
  const events=panel.querySelector('[data-events]');events.replaceChildren();for(const e of data.events){const li=document.createElement('li');li.textContent=e.created_at+' · '+e.action;events.append(li);}
  await loadSelected();
 }
 async function save(form,action,body){
  const id=select.value;if(!id)throw Error('Select a user');const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{await request(root+'/users/'+id+'/'+action,body,'PUT');await refresh();status.textContent='Saved '+action+' for selected user.';}finally{buttons.forEach(b=>b.disabled=false);}
 }
 select.onchange=()=>loadSelected().catch(e=>status.textContent=e.message);
 panel.querySelector('[data-refresh]').onclick=()=>refresh().catch(e=>status.textContent=e.message);
 for(const [attr,action] of [['profile','profile'],['cli','caller-id'],['subscription','subscription'],['allowance','allowance']]){
  const f=panel.querySelector('[data-'+attr+']');f.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(f));if(attr==='cli')b.authorized=f.elements.authorized.checked;if(attr==='allowance')b.remainingSeconds=Number(b.remainingSeconds);if(attr==='profile')b.country=b.country.toUpperCase();try{await save(f,action,b);}catch(e){status.textContent=e.message;}};
 }
 panel.querySelector('[data-provision]').onclick=async e=>{const id=select.value;if(!id)return;const b=e.currentTarget;b.disabled=true;try{await request(root+'/users/'+id+'/provision',{},'POST');status.textContent='Provisioning queued. Refresh users to check switch activation.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};
 for(const button of panel.querySelectorAll('[data-action]'))button.onclick=async()=>{const id=select.value;if(!id)return;button.disabled=true;try{await request('/api/admin/users/'+id+'/security',{action:button.dataset.action},'POST');await refresh();status.textContent='Account action completed.';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
 for(const button of panel.querySelectorAll('[data-open]'))button.onclick=()=>{if(!show(button.dataset.open))status.textContent='This control is not available in the current navigation policy.';};
 try{await refresh();}catch(e){status.textContent=e.message;}
}
