const TILES={dialer:["Dialer","softphone-tools"],messages:["Messages","chat"],billing:["Plans & billing","billing"],
  meetings:["Meetings","meetings"],agent:["Call center","agent-panel"],admin:["Administration","admin"],reports:["Reports","report-admin"]};
const $=id=>document.getElementById(id);

export function setupDashboard({get,request}) {
  let state,administrator=false;
  function options(container,selection,available) {
    const list=$(container);list.replaceChildren();
    for(const tile of available) {
      const row=document.createElement("div");row.className="dashboard-option";
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
      const link=document.createElement("a");link.className="dashboard-tile";link.href=`#${target}`;link.textContent=title;tiles.append(link);
    }
    options("dashboard-personal-options",state.personalTiles??state.tiles,state.available);
    $("dashboard-save").disabled=$("dashboard-reset").disabled=!state.canOverride;
    options("dashboard-tenant-options",state.tenantTiles,Object.keys(TILES));
    $("dashboard-overrides").checked=state.allowUserOverride;
    $("dashboard-admin").hidden=!administrator;
  }
  async function refresh(admin=false) {
    administrator=admin;state=await get("/api/dashboard");render();
  }
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
