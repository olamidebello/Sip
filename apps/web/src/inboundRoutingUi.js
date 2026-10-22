export function setupInboundRoutingUi({document,get,request,isSuper,getUserId,show}){
 const admin=document.getElementById('admin');if(!admin)return;
 const box=document.createElement('details');box.id='inbound-routing-control';box.hidden=true;
 box.innerHTML='<summary>Inbound calls & message routing</summary><p>Choose the DID owner, another active user in this tenant, or block delivery. Voice controls apply to Flowroute inbound calls. Message controls apply to Flowroute SMS/MMS inbox delivery; SMS copies retain recipient chat/email preferences. Changes affect new deliveries.</p><button type="button" data-refresh>Refresh routes</button><p role="status" data-status></p><div data-routes></div><h4>Recent routing changes</h4><div data-events></div>';
 const shortcut=document.createElement('button');shortcut.type='button';shortcut.textContent='Inbound call & message routing';shortcut.hidden=true;admin.prepend(shortcut);admin.append(box);
 const status=box.querySelector('[data-status]'),routes=box.querySelector('[data-routes]');let generation=0,owner=null;
 const valid=g=>g===generation&&isSuper();
 async function load(){if(!isSuper())return;const g=++generation;status.textContent='Loading routes…';try{
  const data=await get('/api/admin/inbound-routing');if(!valid(g))return;routes.replaceChildren();
  const inventory=new Map();for(const item of data.inventory){if(!inventory.has(item.number_e164))inventory.set(item.number_e164,new Set());inventory.get(item.number_e164).add(item.user_id);}
  for(const [number,owners] of inventory){const section=document.createElement('fieldset'),title=document.createElement('legend');title.textContent=number;section.append(title);
   for(const channel of ['voice','sms']){const rule=data.rules.find(r=>r.number_e164===number&&r.channel===channel),row=document.createElement('div'),label=document.createElement('label'),action=document.createElement('select'),recipient=document.createElement('select');label.textContent=channel==='voice'?'Incoming calls: ':'Incoming messages: ';
    for(const [value,text] of [['owner','DID owner (default)'],['user','Route to user'],['block','Block delivery']]){const o=document.createElement('option');o.value=value;o.textContent=text;action.append(o);}action.value=rule?.action||'owner';
    for(const user of data.users){const o=document.createElement('option');o.value=user.id;o.textContent=user.display_name+' · '+user.email;recipient.append(o);}recipient.value=rule?.target_user_id||data.users[0]?.id||'';recipient.setAttribute('aria-label','Recipient for '+number+' '+channel);recipient.hidden=action.value!=='user';action.onchange=()=>{recipient.hidden=action.value!=='user';};
    const save=document.createElement('button');save.type='button';save.textContent='Save '+channel+' route';save.disabled=owners.size!==1;save.onclick=async()=>{if(!valid(g))return;save.disabled=true;try{await request('/api/admin/inbound-routing',{number,channel,action:action.value,targetUserId:recipient.value,version:Number(rule?.version||0)},'PUT');if(valid(g))await load();}catch(e){if(valid(g)){status.textContent=e.message;save.disabled=false;}}};
    const test=document.createElement('button');test.type='button';test.textContent='Test saved route';test.onclick=async()=>{if(!valid(g))return;try{const r=await request('/api/admin/inbound-routing/test',{number,channel});if(valid(g))status.textContent=number+' '+channel+': '+(r.route.userId?(data.users.find(u=>u.id===r.route.userId)?.display_name||r.route.userId):r.route.reason)+' (simulation; no call or message sent)';}catch(e){if(valid(g))status.textContent=e.message;}};
    label.append(action);row.append(label,recipient,save,test);section.append(row);
   }
   if(owners.size!==1){const p=document.createElement('p');p.textContent='Conflicting DID ownership: resolve assignments before saving.';section.append(p);}routes.append(section);
  }
  const history=box.querySelector('[data-events]');history.replaceChildren();for(const event of data.events){const p=document.createElement('p');p.textContent=event.created_at+' · '+event.number_e164+' · '+event.channel+' · '+event.action+' · recipient '+(event.target_user_id||'none')+' · by '+event.actor_id;history.append(p);}status.textContent=inventory.size+' DID numbers. '+data.scope;
 }catch(e){if(valid(g))status.textContent=e.message;}}
 shortcut.onclick=()=>{if(!isSuper())return;show('admin');box.open=true;box.scrollIntoView?.({block:'start'});void load();};box.querySelector('[data-refresh]').onclick=load;box.ontoggle=()=>{if(box.open)void load();};
 function visibility(){const id=isSuper()?getUserId():null;if(owner!==id){owner=id;generation++;routes.replaceChildren();box.querySelector('[data-events]').replaceChildren();status.textContent='';}box.hidden=!isSuper();shortcut.hidden=!isSuper();}
 const timer=setInterval(visibility,1500);visibility();return {dispose(){clearInterval(timer);generation++;box.remove();shortcut.remove();}};
}
