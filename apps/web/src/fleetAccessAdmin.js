export function setupFleetAccessAdmin({get,request}){
  const $=id=>document.getElementById(id),form=$('fleet-access-form'),status=$('fleet-access-status');
  async function refresh(){
    const data=await get('/api/admin/servers/access');
    const type=form.elements.type,principal=form.elements.principalId;
    const fill=()=>{principal.replaceChildren();for(const p of (type.value==='user'?data.users:data.groups))
      principal.append(new Option(type.value==='user'?`${p.display_name} (${p.email})`:p.name,p.id));};
    type.onchange=fill;fill();
    const list=$('fleet-access-grants');list.replaceChildren();
    for(const grant of data.grants){const li=document.createElement('li');
      const subject=grant.user_id?data.users.find(u=>u.id===grant.user_id):data.groups.find(g=>g.id===grant.group_id);
      li.textContent=`${subject?.display_name||subject?.name||grant.user_id||grant.group_id} · ${grant.access_level} `;
      const button=document.createElement('button');button.type='button';button.textContent='Revoke';button.onclick=async()=>{try{await request(`/api/admin/servers/access/${grant.id}`,{},'DELETE');await refresh();status.textContent='Access revoked.';}catch(e){status.textContent=e.message;}};li.append(button);list.append(li);
    }
  }
  form.onsubmit=async e=>{e.preventDefault();try{await request('/api/admin/servers/access',{type:form.elements.type.value,principalId:form.elements.principalId.value,level:form.elements.level.value});await refresh();status.textContent='Fleet access saved.';}catch(error){status.textContent=error.message;}};
  return {refresh:()=>refresh().catch(e=>status.textContent=e.message)};
}
