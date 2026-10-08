export function setupAdapterAdmin({get,request}){
  const root=document.querySelector('#carrier-adapter-admin');
  const form=root.querySelector('#adapter-create');
  const status=root.querySelector('#adapter-status');
  const list=root.querySelector('#adapter-list');
  const history=root.querySelector('#adapter-history');
  const provider=form.elements.provider,target=form.elements.targetKey;
  async function refresh(){
    try{
      const [registry,carriers]=await Promise.all([
        get('/api/admin/carrier-adapters'),get('/api/admin/carriers')]);
      const previous={provider:provider.value,target:target.value};
      provider.replaceChildren();target.replaceChildren();
      for(const entry of carriers.providers.filter(item=>item.enabled)){
        const option=document.createElement('option');option.value=entry.provider;option.textContent=entry.displayName;
        provider.append(option);
      }
      for(const key of registry.targets){
        const option=document.createElement('option');option.value=key;option.textContent=key;target.append(option);
      }
      if([...provider.options].some(item=>item.value===previous.provider))provider.value=previous.provider;
      if([...target.options].some(item=>item.value===previous.target))target.value=previous.target;
      form.querySelector('button[type="submit"]').disabled=!provider.options.length||!target.options.length;
      list.replaceChildren();
      for(const node of registry.nodes){
        const assigned=registry.assignments.find(item=>item.provider===node.provider&&item.adapter_id===node.id);
        const card=document.createElement('article');
        const title=document.createElement('h4');title.textContent=`${node.name} · ${node.provider} · ${node.region}`;
        const detail=document.createElement('p');
        detail.textContent=`Target ${node.target_key} · ${node.health} · ${node.enabled?'enabled':'disabled'} · ${node.max_concurrent_calls} calls · priority ${node.priority}${assigned?' · assigned':''}`;
        const controls=document.createElement('div');
        const check=document.createElement('button');check.type='button';check.textContent='Check health';
        check.onclick=async()=>{check.disabled=true;try{
          await request(`/api/admin/carrier-adapters/${node.id}/check`,{});
          await refresh();status.textContent=`${node.name} is healthy.`;
        }catch(error){status.textContent=error.message;await refresh();}};
        const toggle=document.createElement('button');toggle.type='button';
        toggle.textContent=node.enabled?'Disable':'Enable';
        toggle.onclick=async()=>{toggle.disabled=true;try{
          await request(`/api/admin/carrier-adapters/${node.id}`,{
            enabled:!node.enabled,priority:node.priority,maxConcurrentCalls:node.max_concurrent_calls},'PUT');
          await refresh();status.textContent=`${node.name} ${node.enabled?'disabled':'enabled'}.`;
        }catch(error){status.textContent=error.message;toggle.disabled=false;}};
        const settings=document.createElement('form');
        const priority=document.createElement('input');priority.type='number';priority.min='1';priority.max='1000';priority.value=node.priority;
        priority.setAttribute('aria-label','Priority for '+node.name);
        const capacity=document.createElement('input');capacity.type='number';capacity.min='1';capacity.max='100000';capacity.value=node.max_concurrent_calls;
        capacity.setAttribute('aria-label','Maximum concurrent calls for '+node.name);
        const save=document.createElement('button');save.textContent='Save capacity and priority';
        settings.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{
          await request(`/api/admin/carrier-adapters/${node.id}`,{
            enabled:!!node.enabled,priority:Number(priority.value),maxConcurrentCalls:Number(capacity.value)},'PUT');
          await refresh();status.textContent=`${node.name} updated.`;
        }catch(error){status.textContent=error.message;save.disabled=false;}};
        settings.append(priority,capacity,save);
        const remove=document.createElement('button');remove.type='button';remove.textContent='Delete adapter';
        remove.disabled=!!assigned;
        remove.onclick=async()=>{if(!window.confirm(`Delete adapter ${node.name}?`))return;
          remove.disabled=true;try{await request(`/api/admin/carrier-adapters/${node.id}`,{},'DELETE');
            await refresh();status.textContent='Adapter deleted.';}
          catch(error){status.textContent=error.message;remove.disabled=false;}};
        controls.append(check,toggle,remove);
        card.append(title,detail,controls,settings);list.append(card);
      }
      if(!registry.nodes.length)list.textContent='No adapter nodes configured.';
      history.replaceChildren();
      for(const operation of registry.operations){
        const item=document.createElement('li');
        item.textContent=`${operation.provider} · ${operation.action} · ${operation.outcome} · ${new Date(operation.created_at).toLocaleString()}`;
        history.append(item);
      }
      status.textContent=`${registry.nodes.length} adapter node(s), ${registry.targets.length} private target(s) available.`;
    }catch(error){status.textContent=error.message;}
  }
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(form));
      await request('/api/admin/carrier-adapters',{provider:data.provider,name:data.name,
        targetKey:data.targetKey,region:data.region,priority:Number(data.priority),
        maxConcurrentCalls:Number(data.maxConcurrentCalls)});
      form.reset();await refresh();status.textContent='Adapter added as disabled. Check health before enabling.';
    }catch(error){status.textContent=error.message;button.disabled=false;}
  };
  root.querySelector('#adapter-refresh').onclick=refresh;
  return {refresh};
}
