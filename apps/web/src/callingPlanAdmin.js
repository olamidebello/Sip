export async function renderCallingPlanAdmin({document,get,request,isSuperAdmin}) {
 const list=document.querySelector('#admin-plans');
 if(!list)return;
 let panel=document.querySelector('#default-calling-plan-admin');
 if(!isSuperAdmin){panel?.remove();return;}
 if(!panel){
  panel=document.createElement('section');panel.id='default-calling-plan-admin';
  panel.innerHTML=`<h4>Default calling plan</h4>
   <p>One-time allowance per user. Increasing minutes adds only the difference to existing grants and preserves used time. Decreasing minutes affects new grants; existing grants are retained.</p>
   <form><label>Plan name <input name="name" maxlength="100" required></label>
   <label>Description <textarea name="description" maxlength="1000"></textarea></label>
   <label>Included minutes <input name="minutes" type="number" min="1" max="60" step="1" required></label>
   <label><input name="active" type="checkbox"> Publish and enable starter plan</label>
   <p>Price: Free. Allowance does not renew monthly.</p>
   <button type="submit">Save calling plan</button>
   <button type="button" data-refresh>Refresh</button></form><p role="status"></p>`;
  list.before(panel);
 }
 const form=panel.querySelector('form'),status=panel.querySelector('[role="status"]');
 let revision;
 async function refresh(){
  const {plan}=await get('/api/admin/calling-plan');
  if(!plan)throw Error('Default calling plan is not installed');
  revision=Number(plan.revision);
  form.elements.name.value=plan.name;form.elements.description.value=plan.description;
  form.elements.minutes.value=plan.minutes;form.elements.active.checked=plan.active;
 }
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   await request('/api/admin/calling-plan',{name:form.elements.name.value,description:form.elements.description.value,minutes:Number(form.elements.minutes.value),active:form.elements.active.checked,expectedRevision:revision},'PUT');
   await refresh();status.textContent='Calling plan saved. Increased allowances applied without resetting usage.';
  }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
 };
 panel.querySelector('[data-refresh]').onclick=()=>refresh().then(()=>{status.textContent='Plan refreshed';}).catch(e=>{status.textContent=e.message;});
 try{await refresh();}catch(e){status.textContent=e.message;}
}
