const panels={'telecom-feature-core-call-types':'call-types','telecom-feature-core-rate-groups':'rate-groups'};
export function setupTariffCatalog({document,get,request}){
 const states=new Map();
 for(const [target,kind] of Object.entries(panels)){
  const panel=document.getElementById(target),form=document.createElement('form');
  form.innerHTML='<h3>Manage application catalog</h3><p>These records organize this application. Live switch rating and synchronization with native Olamide SIP are pending.</p><label>Name <input name="entryName" maxlength="100" required></label><label>Description <textarea name="description" maxlength="1000"></textarea></label><label><input name="enabled" type="checkbox" checked> Enabled</label><button type="submit">Save</button><button type="button" class="catalog-new">New record</button>';
  const list=document.createElement('div'),status=document.createElement('p'),next=document.createElement('button');status.setAttribute('role','status');next.type='button';next.textContent='Next page';next.hidden=true;panel.append(form,status,list,next);
  const state={form,list,status,next,id:null,revision:null,offset:0,epoch:0};states.set(target,state);
  const reset=()=>{form.reset();state.id=null;state.revision=null;};form.querySelector('.catalog-new').onclick=reset;
  async function load(offset=0){const epoch=++state.epoch;status.textContent='Loading…';try{
   const data=await get('/api/admin/tariff-catalog/'+kind+'?offset='+offset);if(epoch!==state.epoch)return;
   state.offset=offset;list.replaceChildren();for(const row of data.rows){const button=document.createElement('button');button.type='button';button.textContent=row.name+' · '+row.id+(row.enabled?'':' (disabled)');button.onclick=()=>{state.id=row.id;state.revision=row.revision;form.elements.entryName.value=row.name;form.elements.description.value=row.description;form.elements.enabled.checked=row.enabled;};list.append(button);}
   next.hidden=data.nextOffset==null;next.onclick=()=>void load(data.nextOffset);status.textContent=data.rows.length+' records on this page.';
  }catch(e){if(epoch===state.epoch)status.textContent=e.message;}}
  state.load=load;
  form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;const epoch=state.epoch;try{
   await request('/api/admin/tariff-catalog/'+kind+(state.id?'/'+state.id:''),{name:form.elements.entryName.value,description:form.elements.description.value,enabled:form.elements.enabled.checked,...(state.id?{revision:state.revision}:{})},state.id?'PUT':'POST');
   if(epoch!==state.epoch)return;reset();await load(state.offset);
  }catch(error){if(epoch===state.epoch)status.textContent=error.message;}finally{submit.disabled=false;}};
 }
 return {refresh(target){return states.get(target)?.load();},stop(){for(const state of states.values()){state.epoch++;state.form.reset();state.id=null;state.revision=null;state.list.replaceChildren();state.status.textContent='';state.next.hidden=true;}}};
}
