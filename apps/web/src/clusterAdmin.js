export function setupClusterAdmin({get,request}){
  const $=id=>document.getElementById(id);
  const status=$('cluster-status'),capacityStatus=$('cluster-capacity-status');
  let editable=false;
  let nodeConfigs=new Map();
  function selectNode(){
    const form=$('kamailio-config-form'),row=nodeConfigs.get(form.elements.nodeId.value);
    form.elements.sipDomain.value=row?.sip_domain||'';
    form.elements.maxConcurrentCalls.value=row?.max_concurrent_calls||100;
    $('kamailio-config-preview').textContent=row?
      'Saved revision '+row.revision+' · SIP '+row.listen_ip+':'+row.listen_port+
      ' · API '+row.api_url+' · media '+row.media_socket:'No saved revision for this node.';
  }
  async function refreshKamailio(){
    const panel=$('kamailio-monitor'),status=$('kamailio-monitor-status');
    panel.hidden=!editable;
    $('kamailio-config-panel').hidden=!editable;
    if(!editable)return;
    try{
      const [data,config]=await Promise.all([get('/api/admin/servers/kamailio'),
        get('/api/admin/servers/kamailio-config')]);
      nodeConfigs=new Map(config.configs.map(row=>[row.node_id,row]));
      const selector=$('kamailio-config-form').elements.nodeId,old=selector.value;
      selector.replaceChildren();
      for(const node of data.nodes.filter(node=>node.enabled)){
        const option=document.createElement('option');option.value=node.id;
        option.textContent=node.name+' · '+node.region;selector.append(option);
      }
      if([...selector.options].some(option=>option.value===old))selector.value=old;
      $('kamailio-config-form').querySelector('button').disabled=!selector.value;
      selectNode();
      const revisions=$('kamailio-config-history');revisions.replaceChildren();
      for(const row of config.history){
        const li=document.createElement('li');
        li.textContent='Revision '+row.revision+' · '+row.sip_domain+' · '+
          row.max_concurrent_calls+' calls · '+row.created_at;revisions.append(li);
      }
      const list=$('kamailio-monitor-nodes');list.replaceChildren();
      for(const node of data.nodes){
        const li=document.createElement('li');
        const fresh=node.created_at&&Date.now()-new Date(node.created_at).getTime()<300000;
        li.append(document.createTextNode(node.name+' · '+node.region+
          ' · Kamailio '+(fresh?node.signaling_status:'unverified')+
          ' · RTPengine '+(fresh?node.media_status:'unverified')+
          ' · version '+(node.version||'unknown')+' · '+(fresh?'recent':'stale or absent')+' '));
        const test=document.createElement('button');
        test.type='button';test.textContent='Test loopback SIP';test.disabled=!node.enabled;
        test.onclick=async()=>{
          test.disabled=true;
          try{
            const job=await request('/api/admin/servers/'+node.id+'/jobs',{action:'kamailio_test'});
            status.textContent='SIP test queued as job '+job.id+'. Refresh to view its result in Server operations.';
          }catch(error){status.textContent=error.message;}
          finally{test.disabled=!node.enabled;}
        };
        li.append(test);list.append(li);
      }
      if(!data.nodes.length)status.textContent='No switch hosts are registered in Server operations.';
      else status.textContent=data.scope;
    }catch(error){status.textContent=error.message;}
  }
  async function refresh(){
    try{
      const [cluster,capacity]=await Promise.all([
        get('/api/admin/cluster'),get('/api/admin/cluster/capacity')]);
      editable=cluster.editable&&capacity.editable;
      const state=cluster.state;
      $('cluster-summary').textContent='API replicas: requested '+state.desired_api_replicas+
        ', observed '+(state.observed_api_replicas??'unknown')+
        '. '+cluster.scope+(state.last_error?' Last error: '+state.last_error:'');
      $('cluster-scale').elements.apiReplicas.value=state.desired_api_replicas;
      $('cluster-scale').querySelectorAll('input,button').forEach(el=>el.disabled=!editable);
      const actions=$('cluster-history');actions.replaceChildren();
      for(const row of cluster.actions){
        const li=document.createElement('li');
        li.textContent='Revision '+row.revision+' · '+row.replicas+' replicas · '+
          row.status+' · '+row.created_at;
        actions.append(li);
      }
      const policy=capacity.policy,form=$('cluster-capacity-form');
      for(const [field,key] of [['targetCalls','target_calls'],['perNodeCalls','per_node_calls'],
        ['headroomPercent','headroom_percent'],['minRegions','min_regions']])
        form.elements[field].value=policy[key];
      form.querySelectorAll('input,button').forEach(el=>el.disabled=!editable);
      $('cluster-capacity-summary').textContent=
        'Plan: '+capacity.requiredCapacity+' call slots across at least '+
        capacity.requiredNodes+' nodes and '+policy.min_regions+' regions. Fresh healthy inventory: '+
        capacity.healthyNodes+' nodes, '+capacity.observedCapacity+' configured slots, '+
        capacity.observedRegions+' regions. Gap: '+capacity.shortfall+
        ' slots and '+capacity.regionsShortfall+' regions. '+capacity.scope;
      const history=$('cluster-capacity-history');history.replaceChildren();
      for(const row of capacity.history){
        const li=document.createElement('li');
        li.textContent='Revision '+row.revision+' · '+row.target_calls+
          ' calls · '+row.headroom_percent+'% headroom · '+row.created_at;
        history.append(li);
      }
      status.textContent='';
      capacityStatus.textContent='';
      await refreshKamailio();
    }catch(error){status.textContent=error.message;}
  }
  $('cluster-scale').onsubmit=async event=>{
    event.preventDefault();if(!editable)return;
    const button=event.currentTarget.querySelector('button');button.disabled=true;
    try{
      const value=Number(event.currentTarget.elements.apiReplicas.value);
      const result=await request('/api/admin/cluster/scale',{apiReplicas:value});
      await refresh();
      status.textContent=result.unchanged?'Replica target unchanged.':'Scaling request queued at revision '+result.revision+'.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=!editable;}
  };
  $('cluster-capacity-form').onsubmit=async event=>{
    event.preventDefault();if(!editable)return;
    const button=event.currentTarget.querySelector('button');button.disabled=true;
    try{
      const f=event.currentTarget;
      const body={targetCalls:Number(f.elements.targetCalls.value),
        perNodeCalls:Number(f.elements.perNodeCalls.value),
        headroomPercent:Number(f.elements.headroomPercent.value),
        minRegions:Number(f.elements.minRegions.value)};
      const result=await request('/api/admin/cluster/capacity',body,'PUT');
      await refresh();
      capacityStatus.textContent='Capacity policy saved at revision '+result.revision+
        '. Use Server operations to register and deploy switch nodes.';
    }catch(error){capacityStatus.textContent=error.message;}
    finally{button.disabled=!editable;}
  };
  $('cluster-refresh').onclick=refresh;
  $('cluster-capacity-refresh').onclick=refresh;
  $('kamailio-monitor-refresh').onclick=refreshKamailio;
  $('kamailio-config-form').elements.nodeId.onchange=selectNode;
  $('kamailio-config-form').onsubmit=async event=>{
    event.preventDefault();if(!editable)return;
    const form=event.currentTarget,nodeId=form.elements.nodeId.value;
    if(!nodeId)return;
    const button=form.querySelector('button');button.disabled=true;
    const status=$('kamailio-config-status');
    try{
      const saved=await request('/api/admin/servers/'+nodeId+'/kamailio-config',{
        sipDomain:form.elements.sipDomain.value.trim(),
        maxConcurrentCalls:Number(form.elements.maxConcurrentCalls.value),
        expectedRevision:Number(nodeConfigs.get(nodeId)?.revision||0)},'PUT');
      await refreshKamailio();
      status.textContent='Revision '+saved.revision+' saved as staged settings. No service was deployed.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=false;}
  };
  return {refresh};
}
