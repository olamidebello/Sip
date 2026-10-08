const actions=['view','add','edit','delete'];
const titles={view:'View',add:'Add',edit:'Edit',delete:'Delete'};
function options(select,items,label){
  select.replaceChildren();
  for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=label(item);select.append(option);}
}
function choices(root,mode){
  root.replaceChildren();
  for(const action of actions){
    const label=document.createElement('label');label.textContent=`${titles[action]} `;
    const input=document.createElement('select');input.name=action;
    for(const [value,text] of mode==='tenant'?[['true','Allow'],['false','Deny']]:mode==='group'?[['','Inherit'],['true','Allow']]:[['','Inherit'],['true','Allow'],['false','Deny']]){
      const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);
    }
    label.append(input);root.append(label);
  }
}
function fill(root,policy){for(const input of root.querySelectorAll('select')) input.value=policy[input.name]===undefined?'':String(policy[input.name]);}
function values(root){return Object.fromEntries([...root.querySelectorAll('select')].filter(input=>input.value!=='').map(input=>[input.name,input.value==='true']));}
export function setupSipProfiles({get,request}){
  const form=document.querySelector('#sip-profile-create');
  const list=document.querySelector('#sip-profile-list');
  const status=document.querySelector('#sip-profile-status');
  const admin=document.querySelector('#sip-profile-admin');
  let adminData,profiles=[];
  function entry(profile,permissions){
    const row=document.createElement('li');
    const title=document.createElement('span');title.textContent=`${profile.label}: ${profile.username}@${profile.domain} · ${profile.wssUrl} `;row.append(title);
    const use=document.createElement('button');use.type='button';use.textContent='Use in dialer';use.onclick=()=>{
      const dialer=document.querySelector('#connect');dialer.elements.aor.value=`sip:${profile.username}@${profile.domain}`;
      dialer.elements.username.value=profile.username;dialer.elements.server.value=profile.wssUrl;
      document.querySelector('a[href="#calling-workspace"]')?.click();dialer.elements.password.focus();
    };row.append(use);
    if(permissions.edit){const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=async()=>{
      form.elements.label.value=profile.label;form.elements.username.value=profile.username;
      form.elements.domain.value=profile.domain;form.elements.wssUrl.value=profile.wssUrl;
      form.dataset.id=profile.id;form.querySelector('button').textContent='Save changes';form.scrollIntoView({behavior:'smooth'});
    };row.append(edit);}
    if(permissions.delete){const remove=document.createElement('button');remove.type='button';remove.textContent='Delete';remove.onclick=async()=>{
      if(!confirm(`Delete SIP profile ${profile.label}?`)) return;
      try{await request(`/api/sip-profiles/${profile.id}`,{},'DELETE');await refresh();status.textContent='Profile deleted.';}
      catch(error){status.textContent=error.message;}
    };row.append(remove);}
    return row;
  }
  async function refresh(){
    try{
      const result=await get('/api/sip-profiles');profiles=result.profiles;list.replaceChildren(...profiles.map(profile=>entry(profile,result.permissions)));
      form.hidden=!result.permissions.add&&!result.permissions.edit;
      if(!profiles.length) status.textContent='No saved connection profiles. SIP password is entered only when connecting.';
    }catch(error){list.replaceChildren();form.hidden=true;status.textContent=error.message;}
  }
  form.onsubmit=async event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(form));
    try{await request(form.dataset.id?`/api/sip-profiles/${form.dataset.id}`:'/api/sip-profiles',data,form.dataset.id?'PUT':'POST');
      delete form.dataset.id;form.reset();form.querySelector('button').textContent='Save profile';await refresh();status.textContent='SIP profile saved.';
    }catch(error){status.textContent=error.message;}
  };
  const tenant=admin.querySelector('#sip-policy-tenant'),group=admin.querySelector('#sip-policy-group'),user=admin.querySelector('#sip-policy-user');
  const policyStatus=admin.querySelector('#sip-policy-status');
  for(const mode of ['tenant','group','user']) choices(admin.querySelector(`#sip-${mode}-choices`),mode);
  function show(){if(!adminData)return;
    fill(admin.querySelector('#sip-tenant-choices'),adminData.tenantPermissions);
    fill(admin.querySelector('#sip-group-choices'),adminData.groups.find(row=>row.id===group.value)?.permissions||{});
    fill(admin.querySelector('#sip-user-choices'),adminData.users.find(row=>row.id===user.value)?.permissions||{});
  }
  async function loadPolicy(){
    try{
      adminData=await get(`/api/admin/sip-profile-policy?tenantId=${encodeURIComponent(tenant.value)}`);
      options(group,adminData.groups,row=>row.name);options(user,adminData.users,row=>`${row.name} (${row.email})`);
      show();policyStatus.textContent=`Managing ${adminData.tenant.name}. User overrides take priority over group grants.`;
    }catch(error){policyStatus.textContent=error.message;}
  }
  async function refreshAdmin(){try{const result=await get('/api/admin/tenants');const previous=tenant.value;
    options(tenant,result.tenants.filter(row=>row.status==='active'),row=>row.name);if(result.tenants.some(row=>row.id===previous))tenant.value=previous;
    if(tenant.value)await loadPolicy();
  }catch(error){policyStatus.textContent=error.message;}}
  tenant.onchange=loadPolicy;group.onchange=show;user.onchange=show;
  for(const mode of ['tenant','group','user']) admin.querySelector(`#sip-${mode}-save`).onclick=async()=>{
    const id=mode==='group'?group.value:mode==='user'?user.value:null;
    if(mode!=='tenant'&&!id){policyStatus.textContent=`Select a ${mode}.`;return;}
    try{await request(`/api/admin/sip-profile-policy/${mode}${id?'/'+id:''}`,{tenantId:tenant.value,permissions:values(admin.querySelector(`#sip-${mode}-choices`))},'PUT');
      await loadPolicy();if(id)(mode==='group'?group:user).value=id;show();policyStatus.textContent=`${mode} policy saved.`;
    }catch(error){policyStatus.textContent=error.message;}
  };
  return {refresh,refreshAdmin};
}
