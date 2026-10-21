export function setupCallerIdentityAdmin({document,get,request,isSuper}){
 const parent=document.getElementById('admin');if(!parent)return;
 const panel=document.createElement('details');panel.id='caller-identity-policy-admin';panel.hidden=true;
 panel.innerHTML='<summary>Outbound caller ID policy</summary><p>Default: use the authorized phone number from the user profile. A profile change requires fresh caller-ID authorization. Carrier passthrough permissions still apply.</p><label><input type="checkbox"> Require assigned outbound DID</label><button type="button" data-load>Refresh policy</button><button type="button" data-save>Save policy</button><p role="status"></p>';
 parent.append(panel);const input=panel.querySelector('input'),status=panel.querySelector('[role=status]'),save=panel.querySelector('[data-save]');let loaded=false;
 async function load(){if(!isSuper())return;save.disabled=true;try{const p=await get('/api/admin/caller-identity-policy');if(!isSuper())return;input.checked=p.requireAssignedDid;loaded=true;status.textContent=p.requireAssignedDid?'Assigned outbound DID required.':'Authorized profile phone is the default.';}catch(e){status.textContent=e.message;}finally{save.disabled=!loaded;}}
 panel.ontoggle=()=>{if(panel.open&&isSuper())void load();};panel.querySelector('[data-load]').onclick=load;
 save.onclick=async()=>{if(!isSuper()||!loaded)return;save.disabled=true;try{await request('/api/admin/caller-identity-policy',{requireAssignedDid:input.checked},'PUT');status.textContent='Caller ID policy saved.';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 const observer=new document.defaultView.MutationObserver(()=>{const hidden=!isSuper();if(panel.hidden!==hidden)panel.hidden=hidden;if(hidden){loaded=false;panel.open=false;status.textContent='';}});observer.observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden','class']});
 panel.hidden=!isSuper();save.disabled=true;
}
