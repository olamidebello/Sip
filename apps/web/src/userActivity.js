export function setupUserActivity({get,request}){
  let enabled=false,admin=false,queue=[],busy=false,lastInteraction=0;
  const panel=document.getElementById('activity-monitor');
  const status=panel.querySelector('[role="status"]'),list=panel.querySelector('tbody');
  function category(id){if(/fleet|cluster|switch/.test(id))return 'fleet';if(/calling|geo|chat|sms|meeting|agent/.test(id))return 'calling';if(/product|billing|pricing|payment|catalog/.test(id))return 'commerce';if(/admin|credentials/.test(id))return 'administration';if(/account|locale|background/.test(id))return 'settings';if(/help|support/.test(id))return 'help';return 'workspace';}
  function track(type,id){if(enabled&&queue.length<20)queue.push({type,target:category(id)});}
  async function flush(){if(!enabled||busy||!queue.length)return;busy=true;const events=queue.splice(0,20);
    try{await request('/api/activity/events',{events});}catch{status.textContent='Activity reporting unavailable. Refresh to check the monitor.';}finally{busy=false;}}
  async function refresh(){if(!enabled)return;
    try{const data=await get(admin?'/api/admin/activity/events':'/api/activity/events');list.replaceChildren();
      for(const event of data.events){const row=document.createElement('tr');for(const value of [new Date(event.created_at).toLocaleString(),event.user_id,event.source,event.event_type,event.target,event.outcome]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}list.append(row);}
      status.textContent=`${data.events.length} recent events · ${data.scope==='tenant'?'Selected tenant':'Your account'} · ${data.retentionDays} day retention. Browser events are reported activity; server events are confirmed request outcomes.`;
    }catch(error){status.textContent=error.message;}}
  document.addEventListener('click',event=>{if(!enabled||!event.target.closest('button,a')||event.target.closest('#activity-monitor'))return;
    if(Date.now()-lastInteraction<1000)return;lastInteraction=Date.now();track('interaction',event.target.closest('section[id]')?.id||'workspace');});
  setInterval(flush,5000);
  setInterval(()=>{if(enabled&&!document.hidden)track('heartbeat','workspace');},60000);
  setInterval(()=>{if(enabled&&!panel.closest('[hidden]')&&!panel.classList.contains('workspace-inactive'))refresh();},30000);
  panel.querySelector('button').onclick=async()=>{await flush();await refresh();};
  return {track,refresh,start(role){enabled=true;admin=['admin','super_admin'].includes(role);queue=[];refresh();},stop(){enabled=false;queue=[];list.replaceChildren();status.textContent='';}};
}
