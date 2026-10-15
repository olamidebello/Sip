import definitions from './telecomPolicyDefinitions.json' with {type:'json'};
export function setupTelecomPolicies({document,get,request}){
 const states=new Map();
 for(const [kind,definition] of Object.entries(definitions)){
  const target='telecom-feature-'+definition.feature,panel=document.getElementById(target);if(!panel)continue;
  const form=document.createElement('form'),title=document.createElement('h3');title.textContent=definition.label;form.append(title);
  for(const field of definition.fields){const label=document.createElement('label'),input=document.createElement('input');label.textContent=field.label+' ';input.name=field.name;input.type=field.type;input.required=field.name!=='replacement';if(field.type==='number'){input.min='0';input.step='1';}else input.maxLength=200;label.append(input);form.append(label);}
  const enabledLabel=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.name='enabled';enabled.checked=true;enabledLabel.append(enabled,document.createTextNode(' Enabled'));form.append(enabledLabel);
  const submit=document.createElement('button'),reset=document.createElement('button');submit.type='submit';submit.textContent='Save rule';reset.type='button';reset.textContent='New rule';form.append(submit,reset);
  const status=document.createElement('p'),list=document.createElement('div');status.setAttribute('role','status');panel.append(form,status,list);
  const state={form,status,list,epoch:0,id:null,revision:null};if(!states.has(target))states.set(target,[]);states.get(target).push(state);
  const clear=()=>{form.reset();state.id=null;state.revision=null;};reset.onclick=clear;
  async function load(){const epoch=++state.epoch;status.textContent='Loading policies…';try{const result=await get('/api/admin/telecom/policies/'+kind);if(epoch!==state.epoch)return;list.replaceChildren();for(const row of result.rows){const button=document.createElement('button');button.type='button';button.textContent=definition.fields.map(f=>f.label+': '+row.data[f.name]).join(' · ')+(row.enabled?'':' (disabled)');button.onclick=()=>{state.id=row.id;state.revision=row.revision;for(const f of definition.fields)form.elements[f.name].value=row.data[f.name];enabled.checked=row.enabled;};list.append(button);}status.textContent=result.rows.length+' rules. Select a rule to edit or disable it.';}catch(e){if(epoch===state.epoch)status.textContent=e.message;}}
  state.load=load;
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;const epoch=state.epoch;try{const data=Object.fromEntries(definition.fields.map(f=>[f.name,f.type==='number'?Number(form.elements[f.name].value):form.elements[f.name].value]));await request('/api/admin/telecom/policies/'+kind+(state.id?'/'+state.id:''),{data,enabled:enabled.checked,...(state.id?{revision:state.revision}:{})},state.id?'PUT':'POST');if(epoch!==state.epoch)return;clear();await load();}catch(e){if(epoch===state.epoch)status.textContent=e.message;}finally{submit.disabled=false;}};
 }
 return {refresh(target){return Promise.all((states.get(target)||[]).map(state=>state.load()));},stop(){for(const state of [...states.values()].flat()){state.epoch++;state.form.reset();state.id=null;state.revision=null;state.list.replaceChildren();state.status.textContent='';}}};
}
