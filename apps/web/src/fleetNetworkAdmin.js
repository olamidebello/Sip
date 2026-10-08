export function setupFleetNetworkAdmin({get,request}){
  const $=id=>document.getElementById(id),status=$('fleet-device-status');
  let devices=[],access='none',nodes=[];
  const rank={none:0,view:1,manage:2,deploy:3};
  const can=level=>rank[access]>=rank[level];
  const item=(parent,text)=>{const li=document.createElement('li');li.textContent=text;parent.append(li);return li;};
  const act=(parent,text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();await refresh();status.textContent=text+' completed.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};parent.append(b);return b;};
  const configOf=record=>typeof record.desired_config==='string'?JSON.parse(record.desired_config):record.desired_config;
  const dump=(name,payload)=>{const file=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const form=$('fleet-device-form');
  function setForm(device){
    form.elements.deviceId.value=device?.id||'';
    for(const [field,key] of [['name','name'],['kind','kind'],['host','host'],['port','port'],['site','site']])form.elements[field].value=device?.[key]??(field==='port'?'22':'');
    form.elements.enabled.checked=device?!!device.enabled:true;
    form.elements.nodeId.replaceChildren(new Option('No linked switch',''));
    for(const n of nodes.filter(n=>n.role==='switch'))form.elements.nodeId.append(new Option(n.name,n.id));
    form.elements.nodeId.value=device?.node_id||'';
    form.elements.expectedVersion.value=device?.config_version||'';
    form.elements.config.value=JSON.stringify(device?configOf(device):{hostname:'device-1',vlans:[],interfaces:[],routes:[]},null,2);
    $('fleet-device-editor-title').textContent=device?'Edit '+device.name+' · version '+device.config_version:'Add a network device';
  }
  async function persistOrder(){await request('/api/admin/servers/devices/order',{ids:devices.map(d=>d.id)},'PUT');await refresh();}
  function draw(){
    const list=$('fleet-devices');list.replaceChildren();
    devices.forEach((d,index)=>{
      const li=item(list,`${d.name} · ${d.kind} · ${d.host}:${d.port} · ${d.site} · ${d.enabled?'enabled':'disabled'} · configuration v${d.config_version} · saved intent`);
      li.dataset.id=d.id;li.draggable=can('manage');
      li.ondragstart=event=>{event.dataTransfer.setData('text/plain',d.id);event.dataTransfer.effectAllowed='move';};
      li.ondragover=event=>{if(can('manage'))event.preventDefault();};
      li.ondrop=async event=>{event.preventDefault();const source=event.dataTransfer.getData('text/plain');const from=devices.findIndex(x=>x.id===source);if(from<0||source===d.id)return;const [moved]=devices.splice(from,1);devices.splice(devices.findIndex(x=>x.id===d.id),0,moved);try{await persistOrder();}catch(e){status.textContent=e.message;await refresh();}};
      if(can('manage')){
        act(li,'Edit',async()=>{setForm(d);form.scrollIntoView({block:'center'});});
        act(li,'Move up',async()=>{if(index>0){[devices[index-1],devices[index]]=[devices[index],devices[index-1]];await persistOrder();}});
        act(li,'Move down',async()=>{if(index<devices.length-1){[devices[index+1],devices[index]]=[devices[index],devices[index+1]];await persistOrder();}});
      }
      act(li,'View versions',async()=>{const result=await get(`/api/admin/servers/devices/${d.id}/revisions`);const view=$('fleet-device-versions');view.replaceChildren();for(const r of result.revisions){const row=item(view,`Version ${r.version} · ${r.created_at}`);act(row,'Download version',async()=>dump(`${d.name}-v${r.version}`,{format:'olamide-fleet-intent-v1',device:d.name,version:r.version,config:r.configuration}));}});
      act(li,'Dump configuration',async()=>dump(d.name,await get(`/api/admin/servers/devices/${d.id}/dump`)));
      if(can('manage'))act(li,'Delete',async()=>{if(window.confirm(`Remove ${d.name} from managed inventory?`))await request(`/api/admin/servers/devices/${d.id}`,{},'DELETE');});
      if(can('deploy')&&d.node_id)act(li,'Install linked switch',()=>request(`/api/admin/servers/${d.node_id}/jobs`,{action:'install'}));
    });
  }
  async function refresh(){
    const [data,servers]=await Promise.all([get('/api/admin/servers/devices'),get('/api/admin/servers')]);
    devices=data.devices;nodes=servers.nodes;access=data.accessLevel;
    form.hidden=!can('manage');$('fleet-device-new').hidden=!can('manage');$('fleet-device-drop-note').hidden=!can('manage');
    draw();const events=$('fleet-device-events');events.replaceChildren();
    for(const e of data.events)item(events,`${e.created_at} · ${e.action} · ${e.detail}`);
  }
  form.onsubmit=async event=>{event.preventDefault();try{
    const f=event.currentTarget,b={name:f.elements.name.value,kind:f.elements.kind.value,host:f.elements.host.value,
      port:Number(f.elements.port.value),site:f.elements.site.value,enabled:f.elements.enabled.checked,
      nodeId:f.elements.nodeId.value||null,config:JSON.parse(f.elements.config.value)};
    const id=f.elements.deviceId.value;
    if(id)await request(`/api/admin/servers/devices/${id}`,{...b,expectedVersion:Number(f.elements.expectedVersion.value)},'PUT');
    else await request('/api/admin/servers/devices',b);
    await refresh();setForm();status.textContent='Configuration version saved. Device changes are not applied to hardware.';
  }catch(e){status.textContent=e.message;}};
  $('fleet-device-new').onclick=()=>setForm();
  const input=form.elements.config;
  input.ondragover=e=>e.preventDefault();
  input.ondrop=async e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(!file||file.size>12000){status.textContent='Drop a JSON configuration file under 12 KB.';return;}
    try{input.value=JSON.stringify(JSON.parse(await file.text()),null,2);status.textContent='Configuration loaded for review. Save to create a version.';}catch{status.textContent='Invalid JSON configuration.';}};
  $('fleet-device-refresh').onclick=()=>refresh().catch(e=>status.textContent=e.message);
  return {refresh};
}
