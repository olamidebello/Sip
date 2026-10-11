const $=id=>document.getElementById(id);
async function api(path,method='GET',body){
  const response=await fetch(path,{method,credentials:'same-origin',
    headers:body?{'Content-Type':'application/json'}:{},
    body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Kamailio request failed');
  return data;
}
export function setupKamailioOperations(){
  const status=$('kamailio-operations-status');
  const nodes=$('kamailio-operations-nodes');
  const summary=$('kamailio-operations-summary');
  const checks=$('kamailio-operations-checks');
  const jobs=$('kamailio-operations-jobs');
  const events=$('kamailio-operations-events');
  const updated=$('kamailio-operations-updated');
  const auto=$('kamailio-operations-auto');
  let timer;
  const actions=[
    ['health','Check Kamailio health'],
    ['kamailio_test','Test SIP challenges'],
    ['sip_audit','Audit SIP and RTPengine'],
    ['sip_packages','Install SIP prerequisites'],
    ['sip_core','Activate reviewed SIP core'],
    ['sip_core_stop','Stop carrier-blocked SIP core']
  ];
  async function refresh(){
    status.textContent='Loading Kamailio operations…';
    try{
      const [fleet,hosts,readiness]=await Promise.all([
        api('/api/admin/servers'),
        api('/api/admin/servers/kamailio'),
        api('/api/admin/switch/kamailio/readiness')
      ]);
      nodes.replaceChildren();
      summary.textContent=`${readiness.activeAccounts} active accounts, ${readiness.syncedCredentials} digest credentials, ${readiness.enabledCarriers} enabled carrier mappings. Production ready: no live acceptance has been recorded here.`;
      checks.replaceChildren();
      const checklist=[
        [readiness.activeAccounts>0,'Active SIP accounts'],
        [readiness.syncedCredentials>=readiness.activeAccounts&&readiness.activeAccounts>0,'Kamailio digest credentials'],
        [readiness.enabledCarriers>0,'Carrier gateway mapping'],
        [false,'Observed registration, two-way media, inbound and outbound carrier calls'],
        [false,'Observed prepaid expiry, CDR rating and carrier reconciliation']
      ];
      for(const [passed,label] of checklist){const li=document.createElement('li');li.textContent=`${passed?'Configured':'Pending'}: ${label}`;checks.append(li);}
      for(const reason of readiness.blockers){const li=document.createElement('li');li.textContent=`Blocker: ${reason}`;checks.append(li);}
      const switches=fleet.nodes.filter(node=>node.role==='switch'&&!node.deleted_at);
      if(!switches.length){
        const item=document.createElement('li');
        item.textContent='No registered switch hosts. Add a reviewed host in Server and network operations.';
        nodes.append(item);
      }
      for(const node of switches){
        const report=hosts.nodes.find(row=>row.id===node.id);
        const item=document.createElement('li');
        const title=document.createElement('p');
        title.textContent=`${node.name} (${node.region}): Kamailio ${report?.signaling_status||'unreported'}, RTPengine ${report?.media_status||'unreported'}; checked ${report?.created_at||'never'}`;
        item.append(title);
        const controls=document.createElement('div');controls.className='form-row';
        const fresh=report?.created_at&&Date.now()-new Date(report.created_at).getTime()<300000;
        const live=fresh&&report.signaling_status==='active'&&report.media_status==='active';
        for(const [action,label] of actions){
          const button=document.createElement('button');button.type='button';button.textContent=label;
          button.disabled=!node.enabled||!fleet.runnerConfigured||fleet.accessLevel!=='deploy'||
            (action==='sip_core'&&(!fresh||live))||
            (action==='sip_core_stop'&&!live);
          button.onclick=async()=>{
            if(['sip_core','sip_core_stop'].includes(action)&&!window.confirm(
              action==='sip_core'
                ?'Activate the reviewed SIP core on this host? This does not commission carrier routing or prepaid charging.'
                :'Stop Kamailio and RTPengine on this host? Registered users and active calls may disconnect.'
            ))return;
            button.disabled=true;
            try{
              const result=await api(`/api/admin/servers/${node.id}/jobs`,'POST',{action});
              await refresh();
              status.textContent=`${label} for ${node.name}: ${result.status||'queued'}. Review the job log before treating the host as ready.`;
            }catch(error){status.textContent=error.message;button.disabled=false;}
          };
          controls.append(button);
        }
        item.append(controls);nodes.append(item);
      }
      jobs.replaceChildren();
      for(const job of fleet.jobs.filter(job=>switches.some(node=>node.id===job.node_id)).slice(0,20)){
        const li=document.createElement('li');
        li.textContent=`${job.node_name||job.node_id} · ${job.action} · ${job.status} · ${job.created_at||''}${job.summary?' · '+job.summary:''}`;
        jobs.append(li);
      }
      events.replaceChildren();
      for(const event of fleet.events.filter(event=>!event.node_id||switches.some(node=>node.id===event.node_id)).slice(0,20)){
        const li=document.createElement('li');li.textContent=`${event.created_at} · ${event.node_name||'fleet'} · ${event.category}: ${event.detail}`;events.append(li);
      }
      updated.textContent=`Last refreshed ${new Date().toLocaleString()}`;
      status.textContent=fleet.runnerConfigured
        ?'Host actions queue private runner jobs. Refresh after each job; service status alone does not verify carrier calls, media or charging.'
        :'Private deployment runner is unavailable. Configure it on the server before queuing host actions.';
    }catch(error){status.textContent=error.message;}
  }
  $('kamailio-operations-refresh').onclick=refresh;
  auto.onchange=()=>{
    if(timer)clearInterval(timer);
    timer=auto.checked?setInterval(()=>{
      if(!document.hidden&&!$('kamailio-ops-admin').closest('[hidden]'))refresh();
    },30000):undefined;
  };
  return {refresh};
}
