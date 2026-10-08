export function setupWorkPlanner({get,request}){
  const $=id=>document.getElementById(id),status=$('planner-status'),form=$('planner-form');
  let items=[],viewerId=null;
  const iso=value=>value?new Date(value).toISOString():null;
  const local=value=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  const rows=value=>value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  function clear(){form.reset();form.elements.shares.disabled=false;form.elements.itemId.value='';form.elements.expectedVersion.value='';form.elements.status.value='parked';form.elements.kind.value='task';form.elements.shares.value='';form.elements.startAt.value='';form.elements.endAt.value='';toggle();}
  function toggle(){const scheduled=form.elements.status.value==='scheduled';form.elements.startAt.disabled=!scheduled;form.elements.startAt.required=scheduled;
    form.elements.endAt.disabled=!scheduled||form.elements.kind.value!=='event';form.elements.endAt.required=scheduled&&form.elements.kind.value==='event';}
  form.elements.kind.onchange=toggle;form.elements.status.onchange=toggle;
  const act=(li,label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();await refresh();status.textContent=label+' completed.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};li.append(b);};
  async function edit(item){const shares=await get(`/api/work/items/${item.id}/shares`);
    form.elements.itemId.value=item.id;form.elements.expectedVersion.value=item.version;form.elements.kind.value=item.kind;form.elements.title.value=item.title;
    form.elements.description.value=item.description;form.elements.status.value=item.status;
    form.elements.startAt.value=local(item.start_at);form.elements.endAt.value=local(item.end_at);
    form.elements.shares.value=shares.shares.map(s=>s.email).join('\n');form.elements.shares.disabled=item.creator_id!==viewerId;
    toggle();form.scrollIntoView({block:'center'});
  }
  function draw(){const list=$('planner-list');list.replaceChildren();const filter=$('planner-filter').value;
    for(const item of items.filter(i=>filter==='all'||filter==='shared'&&i.creator_id!==viewerId||filter===i.status)){
      const li=document.createElement('li');li.textContent=`${item.kind} · ${item.title} · ${item.status}${item.start_at?' · '+new Date(item.start_at).toLocaleString():''} · ${item.creator_name}${item.shared_permission?' · shared '+item.shared_permission:''} `;
      act(li,'View',async()=>{const shares=await get(`/api/work/items/${item.id}/shares`),history=await get(`/api/work/items/${item.id}/history`);
        $('planner-detail').textContent=`${item.description||'No description'} · Shared with: ${shares.shares.map(s=>s.display_name+' ('+s.permission+')').join(', ')||'nobody'} · History: ${history.events.map(e=>e.action+' '+e.created_at).join('; ')}`;});
      if(item.creator_id===viewerId||item.shared_permission==='edit'){
        act(li,'Edit',()=>edit(item));
        if(item.status==='parked')act(li,'Schedule',async()=>{await edit(item);form.elements.status.value='scheduled';toggle();status.textContent='Choose a future date, then save.';});
        if(item.status==='scheduled')act(li,'Complete',()=>request(`/api/work/items/${item.id}`,{kind:item.kind,title:item.title,description:item.description,status:'completed',startAt:null,endAt:null,expectedVersion:item.version},'PUT'));
      }
      if(item.creator_id===viewerId)act(li,'Delete',async()=>{if(window.confirm(`Remove ${item.title}?`))await request(`/api/work/items/${item.id}`,{},'DELETE');});
      list.append(li);
    }
  }
  async function refresh(){const data=await get('/api/work/items');items=data.items;viewerId=data.viewerId;draw();
    $('planner-summary').textContent=`${items.filter(i=>i.status==='scheduled').length} scheduled · ${items.filter(i=>i.status==='parked').length} parked · ${items.filter(i=>i.creator_id!==viewerId).length} shared with you`;
  }
  form.onsubmit=async event=>{event.preventDefault();try{const f=event.currentTarget;
    const body={kind:f.elements.kind.value,title:f.elements.title.value,description:f.elements.description.value,status:f.elements.status.value,
      startAt:f.elements.status.value==='scheduled'?iso(f.elements.startAt.value):null,
      endAt:f.elements.status.value==='scheduled'&&f.elements.kind.value==='event'?iso(f.elements.endAt.value):null};
    const id=f.elements.itemId.value;
    if(id){await request(`/api/work/items/${id}`,{...body,expectedVersion:Number(f.elements.expectedVersion.value)},'PUT');
      if(!f.elements.shares.disabled)await request(`/api/work/items/${id}/shares`,{shares:rows(f.elements.shares.value).map(email=>({email,permission:f.elements.sharePermission.value}))},'PUT');}
    else await request('/api/work/items',{...body,shares:rows(f.elements.shares.value).map(email=>({email,permission:f.elements.sharePermission.value}))});
    clear();await refresh();status.textContent='Saved. Shared users can see this item in their workspace.';
  }catch(e){status.textContent=e.message;}};
  $('planner-new').onclick=clear;$('planner-refresh').onclick=()=>refresh().catch(e=>status.textContent=e.message);
  $('planner-filter').onchange=draw;
  return {refresh:()=>refresh().catch(e=>status.textContent=e.message)};
}
