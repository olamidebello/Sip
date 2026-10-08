export function setupDidwwAdmin({get,request}){
  const root=document.querySelector('#didww-admin');
  const form=root.querySelector('#didww-resource-form');
  const resource=form.elements.resource,method=form.elements.method;
  const status=root.querySelector('#didww-status');
  const result=root.querySelector('#didww-response');
  const eventList=root.querySelector('#didww-events');
  let config;
  function updateMethods(){
    const previous=method.value;method.replaceChildren();
    for(const verb of config?.resources?.[resource.value]||[]){
      const option=document.createElement('option');option.value=verb;option.textContent=verb;method.append(option);
    }
    if([...method.options].some(option=>option.value===previous))method.value=previous;
    form.elements.payload.disabled=!['POST','PATCH'].includes(method.value);
    form.elements.resourceId.required=['PATCH','DELETE'].includes(method.value);
  }
  resource.onchange=updateMethods;method.onchange=updateMethods;
  async function events(){
    const response=await get('/api/admin/didww/events');
    eventList.replaceChildren();
    for(const event of response.events){
      const row=document.createElement('li');
      row.textContent=`${event.resource_type} ${event.resource_id}: ${event.event_status} · ${new Date(event.received_at).toLocaleString()}`;
      eventList.append(row);
    }
    if(!response.events.length)eventList.textContent='No verified callbacks received.';
    const callList=root.querySelector('#didww-call-events');callList.replaceChildren();
    for(const event of response.callEvents||[]){
      const row=document.createElement('li');
      row.textContent=`${event.event_type} ${event.call_ref} · ${new Date(event.received_at).toLocaleString()}`;
      callList.append(row);
    }
    if(!response.callEvents?.length)callList.textContent='No authenticated call events received.';
  }
  async function refresh(){
    try{
      config=await get('/api/admin/didww/config');
      root.querySelector('#didww-config').textContent=
        `${config.environment} · API key ${config.apiConfigured?'configured':'missing'} · callback secret ${config.callbackConfigured?'configured':'missing'}`;
      root.querySelector('#didww-callback-url').value=config.callbackUrl;
      root.querySelector('#didww-call-events-url').value=config.callEventsUrl;
      const selected=resource.value;resource.replaceChildren();
      for(const name of Object.keys(config.resources)){
        const option=document.createElement('option');option.value=name;option.textContent=name.replaceAll('_',' ');
        resource.append(option);
      }
      if(config.resources[selected])resource.value=selected;
      updateMethods();await events();
    }catch(error){status.textContent=error.message;}
  }
  root.querySelector('#didww-copy-url').onclick=async()=>{
    try{await navigator.clipboard.writeText(root.querySelector('#didww-callback-url').value);
      status.textContent='Callback URL copied.';}
    catch{status.textContent='Select and copy the callback URL manually.';}
  };
  root.querySelector('#didww-refresh').onclick=()=>events().catch(error=>{status.textContent=error.message;});
  form.onsubmit=async event=>{
    event.preventDefault();
    const verb=method.value,id=form.elements.resourceId.value.trim();
    if(['PATCH','DELETE'].includes(verb)&&!id){status.textContent='Resource ID required.';return;}
    if(verb!=='GET'&&!window.confirm(`Send ${verb} to DIDWW ${config.environment}? This can change service or incur charges.`))return;
    let payload={};
    if(['POST','PATCH'].includes(verb)){
      try{payload=JSON.parse(form.elements.payload.value);}
      catch{status.textContent='Enter a valid JSON:API request body.';return;}
    }
    const path=`/api/admin/didww/resources/${encodeURIComponent(resource.value)}${id?'/'+encodeURIComponent(id):''}`;
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const response=verb==='GET'?await get(path):await request(path,payload,verb);
      result.textContent=JSON.stringify(response.data,null,2);
      status.textContent=`DIDWW returned HTTP ${response.upstreamStatus}.`;
    }catch(error){status.textContent=error.message;result.textContent='';}
    finally{button.disabled=false;}
  };
  return {refresh};
}
