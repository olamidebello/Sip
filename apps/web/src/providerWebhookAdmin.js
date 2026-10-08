export function setupProviderWebhookAdmin({get,request}){
  const root=document.querySelector('#provider-webhook-admin');
  const list=root.querySelector('#provider-webhook-list'),events=root.querySelector('#provider-webhook-events');
  const result=root.querySelector('#provider-webhook-result');
  const status=root.querySelector('#provider-webhook-status');
  async function refresh(){try{
    const data=await get('/api/admin/provider-webhooks');list.replaceChildren();events.replaceChildren();
    root.querySelector('#provider-webhook-tenant').textContent=`Selected tenant: ${data.tenantId}`;
    for(const hook of data.webhooks){
      const li=document.createElement('li');li.textContent=`${hook.display_name} (${hook.provider}) · ${hook.enabled?'enabled':'disabled'} `;
      const toggle=document.createElement('button');toggle.type='button';toggle.textContent=hook.enabled?'Disable':'Enable';
      toggle.onclick=async()=>{try{await request(`/api/admin/provider-webhooks/${hook.id}/status`,{enabled:!hook.enabled},'PUT');await refresh();}catch(error){status.textContent=error.message;}};
      const rotate=document.createElement('button');rotate.type='button';rotate.textContent='Rotate callback URL';
      rotate.onclick=async()=>{if(!confirm(`Rotate ${hook.provider} callback URL? The previous URL stops working immediately.`))return;
        try{const response=await request(`/api/admin/provider-webhooks/${hook.id}/rotate`,{},'PUT');result.textContent=`Copy and configure this new URL now: ${response.url}`;await refresh();}
        catch(error){status.textContent=error.message;}};
      li.append(toggle,rotate);list.append(li);
    }
    for(const event of data.events){const li=document.createElement('li');li.textContent=`${event.provider} · ${new Date(event.received_at).toLocaleString()} · SHA-256 ${event.payload_hash}`;events.append(li);}
    status.textContent=`${data.webhooks.length} provider callback configuration(s). Flowroute SMS/MMS callback settings are on the Messaging webhooks page.`;
  }catch(error){status.textContent=error.message;}}
  root.querySelector('#provider-webhook-create').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;
    try{const response=await request('/api/admin/provider-webhooks',Object.fromEntries(new FormData(form)));
      result.textContent=`Copy and configure this URL now: ${response.url}`;form.reset();await refresh();
    }catch(error){status.textContent=error.message;}};
  root.querySelector('#provider-webhook-refresh').onclick=refresh;
  return {refresh};
}
