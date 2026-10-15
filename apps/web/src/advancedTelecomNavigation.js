import backendCatalog from './advancedTelecomCatalog.json' with {type:'json'};
import nativeMenus from './nativeAstppMenus.json' with {type:'json'};
const catalog=[...backendCatalog,...nativeMenus.map(menu=>({id:menu.id,name:menu.label,group:'Native · '+menu.group+(menu.subtitle?' / '+menu.subtitle:''),nativePath:menu.path}))];
const labels={'Accounts & security':'Accounts & security','Monitoring & reports':'Monitoring & reports','Routing & numbers':'Routing & numbers','Communications & PBX':'Communications & PBX','Billing & payments':'Billing & payments','External integrations':'External integrations','Account experience':'Portals & experience'};
export const advancedTelecomGroups=[...new Set(catalog.map(f=>f.group))].map(group=>({label:labels[group]||(group.startsWith('Native · ')?group:(''+group.replace('Core · ',''))),roles:['super_admin'],items:catalog.filter(f=>f.group===group).map(f=>['telecom-feature-'+f.id,f.name])}));
export const advancedTelecomIds=new Set(catalog.map(f=>'telecom-feature-'+f.id));
export function createAdvancedTelecomPanels(document,root){
 for(const feature of catalog){const panel=document.createElement('section');panel.id='telecom-feature-'+feature.id;panel.hidden=true;panel.className='advanced-telecom-panel';
  const title=document.createElement('h2');title.textContent=feature.name;const group=document.createElement('p');group.className='advanced-feature-group';group.textContent=feature.group;
  const status=document.createElement('p');status.setAttribute('role','status');status.className='advanced-feature-status';const detail=document.createElement('p');detail.className='advanced-feature-detail';
  const actions=document.createElement('div');actions.className='advanced-feature-actions';const refresh=document.createElement('button');refresh.type='button';refresh.className='advanced-feature-refresh';refresh.textContent='Refresh status';actions.append(refresh);const related=document.createElement('div');related.className='advanced-feature-related';
  const back=document.createElement('a');back.href='/admin#telecom-features-admin';back.textContent='View all feature coverage';const records=document.createElement('div');records.className='advanced-feature-records';panel.append(group,title,status,detail,actions,related,records,back);root.append(panel);
 }
}
export function setupAdvancedTelecomNavigation({document,get,show}){
 let generation=0;const tokens=new Map();
 const names={implemented:'Implemented controls',partial:'Partial implementation',not_implemented:'Not implemented',external_dependency:'External dependency'};
 async function refresh(target){if(!advancedTelecomIds.has(target))return;const panel=document.getElementById(target),status=panel.querySelector('[role=status]'),detail=panel.querySelector('.advanced-feature-detail'),related=panel.querySelector('.advanced-feature-related');const serial=(tokens.get(target)||0)+1;tokens.set(target,serial);const owner=generation;status.textContent='Checking backend feature status…';detail.textContent='';related.replaceChildren();panel.querySelector('.advanced-feature-records').replaceChildren();
  const nativeFeature=catalog.find(f=>'telecom-feature-'+f.id===target&&f.nativePath);
  if(nativeFeature){status.textContent='Native ASTPP Community V6.0';detail.textContent='Open this menu in the private native console. Connect your SSH tunnel to port 8089 and sign in with your native ASTPP operator account. Native data and permissions are managed separately.';const link=document.createElement('a');link.href=new URL(nativeFeature.nativePath,'http://localhost:8089/').href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open '+nativeFeature.name+' in ASTPP';related.append(link);return;}
  try{const data=await get('/api/admin/telecom/features');if(owner!==generation||tokens.get(target)!==serial)return;const feature=data.features.find(f=>'telecom-feature-'+f.id===target);if(!feature)throw Error('Feature is not present in the backend catalog');status.textContent=names[feature.implementation]||'Unknown implementation status';detail.textContent=feature.detail;
   if(feature.target&&feature.target!==target&&document.getElementById(feature.target)&&!document.getElementById(feature.target).closest('[hidden]')){const button=document.createElement('button');button.type='button';button.textContent='Open related working controls';button.onclick=()=>show(feature.target);related.append(button);}
   if(feature.endpoint){
    const records=panel.querySelector('.advanced-feature-records');
    try{const result=await get(feature.endpoint);if(owner!==generation||tokens.get(target)!==serial)return;
     const rows=Array.isArray(result)?result:Object.values(result).find(Array.isArray);
     if(rows){if(!rows.length){records.textContent='No records found.';}else{const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];const tr=document.createElement('tr');for(const key of keys){const th=document.createElement('th');th.textContent=key.replaceAll('_',' ');tr.append(th);}head.append(tr);for(const row of rows){const tr=document.createElement('tr');for(const key of keys){const td=document.createElement('td');td.textContent=typeof row[key]==='object'?JSON.stringify(row[key]):String(row[key]??'');tr.append(td);}body.append(tr);}table.append(head,body);records.append(table);}}
     else{const pre=document.createElement('pre');pre.textContent=JSON.stringify(result,null,2);records.append(pre);}
    }catch(error){if(owner===generation&&tokens.get(target)===serial)records.textContent='Backend data unavailable: '+error.message;}
   }
   if(feature.implementation!=='implemented'){const note=document.createElement('p');note.className='feature-dependency-note';note.textContent='This menu does not activate or install unfinished functionality. Complete the stated implementation and prerequisites before live use.';related.append(note);}
  }catch(error){if(owner===generation&&tokens.get(target)===serial)status.textContent=error.message;}
 }
 for(const id of advancedTelecomIds)document.getElementById(id).querySelector('.advanced-feature-refresh').onclick=()=>void refresh(id);
 return {refresh,visibility(role){generation++;for(const id of advancedTelecomIds){const panel=document.getElementById(id);panel.hidden=role!=='super_admin';panel.querySelector('[role=status]').textContent='';panel.querySelector('.advanced-feature-detail').textContent='';panel.querySelector('.advanced-feature-related').replaceChildren();panel.querySelector('.advanced-feature-records').replaceChildren();}},stop(){this.visibility(null);}};
}
