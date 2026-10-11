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
      summary.textContent=`${readiness.activeAccounts} active accounts, ${readiness.syncedCredentials} digest credentials, ${readiness.enabledCarriers} enabled carrier mappings. ${readiness.blockers.join(' · ')}`;
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
      status.textContent=fleet.runnerConfigured
        ?'Host actions queue private runner jobs. Refresh after each job; service status alone does not verify carrier calls, media or charging.'
        :'Private deployment runner is unavailable. Configure it on the server before queuing host actions.';
    }catch(error){status.textContent=error.message;}
  }
  $('kamailio-operations-refresh').onclick=refresh;
  return {refresh};
}
