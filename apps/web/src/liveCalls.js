export function setupLiveCalls({get,request}){
  const $=id=>document.getElementById(id);
  let timer=null,selected=null,enabled=false;
  const status=$('live-call-status'),list=$('live-call-list');
  async function history(id){
    selected=id;
    const data=await get(`/api/admin/live-calls/${encodeURIComponent(id)}/history`);
    $('live-call-detail').hidden=false;
    $('live-call-events').replaceChildren(...data.events.map(event=>{
      const li=document.createElement('li');li.textContent=`${event.event_type} · ${new Date(event.occurred_at).toLocaleString()}`;return li;}));
    $('live-call-notes').replaceChildren(...data.notes.map(note=>{
      const li=document.createElement('li');li.textContent=`${note.author}: ${note.body} · ${new Date(note.created_at).toLocaleString()}`;return li;}));
  }
  async function refresh(){
    if(!enabled||$('live-calls-admin').hidden)return;
    const data=await get('/api/admin/live-calls');
    const calls=data.calls||[];
    $('live-call-summary').textContent=`${calls.length} recently reported calls · ${calls.filter(call=>call.status==='answered').length} answered · ${data.source.recentEvents} signed events in five minutes`;
    status.textContent=data.source.feedReady?data.note:'Feed offline or idle: no signed events in five minutes. Check the local event forwarder and switch event producer; this is not proof that calls are idle.';
    list.replaceChildren(...calls.map(call=>{
      const li=document.createElement('li'),button=document.createElement('button');button.type='button';
      button.textContent=`${call.status} · ${call.direction} · ${call.caller} → ${call.callee} · ${call.source} · ${new Date(call.started_at).toLocaleString()}`;
      button.onclick=()=>history(call.id).catch(error=>{status.textContent=error.message;});li.append(button);return li;}));
    if(!calls.length){$('live-call-detail').hidden=true;selected=null;}
  }
  $('live-call-refresh').onclick=()=>refresh().catch(error=>{status.textContent=error.message;});
  $('live-call-auto').onchange=event=>{
    if(timer)clearInterval(timer);timer=null;
    if(event.target.checked)timer=setInterval(()=>refresh().catch(error=>{status.textContent=error.message;}),15000);
  };
  $('live-call-note-form').onsubmit=async event=>{
    event.preventDefault();if(!selected)return;
    const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{await request(`/api/admin/live-calls/${encodeURIComponent(selected)}/notes`,{body:form.elements.body.value});
      form.reset();await history(selected);status.textContent='Investigation note saved.';
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
  return {refresh,activate(){enabled=true;refresh().catch(error=>{status.textContent=error.message;});},clear(){enabled=false;selected=null;list.replaceChildren();$('live-call-detail').hidden=true;status.textContent='';
    if(timer)clearInterval(timer);timer=null;$('live-call-auto').checked=false;}};
}
