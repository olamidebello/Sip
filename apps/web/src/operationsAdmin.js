export function setupOperationsAdmin({get,request}){
  const $=id=>document.getElementById(id),status=$('operations-status');
  let nodes=[],revision=0;
  async function refresh(){
    const [data,servers]=await Promise.all([get('/api/admin/operations'),get('/api/admin/servers')]);
    nodes=servers.nodes.filter(n=>n.role==='switch');
    const domains=typeof data.registration.allowed_domains==='string'?JSON.parse(data.registration.allowed_domains):data.registration.allowed_domains;
    $('registration-policy').elements.openSignup.checked=!!data.registration.open_signup;
    $('registration-policy').elements.allowedDomains.value=(domains||[]).join('\n');
    const form=$('redirector-form');const chosen=form.elements.nodeId.value;
    form.elements.nodeId.replaceChildren();for(const n of nodes)form.elements.nodeId.append(new Option(n.name,n.id));
    if(nodes.some(n=>n.id===chosen))form.elements.nodeId.value=chosen;
    $('redirector-scope').textContent=data.scope;
    revision=Number(data.balancer.revision);
    const balancer=$('balancer-policy-form');
    balancer.elements.enabled.checked=!!data.balancer.enabled;
    balancer.elements.strategy.value=data.balancer.strategy;
    balancer.elements.allowGlobalFallback.checked=!!data.balancer.allow_global_fallback;
    const history=$('balancer-policy-history');history.replaceChildren();
    for(const row of data.balancerHistory){const li=document.createElement('li');
      li.textContent='Revision '+row.revision+' · '+(row.enabled?'enabled':'disabled')+
        ' · '+row.strategy+' · '+row.created_at;history.append(li);}
    const list=$('redirector-targets');list.replaceChildren();
    for(const t of data.targets){const li=document.createElement('li');li.textContent=`${t.name} · ${t.region} · ${t.wss_url} · weight ${t.weight} · ${t.enabled?'enabled':'disabled'} · switch ${t.node_status} `;
      const view=document.createElement('button');view.type='button';view.textContent='View';
      view.onclick=()=>{status.textContent=t.name+' · '+t.wss_url+' · region '+t.region+
        ' · linked node '+t.node_id+' · weight '+t.weight+' · '+(t.enabled?'enabled':'disabled')+
        ' · host '+t.node_status;};li.append(view);
      const toggle=document.createElement('button');toggle.type='button';toggle.textContent=t.enabled?'Disable':'Enable';
      toggle.onclick=async()=>{toggle.disabled=true;try{await request('/api/admin/operations/redirector/'+t.id,
        {name:t.name,region:t.region,nodeId:t.node_id,wssUrl:t.wss_url,weight:Number(t.weight),enabled:!t.enabled},'PUT');
        await refresh();status.textContent=t.name+' '+(t.enabled?'disabled':'enabled')+'.';}
        catch(error){status.textContent=error.message;toggle.disabled=false;}};li.append(toggle);
      const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=()=>{for(const [field,key] of [['name','name'],['region','region'],['nodeId','node_id'],['wssUrl','wss_url'],['weight','weight']])form.elements[field].value=t[key];form.elements.enabled.checked=!!t.enabled;form.elements.targetId.value=t.id;form.scrollIntoView({block:'center'});};li.append(edit);
      const remove=document.createElement('button');remove.type='button';remove.textContent='Delete';remove.onclick=async()=>{try{await request(`/api/admin/operations/redirector/${t.id}`,{},'DELETE');await refresh();status.textContent='Target deleted.';}catch(e){status.textContent=e.message;}};li.append(remove);list.append(li);
    }
    const audit=$('operations-events');audit.replaceChildren();for(const e of data.audit){const li=document.createElement('li');li.textContent=`${e.created_at} · ${e.action} · ${e.detail}`;audit.append(li);}
  }
  $('balancer-policy-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;
    const button=form.querySelector('button');button.disabled=true;
    try{const result=await request('/api/admin/operations/balancer',{
      enabled:form.elements.enabled.checked,strategy:form.elements.strategy.value,
      allowGlobalFallback:form.elements.allowGlobalFallback.checked,expectedRevision:revision},'PUT');
      await refresh();status.textContent='WSS balancer policy saved at revision '+result.revision+'.';}
    catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
  $('balancer-preview').onclick=async()=>{try{
    const region=$('balancer-preview-region').value.trim();
    const data=await get('/api/admin/operations/balancer/preview?region='+encodeURIComponent(region));
    $('balancer-preview-result').textContent=data.selection?
      data.selection.name+' · '+data.selection.wssUrl+' · '+data.scope:'No eligible healthy WSS target for '+region+'. '+data.scope;
  }catch(error){$('balancer-preview-result').textContent=error.message;}};
  $('registration-policy').onsubmit=async e=>{e.preventDefault();try{const f=e.currentTarget;await request('/api/admin/operations/registration',{
    openSignup:f.elements.openSignup.checked,allowedDomains:f.elements.allowedDomains.value.split(/[\s,]+/).filter(Boolean)},'PUT');await refresh();status.textContent='Registration policy saved and active.';}catch(error){status.textContent=error.message;}};
  $('redirector-form').onsubmit=async e=>{e.preventDefault();try{const f=e.currentTarget,id=f.elements.targetId.value;
    const data={name:f.elements.name.value,region:f.elements.region.value,nodeId:f.elements.nodeId.value,wssUrl:f.elements.wssUrl.value,
      weight:Number(f.elements.weight.value),enabled:f.elements.enabled.checked};
    await request(id?`/api/admin/operations/redirector/${id}`:'/api/admin/operations/redirector',data,id?'PUT':'POST');f.reset();f.elements.targetId.value='';await refresh();status.textContent='WSS discovery target saved.';
  }catch(error){status.textContent=error.message;}};
  $('redirector-new').onclick=()=>{$('redirector-form').reset();$('redirector-form').elements.targetId.value='';};
  return {refresh:()=>refresh().catch(e=>status.textContent=e.message)};
}
