export function setupKamailioAdmin(){
  const root=document.querySelector('#switch-admin'),form=root.querySelector('form'),status=root.querySelector('[role=status]'),body=root.querySelector('tbody');
  let data={catalog:{modules:[]},nodes:[],plans:[],audits:[]},canEdit=false;
  const choices=new Map();
  function render(){
    const audit=data.audits.find(a=>a.node_id===form.elements.node.value)?.report;
    const fresh=!!audit&&Date.now()-Date.parse(audit.checkedAt)<=86400000;
    const facts=new Map((audit?.features||[]).map(f=>[f.id,f]));body.replaceChildren();
    for(const m of data.catalog.modules){
      const fact=facts.get(m.id),state=fresh?fact?.status||'pending':'pending';
      if(!m.id.includes(form.elements.search.value.toLowerCase())||(form.elements.filter.value&&state!==form.elements.filter.value))continue;
      const choice=choices.get(m.id)||{install:false,enable:false},row=document.createElement('tr');
      const cell=value=>{const c=document.createElement('td');c.textContent=value;row.append(c);return c;};
      cell(m.id);cell(m.maturity);
      for(const key of ['install','enable']){
        const c=cell(''),input=document.createElement('input');input.type='checkbox';input.checked=choice[key];input.disabled=!canEdit;input.setAttribute('aria-label',key+' '+m.id);
        input.onchange=()=>{choice[key]=input.checked;if(key==='enable'&&input.checked)choice.install=true;if(key==='install'&&!input.checked)choice.enable=false;choices.set(m.id,choice);render();};c.append(input);
      }
      cell(fresh?(fact?.installed?'yes':'no'):'unknown');cell(state);cell(fresh?fact?.testId||'Acceptance pending':'Fresh audit required');
      const link=document.createElement('a');link.href=m.documentation;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Guide';cell('').append(link);body.append(row);
    }
    const servers=root.querySelector('#service-inventory');servers.replaceChildren();
    for(const service of data.serviceInventory?.services||[]){const li=document.createElement('li');li.textContent=service.name+' · '+(service.active?'process running':'process pending')+' · '+(service.transportConnected?'transport connected':'transport pending')+' · '+Object.entries(service.capabilities).map(([k,v])=>k+': '+v).join(' · ');servers.append(li);}
    if(!servers.children.length){const li=document.createElement('li');li.textContent=data.serviceInventory?.reason||'Super administrator service inventory unavailable';servers.append(li);}
    const readiness=root.querySelector('#carrier-readiness');readiness.replaceChildren();
    for(const f of data.carrierCapabilities?.features||[]){const li=document.createElement('li');li.textContent=f.name+' · '+f.status+' · '+(f.applicationIntegration?'Application integration exists; ':'')+f.reason;readiness.append(li);}
    const history=root.querySelector('#kamailio-history');history.replaceChildren();
    for(const p of data.plans.filter(p=>p.node_id===form.elements.node.value)){const li=document.createElement('li');li.textContent=p.created_at+' · '+p.profile+' · '+p.status+' · '+p.summary;history.append(li);}
    status.textContent=data.catalog.modules.length+' capabilities tracked. '+(fresh?'Fresh audit: '+audit.checkedAt:'Server evidence pending or expired.');
  }
  async function refreshProvisioning(){
    const status=root.querySelector('#sip-provisioning-status'),list=root.querySelector('#sip-provisioning-accounts');
    try{
      const response=await fetch('/api/admin/sip-provisioning',{credentials:'same-origin'}),result=await response.json();
      if(!response.ok)throw new Error(result.error);
      status.textContent=result.configured?'Automatic provisioning configured ('+result.mode+'). Verified and active accounts sync automatically.':'Pending configuration: commission the local Kamailio authentication backend or configure the HTTPS adapter, plus the credential encryption key.';
      list.replaceChildren();
      for(const a of result.accounts){const li=document.createElement('li');li.textContent=a.email+' · '+a.username+'@'+a.domain+' · '+a.status+' · '+(a.last_result||'queued')+' · attempts '+(a.attempts||0);list.append(li);}
    }catch(error){status.textContent=error.message;}
  }
  root.querySelector('#sip-provisioning-retry').onclick=async()=>{
    const response=await fetch('/api/admin/sip-provisioning/retry',{method:'POST',credentials:'same-origin'});
    if(response.ok){await refreshProvisioning();root.querySelector('#sip-provisioning-status').textContent='Pending accounts queued for the next automatic sync.';}
    else root.querySelector('#sip-provisioning-status').textContent='Retry request failed';
  };
  async function refresh(edit=canEdit){
    await refreshProvisioning();
    canEdit=edit;
    for(const button of form.querySelectorAll('button'))button.disabled=!canEdit;
    try{const response=await fetch('/api/admin/kamailio',{credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.error);data=result;
      const node=form.elements.node,selected=node.value;node.replaceChildren();
      for(const n of data.nodes){const o=document.createElement('option');o.value=n.id;o.textContent=n.name+' · '+n.host;node.append(o);}if([...node.options].some(o=>o.value===selected))node.value=selected;render();
    }catch(e){status.textContent=e.message;}
  }
  form.elements.node.onchange=()=>{choices.clear();render();};
  form.elements.search.oninput=render;form.elements.filter.onchange=render;
  root.querySelector('#kamailio-select').onclick=()=>{for(const m of data.catalog.modules)if(m.maturity==='released')choices.set(m.id,{install:true,enable:true});render();status.textContent='Released capabilities selected. The controller rejects incompatible or unsupported combinations.';};
  root.querySelector('#kamailio-same-server').onclick=()=>{choices.clear();for(const id of data.sameServerModules||[])choices.set(id,{install:true,enable:true});form.elements.profile.value='same-server';render();status.textContent='Same-server profile selected. Register this application host as an enabled switch node. A private controller profile and reviewed configurations must be installed before queuing.';};
  root.querySelector('#kamailio-same-server-trunk').onclick=()=>{choices.clear();for(const id of data.sameServerTrunkModules||[])choices.set(id,{install:true,enable:true});form.elements.profile.value='same-server-trunk';render();status.textContent='Carrier trunk profile selected. The private profile must include trusted carrier routes, authentication, failover and accounting configuration; traffic requires acceptance tests.';};
  root.querySelector('#kamailio-same-server-mail').onclick=()=>{choices.clear();for(const id of data.sameServerTrunkModules||[])choices.set(id,{install:true,enable:true});form.elements.profile.value='same-server-mail';render();status.textContent='Combined profile selected. Mail commissioning requires private Postfix/Dovecot/Rspamd configurations, mailbox authentication, TLS and public DNS. Verification delivery remains on its configured provider until tested.';};
  root.querySelector('#kamailio-carrier-grade').onclick=()=>{choices.clear();for(const id of data.sameServerTrunkModules||[])choices.set(id,{install:true,enable:true});form.elements.profile.value='carrier-grade';render();status.textContent='Carrier profile selected. Deployment requires current host-bound evidence for registration, carrier calls, media, billing, fraud, email, monitoring, restore, failover and 500 concurrent calls. Missing evidence fails the production gate.';};
  root.querySelector('#kamailio-freeswitch-cluster').onclick=()=>{choices.clear();for(const id of data.sameServerTrunkModules||[])choices.set(id,{install:true,enable:true});form.elements.profile.value='same-server-freeswitch-cluster';render();status.textContent='Two FreeSWITCH backends selected: fs2 SIP 5092 / media 40000–44999; fs3 SIP 5093 / media 45000–49999. Requires private pinned image, authenticated dialplans and Kamailio dispatcher routing. Call acceptance and host failover remain pending.';};
  root.querySelector('#kamailio-same-server-pbx').onclick=()=>{choices.clear();for(const id of data.sameServerTrunkModules||[])choices.set(id,{install:true,enable:true});form.elements.profile.value='same-server-pbx';render();status.textContent='PBX profile selected. Requires pinned Asterisk release and reviewed private PJSIP/dialplan/voicemail/queue/conference configuration. GUI PBX policy requires a commissioned adapter; module installation is not feature acceptance.';};
  root.querySelector('#kamailio-clear').onclick=()=>{choices.clear();render();};
  root.querySelector('#kamailio-refresh').onclick=()=>refresh();
  root.querySelector('#kamailio-export').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kamailio-inventory.json';a.click();URL.revokeObjectURL(url);};
  form.onsubmit=async e=>{e.preventDefault();try{
    const modules=[...choices].map(([id,flags])=>({id,...flags}));
    if(!modules.length)throw new Error('Choose at least one capability');
    const response=await fetch('/api/admin/kamailio/plans',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId:form.elements.node.value,profile:form.elements.profile.value,modules})});
    const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();status.textContent=result.message;
  }catch(error){status.textContent=error.message;}};
  return {refresh};
}
