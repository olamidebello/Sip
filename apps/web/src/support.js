const $=id=>document.getElementById(id);
const el=(tag,label)=>{const node=document.createElement(tag);node.textContent=label;return node;};
export function setupSupport({get,request}) {
  let admin=false,page=1,selected=null,hasMore=false,requestSerial=0,epoch=0;
  async function openTicket(id) {
    const token=++requestSerial,viewerEpoch=epoch;
    const {ticket,replies,history}=await get(`/api/support/tickets/${encodeURIComponent(id)}`);
    if(token!==requestSerial || viewerEpoch!==epoch) return;
    selected=ticket.id;$("support-detail").hidden=false;
    $("support-title").textContent=ticket.subject;
    $("support-meta").textContent=`${ticket.category} · ${ticket.priority} · ${ticket.status} · created ${new Date(ticket.created_at).toLocaleString()}`;
    $("support-description").textContent=ticket.description;
    const list=$("support-replies");list.replaceChildren(...replies.map(reply=>
      el("li",`${reply.author_name} · ${new Date(reply.created_at).toLocaleString()}${reply.internal_note?" · internal note":""}: ${reply.body}`)));
    $("support-history").replaceChildren(...history.map(event=>el("li",
      `${event.actor_name} · ${new Date(event.created_at).toLocaleString()}: ${event.old_status} → ${event.new_status}, ${event.old_priority} → ${event.new_priority}`)));
    $("support-reply").hidden=ticket.status==="closed";
    if(admin) {
      const form=$("support-manage");form.hidden=false;
      form.elements.status.value=ticket.status;form.elements.priority.value=ticket.priority;
      form.elements.assigneeId.value=ticket.assignee_id??"";
    }else $("support-manage").hidden=true;
    $("support-detail").scrollIntoView({behavior:"smooth"});
  }
  async function listTickets() {
    const viewerEpoch=epoch;
    const params=new URLSearchParams(new FormData($("support-filter")));
    for(const [key,value] of [...params]) if(!value) params.delete(key);
    params.set("page",String(page));
    const result=await get(`/api/support/tickets?${params}`);hasMore=result.hasMore;
    if(viewerEpoch!==epoch) return;
    const list=$("support-list");list.replaceChildren();
    for(const ticket of result.tickets) {
      const item=document.createElement("li"),button=el("button",`${ticket.subject} · ${ticket.status} · ${ticket.priority} · ${new Date(ticket.updated_at).toLocaleString()}`);
      button.type="button";button.onclick=()=>openTicket(ticket.id).catch(error=>{$("support-status").textContent=error.message;});
      item.append(button);list.append(item);
    }
    if(!result.tickets.length) list.append(el("li","No tickets match these filters."));
    $("support-prev").disabled=page<=1;$("support-next").disabled=!hasMore;
    $("support-status").textContent=`Page ${page} · ${result.tickets.length} tickets shown`;
  }
  async function refresh(isAdmin=false) {
    ++requestSerial;++epoch;const viewerEpoch=epoch;admin=isAdmin;selected=null;$("support-detail").hidden=true;
    $("search-results").replaceChildren();$("search-status").textContent="";
    $("support-note-control").hidden=!admin;
    $("support-manage").hidden=!admin;
    if(admin) {
      const {users}=await get("/api/admin/users");
      if(viewerEpoch!==epoch) return;
      const selection=$("support-manage").elements.assigneeId;
      selection.replaceChildren(new Option("Unassigned",""),...users.filter(user=>["admin","super_admin"].includes(user.role)&&user.status==="active")
        .map(user=>new Option(`${user.name} (${user.email})`,user.id)));
    }
    page=1;await listTickets();
  }
  $("support-create").onsubmit=async event=>{
    event.preventDefault();
    try {
      const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
      const {id}=await request("/api/support/tickets",data);form.reset();page=1;
      await listTickets();await openTicket(id);$("support-status").textContent="Ticket created.";
    }catch(error){$("support-status").textContent=error.message;}
  };
  $("support-filter").onsubmit=event=>{event.preventDefault();page=1;listTickets().catch(error=>{$("support-status").textContent=error.message;});};
  $("support-refresh").onclick=()=>listTickets().catch(error=>{$("support-status").textContent=error.message;});
  $("support-prev").onclick=()=>{if(page>1){page--;listTickets().catch(error=>{$("support-status").textContent=error.message;});}};
  $("support-next").onclick=()=>{if(hasMore&&page<100){page++;listTickets().catch(error=>{$("support-status").textContent=error.message;});}};
  $("support-reply").onsubmit=async event=>{
    event.preventDefault();
    try {
      const form=event.currentTarget,body=form.elements.body.value,internalNote=admin&&form.elements.internalNote.checked;
      await request(`/api/support/tickets/${selected}/replies`,{body,internalNote});
      form.reset();await openTicket(selected);await listTickets();$("support-status").textContent="Reply posted.";
    }catch(error){$("support-status").textContent=error.message;}
  };
  $("support-manage").onsubmit=async event=>{
    event.preventDefault();
    try {
      const form=event.currentTarget;
      await request(`/api/support/tickets/${selected}/manage`,{status:form.elements.status.value,
        priority:form.elements.priority.value,assigneeId:form.elements.assigneeId.value||null},"PUT");
      await openTicket(selected);await listTickets();$("support-status").textContent="Ticket controls saved.";
    }catch(error){$("support-status").textContent=error.message;}
  };
  $("global-search").onsubmit=async event=>{
    event.preventDefault();
    try {
      const viewerEpoch=epoch,params=new URLSearchParams(new FormData(event.currentTarget));
      const {results}=await get(`/api/search?${params}`);
      if(viewerEpoch!==epoch) return;
      const container=$("search-results");container.replaceChildren();
      for(const [category,items] of Object.entries(results)) {
        const group=document.createElement("section");group.append(el("h3",category[0].toUpperCase()+category.slice(1)));
        if(!items.length) group.append(el("p","No matches"));
        for(const item of items) {
          const button=el("button",item.subject??item.name??item.email);button.type="button";
          button.onclick=()=>{
            if(category==="tickets") {openTicket(item.id).catch(error=>{$("search-status").textContent=error.message;});location.hash="support";}
            if(category==="contacts") {const list=$("contact-list");list.value=item.id;list.dispatchEvent(new Event("change"));location.hash="chat";}
            if(category==="plans") {$("plans").value=item.id;location.hash="billing";}
          };
          group.append(button);
        }
        container.append(group);
      }
      $("search-status").textContent="Search complete; results are limited to visible app records.";
    }catch(error){$("search-status").textContent=error.message;}
  };
  function clear() {
    ++requestSerial;++epoch;selected=null;$("support-detail").hidden=true;
    $("support-list").replaceChildren();$("search-results").replaceChildren();
    $("support-status").textContent="";$("search-status").textContent="";
  }
  return {refresh,openTicket,clear};
}
