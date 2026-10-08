const $ = (selector) => document.querySelector(selector);
async function api(path,method="GET",body) {
  const response = await fetch(path,{method,credentials:"same-origin",
    headers:body === undefined ? {} : {"Content-Type":"application/json"},
    body:body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "PBX request failed");
  return data;
}
function options(select,rows,label) {
  const prior = select.value;
  select.replaceChildren();
  for (const row of rows) {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = label(row);
    select.append(option);
  }
  if (rows.some((row) => row.id === prior)) select.value = prior;
}
function list(container,rows,label) {
  container.replaceChildren();
  for (const row of rows) {
    const li = document.createElement("li");
    li.textContent = label(row);
    container.append(li);
  }
}
export function setupPbx() {
  const status = $("#pbx-status");
  let queues = [], agents = [], trunks = [], destinations = [];
  const report = (error) => { status.textContent = error.message; };
  async function refreshSelf(user) {
    const [extension,presence] = await Promise.all([
      api("/api/pbx/my-extension"),api("/api/pbx/agent-status")
    ]);
    $("#my-extension").textContent = extension.extension
      ? `Assigned extension ${extension.extension.number} (${extension.extension.name})` : "No extension assigned";
    const own = presence.agents?.find((agent) => agent.id === user.id);
    $("#agent-presence").value = own?.status || presence.status || "offline";
  }
  async function refreshAdmin() {
    const [overview,extensionData,queueData,agentData,routeData,trunkData,rateData,policyData] = await Promise.all([
      api("/api/pbx/overview"),api("/api/pbx/extensions"),api("/api/pbx/queues"),
      api("/api/pbx/agent-status"),api("/api/pbx/inbound-routes"),
      api("/api/pbx/trunks"),api("/api/pbx/rates"),api("/api/pbx/outbound-policies")
    ]);
    queues = queueData.queues; agents = agentData.agents; trunks = trunkData.trunks;
    destinations = [...extensionData.extensions.map((d) => ({...d,kind:"extension"})),
      ...queues.map((d) => ({...d,kind:"queue"}))];
    $("#pbx-overview").textContent = `${overview.extensions} extensions, ${overview.queues} queues, ${overview.inbound_routes} DID routes, ${overview.trunks} trunk plans. ${overview.note}`;
    options($("#pbx-extension-user"),[{id:"",name:"Unassigned"},...agents],(a) => a.name);
    options($("#pbx-queue-select"),queues,(q) => `${q.number} ${q.name}`);
    options($("#pbx-route-destination"),destinations,(d) => `${d.number} ${d.name} (${d.kind})`);
    options($("#pbx-rate-trunk"),trunks,(t) => t.name);
    list($("#pbx-extension-list"),extensionData.extensions,(e) => `${e.number} ${e.name}${e.user_id ? " — assigned" : " — unassigned"}`);
    list($("#pbx-route-list"),routeData.routes,(r) => `${r.did_e164} → ${r.destination_number} ${r.destination_name}`);
    list($("#pbx-rate-list"),rateData.rates,(r) => `${r.prefix}: ${r.trunk_name}, cost ${r.cost_cents_per_minute}¢/min, price ${r.price_cents_per_minute}¢/min`);
    const policyList=$("#pbx-policy-list"); policyList.replaceChildren();
    for (const policy of policyData.policies) {
      const item=document.createElement("li");
      const remove=document.createElement("button");
      remove.type="button"; remove.textContent="Remove";
      remove.onclick=async () => {
        try { await api(`/api/pbx/outbound-policies/${policy.id}`,"DELETE"); await refreshAdmin(); }
        catch(error) {report(error);}
      };
      item.append(document.createTextNode(`${policy.prefix}: ${policy.action} ${policy.reason} — `),remove);
      policyList.append(item);
    }
    const trunkList = $("#pbx-trunk-list"); trunkList.replaceChildren();
    for (const trunk of trunks) {
      const item = document.createElement("li");
      const check=document.createElement('input');check.type='checkbox';check.value=trunk.id;check.setAttribute('aria-label',`Select ${trunk.name}`);
      item.append(check,document.createTextNode(` ${trunk.name} · ${trunk.host}:${trunk.port}/${trunk.transport} · priority ${trunk.priority} · ${trunk.enabled?'preview enabled':'preview disabled'} · ${trunk.rate_count} rates · ${trunk.carrier_count} carrier links · revision ${trunk.revision} `));
      const button=(label,fn)=>{const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=async()=>{el.disabled=true;try{await fn();}catch(error){report(error);}finally{el.disabled=false;}};item.append(el);};
      button('Edit',async()=>{const form=$('#pbx-trunk-form');for(const [key,value] of Object.entries({trunkId:trunk.id,revision:trunk.revision,name:trunk.name,host:trunk.host,port:trunk.port,transport:trunk.transport,priority:trunk.priority}))form.elements[key].value=value;form.scrollIntoView({block:'center'});$('#pbx-trunk-detail').textContent=`Editing ${trunk.name}; save to apply a new revision.`;});
      button(trunk.enabled?'Disable preview':'Enable preview',async()=>{await api(`/api/pbx/trunks/${trunk.id}/status`,'PUT',{enabled:!trunk.enabled,revision:Number(trunk.revision)});await refreshAdmin();status.textContent='Preview status saved. No live carrier change was made.';});
      button('History',async()=>{const data=await api(`/api/pbx/trunks/${trunk.id}/history`);$('#pbx-trunk-detail').textContent=data.events.map(e=>`${e.action} · ${new Date(e.created_at).toLocaleString()} · ${e.actor_id}`).join(' | ')||'No events.';});
      button('Export',async()=>{const data=await api(`/api/pbx/trunks/${trunk.id}/export`),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`trunk-${trunk.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#pbx-trunk-detail').textContent='Downloaded a credential-free trunk record.';});
      button('Delete',async()=>{if(!window.confirm(`Delete ${trunk.name}? Linked rates and carrier profiles must be removed first.`))return;await api(`/api/pbx/trunks/${trunk.id}`,'DELETE');await refreshAdmin();status.textContent='Unlinked trunk deleted. History remains available by ID.';});
      trunkList.append(item);
    }
    renderMembers();
  }
  function renderMembers() {
    const selected = queues.find((q) => q.id === $("#pbx-queue-select").value);
    const root = $("#pbx-members"); root.replaceChildren();
    for (const agent of agents) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox"; checkbox.value = agent.id;
      checkbox.checked = !!selected?.members.some((member) => member.user_id === agent.id);
      label.append(checkbox,document.createTextNode(` ${agent.name} (${agent.status})`));
      root.append(label);
    }
  }
  $("#pbx-queue-select").onchange = renderMembers;
  $("#agent-status-form").addEventListener("submit",async (event) => {
    event.preventDefault();
    try {
      const value = $("#agent-presence").value;
      await api("/api/pbx/agent-status","POST",{status:value});
      $("#agent-status-result").textContent = `Availability set to ${value}; this is not SIP registration.`;
      if (!$("#admin").hidden) await refreshAdmin();
    } catch (error) {$("#agent-status-result").textContent = error.message;}
  });
  async function formHandler(id,path,build) {
    $(id).addEventListener("submit",async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api(path,"POST",build(form));
        form.reset(); await refreshAdmin(); status.textContent = "PBX configuration saved. Switch provisioning is not connected.";
      } catch (error) {report(error);}
    });
  }
  formHandler("#pbx-extension-form","/api/pbx/extensions",(form) => ({
    number:form.elements.number.value,name:form.elements.name.value,
    userId:form.elements.userId.value || null,voicemailEnabled:form.elements.voicemailEnabled.checked,
    forwardTo:form.elements.forwardTo.value || null
  }));
  formHandler("#pbx-queue-form","/api/pbx/queues",(form) => ({
    number:form.elements.number.value,name:form.elements.name.value,
    strategy:form.elements.strategy.value,maxWaitSeconds:Number(form.elements.maxWaitSeconds.value)
  }));
  formHandler("#pbx-route-form","/api/pbx/inbound-routes",(form) => ({
    did:form.elements.did.value,destinationId:form.elements.destinationId.value
  }));
  const trunkForm=$('#pbx-trunk-form');
  $('#pbx-trunk-cancel').onclick=()=>{trunkForm.reset();trunkForm.elements.trunkId.value='';trunkForm.elements.revision.value='';$('#pbx-trunk-detail').textContent='New trunk draft.';};
  trunkForm.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,body={name:f.elements.name.value,host:f.elements.host.value,port:Number(f.elements.port.value),transport:f.elements.transport.value,priority:Number(f.elements.priority.value)};
    try{const id=f.elements.trunkId.value;if(id)await api(`/api/pbx/trunks/${id}`,'PUT',{...body,revision:Number(f.elements.revision.value)});else await api('/api/pbx/trunks','POST',body);
      $('#pbx-trunk-cancel').click();await refreshAdmin();status.textContent='Trunk plan saved; no live SIP connection was made.';
    }catch(error){report(error);}};
  $('#pbx-trunks-refresh').onclick=()=>refreshAdmin().catch(report);
  for(const [id,enabled] of [['pbx-trunks-enable',true],['pbx-trunks-disable',false]])$("#"+id).onclick=async()=>{const rows=[...$('#pbx-trunk-list').querySelectorAll('input:checked')].map(x=>{const t=trunks.find(t=>t.id===x.value);return{id:t.id,revision:Number(t.revision)};});
    if(!rows.length){status.textContent='Select trunks first.';return;}
    try{await api('/api/pbx/trunks/batch','PUT',{trunks:rows,enabled});await refreshAdmin();status.textContent=`${rows.length} trunk preview states saved atomically. No switch change was made.`;}catch(error){report(error);}};
  formHandler("#pbx-rate-form","/api/pbx/rates",(form) => ({
    prefix:form.elements.prefix.value,trunkId:form.elements.trunkId.value,
    costCentsPerMinute:Number(form.elements.cost.value),priceCentsPerMinute:Number(form.elements.price.value)
  }));
  formHandler("#pbx-policy-form","/api/pbx/outbound-policies",(form) => ({
    prefix:form.elements.prefix.value,action:form.elements.action.value,reason:form.elements.reason.value
  }));
  $("#pbx-save-members").onclick = async () => {
    const id = $("#pbx-queue-select").value;
    if (!id) return;
    try {
      const userIds = [...$("#pbx-members").querySelectorAll("input:checked")].map((input) => input.value);
      await api(`/api/pbx/queues/${id}/members`,"PUT",{userIds});
      await refreshAdmin(); status.textContent = "Queue members saved.";
    } catch (error) {report(error);}
  };
  $("#pbx-preview-queue").onclick = async () => {
    const id = $("#pbx-queue-select").value;
    if (!id) return;
    try {
      const {eligible} = await api(`/api/pbx/queues/${id}/preview`);
      status.textContent = `Simulation: ${eligible.length ? eligible.map((a) => agents.find((u) => u.id === a.user_id)?.name || a.user_id).join(", ") : "no ready agents"}. No call was placed.`;
    } catch (error) {report(error);}
  };
  $("#pbx-route-preview-form").addEventListener("submit",async (event) => {
    event.preventDefault();
    try {
      const number = event.currentTarget.elements.number.value;
      const {route,blocked,policy} = await api("/api/pbx/route-preview?number=" + encodeURIComponent(number));
      status.textContent = blocked ? `Simulation: blocked by prefix ${policy.prefix}. No call was placed.` :
        route ? `Simulation: ${route.trunk_name} via prefix ${route.prefix}, price ${route.price_cents_per_minute}¢/min. No call was placed.` : "No enabled route in the preview.";
    } catch (error) {report(error);}
  });
  return {refreshSelf,refreshAdmin};
}
