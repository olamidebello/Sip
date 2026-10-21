import {setupUserProvisionControls} from './userProvisionControls.js';
export function setupCallerIdentityAdmin({document,get,request,isSuper,show}){
 const parent=document.getElementById('admin');if(!parent)return;
 const panel=document.createElement('details');panel.id='caller-identity-policy-admin';panel.hidden=true;
 panel.innerHTML=`<summary>User management, caller ID &amp; policy</summary>
 <p>Authorize the user’s profile phone number for caller ID passthrough. Saving a profile number alone does not authorize it. Provider caller-ID permissions still apply.</p>
 <h4>Tenant caller ID policy</h4><label><input type="checkbox" data-required> Require assigned outbound DID</label>
 <button type="button" data-load>Refresh policy</button><button type="button" data-save>Save policy</button><p data-policy-status role="status"></p>
 <h4>User caller ID authorization</h4><label>Search users <input type="search" data-search placeholder="Name, email or profile phone"></label>
 <button type="button" data-users>Refresh users</button><label>Select user <select data-user><option value="">Select a user</option></select></label>
 <p data-user-summary></p><label>Profile phone number <input data-profile readonly></label>
 <label>Caller ID to authorize <input data-number readonly></label><button type="button" data-use-profile>Use profile number</button>
 <p data-current></p><label>Authorization reference or reason <textarea data-evidence maxlength="255" placeholder="Ownership verification / carrier approval reference"></textarea></label>
 <button type="button" data-approve>Authorize profile number</button><button type="button" data-block>Block outbound caller ID</button>
 <button type="button" data-user-refresh>Refresh selected user</button><p data-user-status role="status"></p>
 <p data-list-status role="status"></p><h4>Recent administrative activity</h4><ul data-events></ul>`;
 parent.prepend(panel);
 const shortcut=document.createElement('a');shortcut.href='/?caller-id=1#admin';shortcut.textContent='User & caller ID controls';shortcut.className='button-link';shortcut.dataset.callerIdShortcut='true';shortcut.hidden=true;
 const topLink=shortcut.cloneNode(true);parent.insertBefore(topLink,panel);
 const $=s=>panel.querySelector(s),status=$('[data-policy-status]'),userStatus=$('[data-user-status]'),input=$('[data-required]'),save=$('[data-save]');
 const management=setupUserProvisionControls({document,parent:panel,get,request,isSuper,onChanged:async()=>{await loadUser();await loadUsers();}});
 let loaded=false,users=[],selected=null,epoch=0,selection=0,busy=false,wasSuper=false,deepOpened=false;
 function clearUser(){management.clear();selection++;selected=null;$('[data-profile]').value='';$('[data-number]').value='';$('[data-evidence]').value='';$('[data-current]').textContent='';$('[data-user-summary]').textContent='';userStatus.textContent='';controls();}
 function controls(){save.disabled=!loaded||busy;for(const k of ['approve','block','use-profile','user-refresh'])$('[data-'+k+']').disabled=!selected||busy;$('[data-approve]').disabled=!selected||busy||!/^\+[1-9][0-9]{7,14}$/.test($('[data-number]').value);$('[data-user]').disabled=busy;$('[data-evidence]').disabled=busy;}
 function renderUsers(){const filter=$('[data-search]').value.toLowerCase();const chosen=$('[data-user]').value;$('[data-user]').replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Select a user';$('[data-user]').append(blank);for(const u of users.filter(u=>[u.display_name,u.email,u.phone_e164].some(v=>String(v||'').toLowerCase().includes(filter)))){const option=document.createElement('option');option.value=u.id;option.textContent=`${u.display_name||u.email} · ${u.email} · ${u.phone_e164||'No profile phone'}`;$('[data-user]').append(option);}
 if([...$('[data-user]').options].some(o=>o.value===chosen))$('[data-user]').value=chosen;else clearUser();}
 async function loadPolicy(){if(!isSuper())return;const token=epoch;loaded=false;controls();try{const p=await get('/api/admin/caller-identity-policy');if(token!==epoch||!isSuper())return;input.checked=p.requireAssignedDid;loaded=true;status.textContent=p.requireAssignedDid?'Assigned outbound DID required.':'Authorized profile phone is the default.';}catch(e){if(token===epoch)status.textContent=e.message;}finally{controls();}}
 async function loadUsers(){if(!isSuper())return;const token=epoch;try{const data=await get('/api/admin/platform-control');if(token!==epoch||!isSuper())return;users=data.users||[];renderUsers();$('[data-list-status]').textContent=`${users.length} users loaded (up to 500).`;$('[data-events]').replaceChildren();for(const e of data.events||[]){const li=document.createElement('li');li.textContent=`${new Date(e.created_at).toLocaleString()} · ${e.action} · ${e.target_id||'Tenant'}`;$('[data-events]').append(li);}}catch(e){if(token===epoch)$('[data-list-status]').textContent=e.message;}}
 async function loadUser(){if(!isSuper())return;const id=$('[data-user]').value;clearUser();if(!id)return;const token=epoch,seq=selection;try{const data=await get('/api/admin/platform-control/users/'+encodeURIComponent(id));if(token!==epoch||seq!==selection||!isSuper())return;selected={...users.find(u=>u.id===id),...data.user};management.setUser(selected);$('[data-profile]').value=selected.phone_e164||'';$('[data-number]').value=selected.phone_e164||'';$('[data-evidence]').value=selected.evidence||'';$('[data-user-summary]').textContent=`${selected.display_name||''} · ${selected.email}`;
 const approved=Number(selected.authorized)===1&&selected.caller_id===selected.phone_e164;
 $('[data-current]').textContent=approved?'Profile number authorized.':selected.authorized!==null&&selected.authorized!==undefined&&!Number(selected.authorized)?'Outbound caller ID blocked by administrator.':selected.caller_id?'Approved caller ID differs from profile: '+selected.caller_id:'Profile number is not yet authorized.';controls();}catch(e){if(token===epoch&&seq===selection)userStatus.textContent=e.message;}}
 async function update(authorized){if(!isSuper()||!selected||busy)return;const target=selected,token=epoch,seq=selection,number=$('[data-number]').value,evidence=$('[data-evidence]').value.trim();if(!evidence){userStatus.textContent='Enter an authorization reference or reason.';return;}if(authorized&&!/^\+[1-9][0-9]{7,14}$/.test(number)){userStatus.textContent='A valid international profile phone number is required.';return;}
 if(!document.defaultView.confirm(`${authorized?'Authorize '+number+' for':'Block outbound caller ID for'} ${target.email}?`))return;
 busy=true;controls();try{
 const latest=await get('/api/admin/platform-control/users/'+encodeURIComponent(target.id));if(token!==epoch||seq!==selection||!isSuper())return;
 if(authorized&&latest.user.phone_e164!==number)throw Error('The profile number changed. Refresh the user before authorizing.');
 await request('/api/admin/platform-control/users/'+encodeURIComponent(target.id)+'/caller-id',{authorized,number:authorized?number:null,evidence},'PUT');
 if(token!==epoch||seq!==selection)return;await loadUser();await loadUsers();userStatus.textContent=authorized?'Profile caller ID authorized. Retry the call.':'Outbound caller ID blocked.';
 }catch(e){if(token===epoch&&seq===selection)userStatus.textContent=e.message;}finally{busy=false;controls();}}
 save.onclick=async()=>{if(!isSuper()||!loaded||busy)return;const token=epoch;busy=true;controls();try{await request('/api/admin/caller-identity-policy',{requireAssignedDid:input.checked},'PUT');if(token===epoch)status.textContent='Caller ID policy saved.';}catch(e){if(token===epoch)status.textContent=e.message;}finally{busy=false;controls();}};
 $('[data-load]').onclick=loadPolicy;$('[data-users]').onclick=loadUsers;$('[data-search]').oninput=renderUsers;$('[data-user]').onchange=loadUser;$('[data-user-refresh]').onclick=loadUser;$('[data-use-profile]').onclick=()=>{if(selected){$('[data-number]').value=selected.phone_e164||'';controls();}};$('[data-approve]').onclick=()=>update(true);$('[data-block]').onclick=()=>update(false);
 function open(event){event?.preventDefault();if(!isSuper())return;if(show)show();else document.defaultView.location.hash='admin';panel.open=true;void Promise.all([loadPolicy(),loadUsers()]);panel.scrollIntoView?.({block:'start',behavior:'smooth'});}
 shortcut.onclick=open;topLink.onclick=open;panel.ontoggle=()=>{if(panel.open&&isSuper())void Promise.all([loadPolicy(),loadUsers()]);};
 function visibility(){const permitted=isSuper();if(panel.hidden===permitted)panel.hidden=!permitted;if(shortcut.hidden===permitted)shortcut.hidden=!permitted;if(topLink.hidden===permitted)topLink.hidden=!permitted;
 const nav=document.getElementById('app-nav');if(nav&&shortcut.parentNode!==nav)nav.append(shortcut);
 if(wasSuper&&!permitted){epoch++;loaded=false;users=[];clearUser();panel.open=false;status.textContent='';$('[data-user]').replaceChildren();$('[data-events]').replaceChildren();$('[data-list-status]').textContent='';}
 wasSuper=permitted;if(permitted&&!deepOpened&&new URL(document.defaultView.location.href).searchParams.get('caller-id')==='1'){deepOpened=true;open();}}
 const observer=new document.defaultView.MutationObserver(visibility);observer.observe(document.body,{attributes:true,childList:true,subtree:true,attributeFilter:['hidden','class']});visibility();controls();
 return {open,dispose(){epoch++;observer.disconnect();shortcut.remove();topLink.remove();panel.remove();}};
}
