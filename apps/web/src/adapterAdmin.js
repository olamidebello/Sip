import {appendAdminStatus} from './adminStatusIcons.js';
// ADMIN_STATUS_ICONS_V1
export function setupAdapterAdmin({get,request}){
  const root=document.querySelector('#carrier-adapter-admin');
  const description=root.querySelector(':scope > p');if(description)description.textContent='Add private HTTPS adapter targets below, then check node health and enable them. Tokens are encrypted and hidden after saving.';
  const form=root.querySelector('#adapter-create');
  const status=root.querySelector('#adapter-status');
  const list=root.querySelector('#adapter-list');
  const history=root.querySelector('#adapter-history');
  const provider=form.elements.provider,target=form.elements.targetKey;
  const configure=root.querySelector('#adapter-configure');
  const configuration=root.querySelector('#adapter-target-configuration');
  configure.onclick=event=>{
    event.preventDefault();configuration.open=true;
    configure.setAttribute('aria-expanded','true');
    targetForm.elements.key.focus();
    holder.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  configuration.replaceChildren();const summary=document.createElement('summary');summary.textContent='Manage private targets';configuration.append(summary);
  const targetForm=document.createElement('form');targetForm.innerHTML='<label>Target key <input name="key" pattern="[a-z][a-z0-9-]{1,39}" maxlength="40" required placeholder="us-east"></label><label>Adapter HTTPS endpoint <input name="url" type="url" required placeholder="https://your-adapter.example/provision"></label><label>Authentication token <input name="token" type="password" autocomplete="new-password" placeholder="32 or more characters; blank retains saved token"></label><button>Save private target</button><p>Tokens are encrypted and write-only. This connects an existing adapter service. Check the adapter health before enabling it.</p>';const targetRows=document.createElement('div');
  // Keep this form outside the adapter-create form; nested forms are invalid.
  const holder=document.createElement('section');holder.className='adapter-target-editor';holder.append(targetForm,targetRows);root.insertBefore(holder,form);configuration.append(document.createTextNode('Use the private target editor above.'));
  let targetMetadata=[];
  async function refreshTargets(){const data=await get('/api/admin/carrier-adapters/targets');targetMetadata=data.targets;targetRows.replaceChildren();for(const entry of data.targets){const row=document.createElement('p');row.append(document.createTextNode(entry.key+' · '+entry.url+' · '+entry.source+' '));const edit=document.createElement('button');edit.type='button';edit.textContent='Edit / rotate';edit.onclick=()=>{targetForm.elements.key.value=entry.key;targetForm.elements.url.value=entry.url;targetForm.elements.token.value='';targetForm.scrollIntoView({block:'nearest'});};row.append(edit);if(entry.source==='gui'){const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.onclick=async()=>{if(!window.confirm('Remove private target '+entry.key+'?'))return;try{await request('/api/admin/carrier-adapters/targets/'+entry.key,{expectedRevision:entry.revision},'DELETE');await refresh();}catch(e){status.textContent=e.message;}};row.append(remove);}targetRows.append(row);}targetForm.querySelector('button').disabled=!data.keyReady;if(!data.keyReady)status.textContent='Run the Flowroute gateway installer to prepare the encryption key.';}
  targetForm.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(targetForm));const button=targetForm.querySelector('button');button.disabled=true;try{await request('/api/admin/carrier-adapters/targets/'+values.key,{url:values.url,token:values.token,expectedRevision:targetMetadata.find(t=>t.key===values.key)?.revision||0},'PUT');targetForm.elements.token.value='';await refresh();target.value=values.key;status.textContent='Private target saved. Add an adapter node, check health, then enable it.';}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
  configuration.addEventListener('toggle',()=>configure.setAttribute('aria-expanded',String(configuration.open)));
  async function refresh(){
    try{
      await refreshTargets();
      const [registry,carriers]=await Promise.all([
        get('/api/admin/carrier-adapters'),get('/api/admin/carriers')]);
      const previous={provider:provider.value,target:target.value};
      provider.replaceChildren();target.replaceChildren();
      for(const entry of carriers.providers.filter(item=>item.enabled)){
        const option=document.createElement('option');option.value=entry.provider;option.textContent=entry.displayName;
        provider.append(option);
      }
      if(!registry.targets.length){const empty=document.createElement('option');empty.value='';empty.textContent='Add a private target above';empty.disabled=true;empty.selected=true;target.append(empty);}
      for(const key of registry.targets){
        const option=document.createElement('option');option.value=key;option.textContent=key;target.append(option);
      }
      if([...provider.options].some(item=>item.value===previous.provider))provider.value=previous.provider;
      if([...target.options].some(item=>item.value===previous.target))target.value=previous.target;
      form.querySelector('button[type="submit"]').disabled=!provider.options.length||!registry.targets.length;
      list.replaceChildren();
      for(const node of registry.nodes){
        const assigned=registry.assignments.find(item=>item.provider===node.provider&&item.adapter_id===node.id);
        const card=document.createElement('article');
        const title=document.createElement('h4');title.textContent=`${node.name} · ${node.provider} · ${node.region}`;
        const detail=document.createElement('p');
        detail.textContent=`Target ${node.target_key} · ${node.health} · ${node.enabled?'enabled':'disabled'} · ${node.max_concurrent_calls} calls · priority ${node.priority}${assigned?' · assigned':''}`;
        appendAdminStatus(detail,'health',node);const controls=document.createElement('div');
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
