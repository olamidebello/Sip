const $=id=>document.getElementById(id);
async function api(path,method='GET',body){const r=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error||'Policy request failed');return data;}
export function setupPasskeyPolicy(){const status=$('passkey-policy-status'),groups=$('passkey-policy-group'),users=$('passkey-policy-user');
  async function refresh(){const data=await api('/api/admin/passkey-policy');$('passkey-policy-tenant-mode').value=data.tenantMode;
    for(const [select,rows,label] of [[groups,data.groups,'name'],[users,data.users,'email']]){select.replaceChildren();for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=`${row[label]} · ${row.mode||'inherit'}`;select.append(option);}}
    status.textContent=`${data.groups.length} groups and ${data.users.length} local users available.`;}
  for(const scope of ['tenant','group','user'])$(`passkey-policy-${scope}-save`).onclick=async()=>{try{const select=scope==='group'?groups:users,id=select.value;
    if(scope!=='tenant'&&!id)throw new Error('Select a user or group');
    const path=scope==='tenant'?'/api/admin/passkey-policy':`/api/admin/passkey-policy/${scope}s/${id}`;
    await api(path,'PUT',{mode:$(`passkey-policy-${scope}-mode`).value});await refresh();status.textContent='Passkey policy saved. Existing password sessions are checked on their next request.';
  }catch(e){status.textContent=e.message;}};
  return {refresh:()=>refresh().catch(e=>status.textContent=e.message)};
}
