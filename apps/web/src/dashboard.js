const TILES={dialer:["Dialer","softphone-tools"],messages:["Messages","chat"],billing:["Plans & billing","billing"],
  meetings:["Meetings","meetings"],support:["Support","support"],agent:["Call center","agent-panel"],admin:["Administration","admin"],reports:["Reports","report-admin"]};
const $=id=>document.getElementById(id);

export function setupDashboard({get,request}) {
  let state,administrator=false,summary={},views=[];
  const statistic={messages:()=>`${summary.messages??0} account messages · ${summary.contacts??0} contacts`,
    billing:()=>`${summary.unpaidInvoices??0} unpaid invoices`,
    meetings:()=>`${summary.openMeetings??0} hosted rooms`,
    support:()=>`${summary.openTickets??0} active tickets`,
    admin:()=>`${summary.tenantUsers??0} tenant users`};
  function options(container,selection,available) {
    const list=$(container);list.replaceChildren();
    for(const tile of available) {
      const row=document.createElement("div");row.className="dashboard-option";
      row.draggable=true;row.dataset.tile=tile;
      row.ondragstart=event=>{event.dataTransfer.setData('text/plain',tile);event.dataTransfer.effectAllowed='move';};
      row.ondragover=event=>event.preventDefault();
      row.ondrop=event=>{event.preventDefault();const dragged=event.dataTransfer.getData('text/plain');
        const source=[...list.children].find(child=>child.dataset.tile===dragged);
        if(source&&source!==row)list.insertBefore(source,row);};
      const input=document.createElement("input");input.type="checkbox";input.value=tile;input.checked=selection.includes(tile);
      const label=document.createElement("label");label.append(input,document.createTextNode(" "+TILES[tile][0]));
      const up=document.createElement("button"),down=document.createElement("button");
      up.type=down.type="button";up.textContent="↑";down.textContent="↓";
      up.setAttribute("aria-label",`Move ${TILES[tile][0]} up`);down.setAttribute("aria-label",`Move ${TILES[tile][0]} down`);
      up.onclick=()=>{if(row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);};
      down.onclick=()=>{if(row.nextElementSibling)list.insertBefore(row.nextElementSibling,row);};
      row.append(label,up,down);list.append(row);
    }
  }
  function selected(container) {return [...$(container).querySelectorAll("input:checked")].map(input=>input.value);}
  function render() {
    const tiles=$("dashboard-tiles");tiles.replaceChildren();
    for(const tile of state.tiles) {
      const [title,target]=TILES[tile]??[];
      if(!title || $(target)?.closest("[hidden]")) continue;
      const link=document.createElement("a");link.className="dashboard-tile";link.href=`#${target}`;
      const heading=document.createElement("strong");heading.textContent=title;link.append(heading);
      if(statistic[tile]) {const detail=document.createElement("span");detail.textContent=statistic[tile]();link.append(detail);}
      tiles.append(link);
    }
    options("dashboard-personal-options",state.personalTiles??state.tiles,state.available);
    $("dashboard-save").disabled=$("dashboard-reset").disabled=!state.canOverride;
    options("dashboard-tenant-options",state.tenantTiles,Object.keys(TILES));
    $("dashboard-overrides").checked=state.allowUserOverride;
    $("dashboard-admin").hidden=!administrator;
    $("dashboard-view-create").elements.visibility.querySelector('option[value="tenant"]').disabled=!administrator;
    const list=$("dashboard-view-list");list.replaceChildren();
    for(const view of views){const li=document.createElement('li');li.textContent=`${view.name} · ${view.visibility} · version ${view.version} `;
      const use=document.createElement('button');use.type='button';use.textContent=view.id===state.selectedViewId?'Active':'Use';use.disabled=view.id===state.selectedViewId;use.onclick=async()=>{try{await request(`/api/dashboard/views/${view.id}/activate`,{});await refresh(administrator);}catch(e){$("dashboard-view-status").textContent=e.message;}};li.append(use);
      if(view.owner_id===currentOwner||view.visibility==='tenant'&&administrator){
        const edit=document.createElement('button');edit.type='button';edit.textContent='Replace with current layout';edit.onclick=async()=>{try{await request(`/api/dashboard/views/${view.id}`,{name:view.name,tiles:selected('dashboard-personal-options'),expectedVersion:view.version},'PUT');await refresh(administrator);}catch(e){$("dashboard-view-status").textContent=e.message;}};li.append(edit);
        const remove=document.createElement('button');remove.type='button';remove.textContent='Delete';remove.onclick=async()=>{try{await request(`/api/dashboard/views/${view.id}`,{},'DELETE');await refresh(administrator);}catch(e){$("dashboard-view-status").textContent=e.message;}};li.append(remove);
      }list.append(li);
    }
  }
  let currentOwner=null;
  async function refresh(admin=false) {
    administrator=admin;
    const [layout,stats,viewResult]=await Promise.all([get("/api/dashboard"),get("/api/dashboard/summary"),get('/api/dashboard/views')]);
    state=layout;summary=stats.summary;views=viewResult.views;currentOwner=viewResult.currentUserId;
    $("dashboard-updated").textContent=`App records updated ${new Date(stats.updatedAt).toLocaleString()}. No live switch or payment telemetry.`;
    render();
  }
  $("dashboard-refresh").onclick=()=>refresh(administrator).catch(error=>{$("dashboard-status").textContent=error.message;});
  $("dashboard-view-create").onsubmit=async e=>{e.preventDefault();try{const f=e.currentTarget;
    await request('/api/dashboard/views',{name:f.elements.name.value,visibility:f.elements.visibility.value,tiles:selected('dashboard-personal-options')});
    f.reset();await refresh(administrator);$("dashboard-view-status").textContent='Named dashboard saved.';
  }catch(error){$("dashboard-view-status").textContent=error.message;}};
  $("dashboard-view-default").onclick=async()=>{try{await request('/api/dashboard/views/active',{},'DELETE');await refresh(administrator);$("dashboard-view-status").textContent='Default layout active.';}catch(error){$("dashboard-view-status").textContent=error.message;}};
  $("dashboard-save").onclick=async()=>{
    try {
      const tiles=selected("dashboard-personal-options");
      await request("/api/dashboard",{tiles},"PUT");await refresh(administrator);
      $("dashboard-status").textContent="Personal dashboard saved.";
    }catch(error){$("dashboard-status").textContent=error.message;}
  };
  $("dashboard-reset").onclick=async()=>{
    try {await request("/api/dashboard",{},"DELETE");await refresh(administrator);$("dashboard-status").textContent="Tenant layout restored.";}
    catch(error){$("dashboard-status").textContent=error.message;}
  };
  $("dashboard-tenant-save").onclick=async()=>{
    try {
      await request("/api/admin/dashboard",{tiles:selected("dashboard-tenant-options"),allowUserOverride:$("dashboard-overrides").checked},"PUT");
      await refresh(administrator);$("dashboard-admin-status").textContent="Tenant dashboard saved.";
    }catch(error){$("dashboard-admin-status").textContent=error.message;}
  };
  return {refresh};
}
