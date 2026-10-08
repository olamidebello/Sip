export function setupFleetFirewallAdmin({get,request}){
  const $=id=>document.getElementById(id),form=$('fleet-firewall-form'),status=$('fleet-firewall-status');
  let policies=[];
  function selected(){return policies.find(p=>p.node_id===form.elements.nodeId.value);}
  function lines(value){const parsed=typeof value==='string'?JSON.parse(value):value;return (parsed||[]).join('\n');}
  function render(){const policy=selected();form.elements.enabled.checked=!!policy?.enabled;
    form.elements.sshCidrs.value=lines(policy?.ssh_cidrs);form.elements.carrierCidrs.value=lines(policy?.carrier_cidrs);
    $('fleet-firewall-preview').textContent=policy?`Revision ${policy.revision}, ${policy.enabled?'enabled':'disabled'}; SSH: ${lines(policy.ssh_cidrs).replaceAll('\n',', ')||'none'}; carriers: ${lines(policy.carrier_cidrs).replaceAll('\n',', ')||'none'}. Apply creates a separate Ansible job.`:'No saved policy. The host firewall is unchanged.';}
  const split=value=>value.split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);
  async function refresh(){const [data,servers]=await Promise.all([get('/api/admin/servers/firewall'),get('/api/admin/servers')]);
    policies=data.policies;const previous=form.elements.nodeId.value;
    form.elements.nodeId.replaceChildren();for(const n of servers.nodes.filter(n=>n.role==='switch'))form.elements.nodeId.append(new Option(n.name,n.id));
    if(servers.nodes.some(n=>n.id===previous))form.elements.nodeId.value=previous;
    const level=servers.accessLevel,canManage=['manage','deploy'].includes(level);form.querySelector('button[type=submit]').hidden=!canManage;
    for(const input of form.querySelectorAll('textarea,input'))input.disabled=!canManage;
    $('fleet-firewall-apply').hidden=level!=='deploy';render();
  }
  form.elements.nodeId.onchange=render;
  form.onsubmit=async e=>{e.preventDefault();try{await request(`/api/admin/servers/${form.elements.nodeId.value}/firewall`,{
    enabled:form.elements.enabled.checked,sshCidrs:split(form.elements.sshCidrs.value),carrierCidrs:split(form.elements.carrierCidrs.value)},'PUT');
    await refresh();status.textContent='Policy saved; review the preview before applying.';}catch(error){status.textContent=error.message;}};
  $('fleet-firewall-apply').onclick=async()=>{try{await request(`/api/admin/servers/${form.elements.nodeId.value}/firewall`,{});status.textContent='Firewall application queued. Watch the deployment job and controller journal.';}catch(error){status.textContent=error.message;}};
  return {refresh:()=>refresh().catch(e=>status.textContent=e.message)};
}
