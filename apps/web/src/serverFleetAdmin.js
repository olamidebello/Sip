export function setupServerFleetAdmin({get,request}){
  const $=id=>document.getElementById(id);
  const status=$('fleet-status');
  const list=(id,rows,render)=>{const el=$(id);el.replaceChildren();for(const row of rows){const item=document.createElement('li');render(item,row);el.append(item);}};
  const button=(parent,title,run)=>{const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=async()=>{b.disabled=true;try{const result=await run();if(result===undefined)return;await refresh();status.textContent=result?.status==='pending'?title+' queued. Check job history for the result.':title+' completed.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};parent.append(b);};
  async function refresh(){
    const [data,topology,kamailio,commissioning]=await Promise.all([get('/api/admin/servers'),get('/api/admin/servers/topology'),get('/api/admin/servers/kamailio').catch(()=>null),get('/api/admin/servers/commissioning').catch(()=>null)]);
    const can=level=>({none:0,view:1,manage:2,deploy:3})[data.accessLevel]>=({view:1,manage:2,deploy:3})[level];
    $('fleet-add').hidden=!can('manage');$('fleet-report-settings').hidden=!can('manage');
    $('fleet-summary').textContent=`${data.nodes.length} registered servers · ${data.jobs.filter(j=>['pending','leased'].includes(j.status)).length} active jobs · runner ${data.runnerConfigured?'configured':'unavailable'}`;
    if(kamailio){
      let panel=$('fleet-kamailio-monitor');
      if(!panel){panel=document.createElement('section');panel.id='fleet-kamailio-monitor';panel.setAttribute('aria-label','Kamailio service monitoring');$('fleet-summary').after(panel);}
      panel.textContent=`Kamailio service monitoring: ${kamailio.nodes.map(n=>`${n.name}: signaling ${n.signaling_status||'unreported'}, media ${n.media_status||'unreported'}, checked ${n.created_at||'never'}`).join('; ')||'No switch nodes'}. Refresh each host audit for current state. Service state does not prove carrier calls or prepaid settlement.`;
    }
    if(commissioning){
      let panel=$('fleet-prepaid-monitor');
      if(!panel){panel=document.createElement('section');panel.id='fleet-prepaid-monitor';panel.setAttribute('aria-label','Prepaid and billing monitoring');$('fleet-summary').after(panel);}
      panel.textContent=`Prepaid reservations: ${commissioning.reservations.map(r=>`${r.status} ${r.count}`).join(', ')||'none'} · past authorized expiry ${commissioning.overdueReservations} · settled journals ${commissioning.prepaidJournals}. ${commissioning.scope}`;
    }
    $('fleet-topology').textContent=`${topology.healthyWssTargets} healthy WSS targets · ${topology.regions.map(r=>`${r.region} ${r.role}: ${r.fresh_healthy}/${r.nodes} fresh, configured capacity ${r.configured_capacity}`).join('; ')||'No servers registered'}. ${topology.scope}`;
    const settings=data.settings||{};const form=$('fleet-report-settings');
    form.elements.staleSeconds.value=settings.stale_seconds??300;
    form.elements.warningLatencyMs.value=settings.warning_latency_ms??2000;
    form.elements.retentionDays.value=settings.retention_days??90;
    list('fleet-nodes',data.nodes,(li,n)=>{
      li.draggable=can('manage');li.dataset.id=n.id;
      li.ondragstart=e=>e.dataTransfer.setData('text/plain',n.id);
      li.ondragover=e=>{if(can('manage'))e.preventDefault();};
      li.ondrop=async e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain'),ids=data.nodes.map(node=>node.id);
        if(!ids.includes(from)||from===n.id)return;ids.splice(ids.indexOf(from),1);ids.splice(ids.indexOf(n.id),0,from);
        try{await request('/api/admin/servers/order',{ids},'PUT');await refresh();}catch(error){status.textContent=error.message;}};
      const p=document.createElement('p');p.textContent=`${n.name} · ${n.role} · ${n.host}:${n.ssh_port} · ${n.region} · ${n.status} · version ${n.version||'unknown'} · capacity ${n.capacity} · last check ${n.last_seen_at||'never'}${n.last_error?' · '+n.last_error:''}`;li.append(p);
      const controls=document.createElement('div');controls.className='form-row';li.append(controls);
      if(!can('manage'))controls.hidden=true;
      const host=document.createElement('input');host.value=n.host;host.setAttribute('aria-label',`${n.name} IPv4 address`);controls.append(host);
      const sshUser=document.createElement('input');sshUser.value=n.ssh_user;sshUser.setAttribute('aria-label',`${n.name} SSH user`);controls.append(sshUser);
      const sshPort=document.createElement('input');sshPort.type='number';sshPort.min='1';sshPort.max='65535';sshPort.value=n.ssh_port;sshPort.setAttribute('aria-label',`${n.name} SSH port`);controls.append(sshPort);
      const region=document.createElement('input');region.value=n.region;region.maxLength=40;region.setAttribute('aria-label',`${n.name} region`);controls.append(region);
      const capacity=document.createElement('input');capacity.type='number';capacity.min='1';capacity.max='100000';capacity.value=n.capacity;capacity.setAttribute('aria-label',`${n.name} capacity`);controls.append(capacity);
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=!!n.enabled;enabled.setAttribute('aria-label',`${n.name} enabled`);controls.append(enabled);
      button(controls,'Save network inventory',()=>request(`/api/admin/servers/${n.id}`,{host:host.value,sshUser:sshUser.value,sshPort:Number(sshPort.value),region:region.value,capacity:Number(capacity.value),enabled:enabled.checked},'PUT'));
      button(li,'Dump server inventory',async()=>{const payload=await get(`/api/admin/servers/${n.id}/dump`);const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=n.name+'-inventory.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
      if(can('manage'))button(controls,'Remove server',async()=>{if(window.confirm(`Retire ${n.name} from the managed fleet?`))await request(`/api/admin/servers/${n.id}`,{},'DELETE');});
      if(n.role==='switch'&&can('deploy')){
        const operations=document.createElement('div');li.append(operations);
        button(operations,'Check Kamailio health',()=>request(`/api/admin/servers/${n.id}/jobs`,{action:'health'}));
        button(operations,'Audit SIP and media readiness',()=>request(`/api/admin/servers/${n.id}/jobs`,{action:'sip_audit'}));
        button(operations,'Check and install SIP requirements',()=>request(`/api/admin/servers/${n.id}/jobs`,{action:'sip_packages'}));
        if(data.superAdmin){
          const observed=kamailio?.nodes?.find(row=>row.id===n.id);
          const fresh=observed?.created_at&&Date.now()-new Date(observed.created_at).getTime()<300000;
          const live=fresh&&observed?.signaling_status==='active'&&observed?.media_status==='active';
          const note=document.createElement('p');
          note.textContent=`Reported core: Kamailio ${observed?.signaling_status||'unknown'}, RTPengine ${observed?.media_status||'unknown'} · checked ${observed?.created_at||'never'} (${fresh?'recent':'stale or absent'}). Run a host audit before changing service state.`;
          operations.append(note);
          if(fresh&&!live)button(operations,'Activate reviewed SIP core',()=>{
            if(!window.confirm('Start the public SIP listener and RTPengine using reviewed private host files? Carrier calls and prepaid charging remain disabled.'))return;
            return request(`/api/admin/servers/${n.id}/jobs`,{action:'sip_core'});
          });
          if(live)button(operations,'Stop carrier-blocked SIP core',()=>{
            if(!window.confirm('Stop Kamailio and RTPengine on this switch? Registered extensions and active internal calls may disconnect. Carrier or prepaid production configurations are refused.'))return;
            return request(`/api/admin/servers/${n.id}/jobs`,{action:'sip_core_stop'});
          });
        }
        const interval=document.createElement('input');interval.type='number';interval.min='5';interval.max='10080';interval.value='60';interval.setAttribute('aria-label',`${n.name} schedule interval minutes`);controls.append(interval);
        operations.append(interval);
        button(operations,'Schedule health',()=>request(`/api/admin/servers/${n.id}/schedules`,{action:'health',intervalMinutes:Number(interval.value)}));
      }
    });
    list('fleet-schedules',data.schedules,(li,s)=>{
      li.append(document.createTextNode(`${data.nodes.find(n=>n.id===s.node_id)?.name||s.node_id} · ${s.action} every ${s.interval_minutes} min · next ${s.next_run_at} · ${s.enabled?'enabled':'paused'} `));
      if(can('deploy')){button(li,s.enabled?'Pause':'Resume',()=>request(`/api/admin/servers/schedules/${s.id}`,{enabled:!s.enabled,intervalMinutes:s.interval_minutes},'PUT'));
      button(li,'Delete',()=>request(`/api/admin/servers/schedules/${s.id}`,{},'DELETE'));}
    });
    list('fleet-jobs',data.jobs,(li,j)=>li.textContent=`${j.node_name} · ${j.action} · ${j.status} · ${j.created_at}${j.summary?' · '+j.summary:''}`);
    list('fleet-events',data.events,(li,e)=>li.textContent=`${e.created_at} · ${e.node_name||'fleet'} · ${e.category}: ${e.detail}`);
  }
  async function report(){const days=Number($('fleet-report-days').value);const data=await get(`/api/admin/servers/report?days=${days}`);
    $('fleet-report').textContent=`${data.health.length} servers; ${data.health.map(n=>`${n.name}: ${n.healthy_checks}/${n.checks} healthy, peak ${n.max_latency_ms??'—'} ms`).join('; ')}. ${data.jobs.map(j=>`${j.action} ${j.status}: ${j.count}`).join('; ')}`;
  }
  $('fleet-add').onsubmit=async e=>{e.preventDefault();try{const f=e.currentTarget;const b=Object.fromEntries(new FormData(f));await request('/api/admin/servers',{...b,sshPort:Number(b.sshPort),capacity:Number(b.capacity)});f.reset();await refresh();status.textContent='Server registered; prepare SSH and the private runner before installing.';}catch(error){status.textContent=error.message;}};
  $('fleet-report-settings').onsubmit=async e=>{e.preventDefault();try{const b=Object.fromEntries(new FormData(e.currentTarget));await request('/api/admin/servers/report-settings',{staleSeconds:Number(b.staleSeconds),warningLatencyMs:Number(b.warningLatencyMs),retentionDays:Number(b.retentionDays)},'PUT');await report();status.textContent='Report thresholds saved.';}catch(error){status.textContent=error.message;}};
  $('fleet-refresh').onclick=()=>refresh().catch(e=>status.textContent=e.message);
  $('fleet-report-run').onclick=()=>report().catch(e=>status.textContent=e.message);
  return {refresh:()=>Promise.all([refresh(),report()]).catch(e=>status.textContent=e.message)};
}
