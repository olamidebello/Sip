export function setupFlowrouteSetup({document,parent,get,request,getRole,getUserId,show}){
 const box=document.createElement('section');box.hidden=true;box.id='flowroute-setup';
 box.innerHTML=`<h3>Flowroute setup</h3><p>Enter your SIP password here. Existing passwords are never displayed. SIP credentials are separate from Flowroute API keys.</p><p>UDP/TCP SIP port 5060. Provider networks: 34.226.36.32/28 and 34.210.91.112/28. Configure the same Edge Strategy in Flowroute Manage. Media ports follow the server RTP configuration.</p><form>
 <label>Point of presence<select name="pop"><option value="US-East-VA">US East — us-east-va.sip.flowroute.com</option><option value="US-West-OR">US West — us-west-or.sip.flowroute.com</option></select></label>
 <label>SIP username / auth username<input name="sipUsername" value="49901939" pattern="[0-9]{8}" required></label>
 <label>SIP password<input name="sipPassword" type="password" autocomplete="new-password" maxlength="256" placeholder="Enter password; leave blank to keep saved password"></label>
 <label>Authentication<select name="authenticationMode"><option value="digest">Username and password</option><option value="ip">IP authentication</option></select></label>
 <label>Tech prefix (confirm in Flowroute)<input name="techPrefix" pattern="[0-9]{8}" required></label>
 <label>Public egress IP (confirm server NAT)<input name="publicIp" value="154.29.77.102" required></label>
 <label>Authorized outbound caller ID<input name="callerId" value="+12109050290" pattern="\\+[1-9][0-9]{7,14}" required></label>
 <label>Concurrent call limit<input name="maxConcurrentCalls" type="number" min="1" max="100000" value="1" required></label>
 <label><input name="allowedIpConfirmed" type="checkbox">Public IP is allowed in Flowroute Manage (required for IP authentication)</label>
 <button type="submit">Save encrypted settings</button><button type="button" data-provision>Save &amp; provision Flowroute</button></form>
 <a href="#carrier-adapter-admin" data-manage-adapter class="button-link">Manage adapter</a> <button type="button" data-refresh>Refresh Flowroute status</button><button type="button" data-deactivate>Deactivate Flowroute</button><button type="button" data-remove>Remove saved SIP credentials</button><p role="status" aria-live="polite"></p>`;
 const shortcut=document.createElement('button');shortcut.type='button';shortcut.textContent='Flowroute password & setup';shortcut.dataset.flowrouteSetup='';shortcut.hidden=true;
 const heading=parent.querySelector('h2');if(heading)heading.after(shortcut,box);else parent.prepend(shortcut,box);
 shortcut.onclick=()=>{if(!authorized())return;box.hidden=false;box.scrollIntoView?.({behavior:'smooth',block:'start'});form.elements.sipPassword.focus();};
 const form=box.querySelector('form'),status=box.querySelector('[role=status]');let revision=0,generation=0;
 const authorized=()=>getRole()==='super_admin'&&!!getUserId();
 async function refresh(){const token=++generation,owner=getUserId();box.hidden=!authorized();shortcut.hidden=!authorized();form.elements.sipPassword.value='';if(!authorized()){revision=0;form.reset();form.elements.sipPassword.value='';status.textContent='';return;}
  try{const c=await get('/api/admin/carriers/flowroute/trunk');if(token!==generation||owner!==getUserId()||!authorized())return;revision=c.revision||0;
   if(c.configured)for(const key of ['pop','authenticationMode','sipUsername','techPrefix','publicIp','callerId','maxConcurrentCalls'])form.elements[key].value=c[key]??'';
   form.elements.allowedIpConfirmed.checked=!!c.allowedIpConfirmed;
   status.textContent=c.configured?`Settings saved · revision ${revision} · password ${c.passwordConfigured?'configured':'not configured'}. Refresh status to check live activation.`:'Enter your SIP password and confirm connection settings to set up Flowroute.';
  }catch(e){if(token===generation&&authorized())status.textContent=e.message;}}
 async function act(fn){if(!authorized())return;const owner=getUserId();const buttons=[...box.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn(()=>owner===getUserId()&&authorized());}catch(e){if(owner===getUserId()&&authorized())status.textContent=e.message;}finally{form.elements.sipPassword.value='';buttons.forEach(b=>b.disabled=false);}}
 async function save(provision){if(!form.reportValidity())return;await act(async current=>{
  const body=Object.fromEntries(new document.defaultView.FormData(form));body.expectedRevision=revision;body.maxConcurrentCalls=Number(body.maxConcurrentCalls);body.allowedIpConfirmed=form.elements.allowedIpConfirmed.checked;
  const saved=await request('/api/admin/carriers/flowroute/trunk',body,'PUT');if(!current())return;revision=saved.revision;
  status.textContent='Settings saved securely.';
  if(provision){status.textContent='Provisioning Flowroute…';const r=await request('/api/admin/carriers/flowroute/trunk/provision',{},'POST');if(current())status.textContent=r.status==='active'?'Flowroute active: switch acknowledged provisioning.':'Provisioning requested. Refresh status to check activation.';}
 });}
 form.onsubmit=e=>{e.preventDefault();return save(false);};box.querySelector('[data-provision]').onclick=()=>save(true);
 box.querySelector('[data-refresh]').onclick=()=>act(async current=>{const r=await get('/api/admin/carriers/flowroute/trunk/status');if(current())status.textContent=`Flowroute: ${r.profile?.status||'not provisioned'} · adapter ${r.adapterConfigured?'configured':'missing'}.`;});
 box.querySelector('[data-deactivate]').onclick=()=>act(async current=>{await request('/api/admin/carriers/flowroute/deactivate',{},'POST');if(current())status.textContent='Flowroute deactivated.';});
 box.querySelector('[data-remove]').onclick=()=>{if(!authorized()||!document.defaultView.confirm('Remove saved Flowroute SIP credentials? Deactivate the carrier first.'))return;return act(async current=>{await request('/api/admin/carriers/flowroute/trunk',{expectedRevision:revision},'DELETE');if(current()){revision=0;form.reset();status.textContent='Saved SIP credentials removed.';}});};
 box.querySelector('[data-manage-adapter]').onclick=e=>{e.preventDefault();if(authorized())show?.('carrier-adapter-admin');};
 return {refresh};
}
