export function setupTelecomFeatures({document,get,show}){
 const root=document.getElementById('telecom-features-admin'),status=root.querySelector('[role=status]'),list=root.querySelector('.telecom-feature-list'),search=root.querySelector('input');let rows=[],generation=0;
 function render(){list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();const filtered=rows.filter(r=>`${r.group} ${r.name} ${r.detail}`.toLocaleLowerCase().includes(query));
  for(const group of [...new Set(filtered.map(r=>r.group))]){const section=document.createElement('section');const title=document.createElement('h3');title.textContent=group;section.append(title);const grid=document.createElement('div');grid.className='telecom-feature-grid';
   for(const row of filtered.filter(r=>r.group===group)){const card=document.createElement('article'),heading=document.createElement('h4'),state=document.createElement('span'),detail=document.createElement('p');heading.textContent=row.name;state.textContent=({implemented:'Implemented controls',partial:'Partial implementation',not_implemented:'Not implemented',external_dependency:'External dependency'})[row.implementation]||'Unknown';state.className='feature-state';detail.textContent=row.detail;card.append(heading,state,detail);
    if(row.target&&document.getElementById(row.target)&&!document.getElementById(row.target).closest('[hidden]')){const button=document.createElement('button');button.type='button';button.textContent='Open existing controls';button.onclick=()=>show(row.target);card.append(button);}grid.append(card);
   }section.append(grid);list.append(section);
  }if(!filtered.length){const empty=document.createElement('p');empty.textContent='No matching features.';list.append(empty);}
 }
 search.oninput=render;
 async function refresh(){const token=++generation;status.textContent='Loading feature inventory…';try{const result=await get('/api/admin/telecom/features');if(token!==generation)return;rows=result.features||[];render();status.textContent=`${rows.length} feature entries. Implementation status is separate from deployment and live-call acceptance.`;}catch(e){if(token!==generation)return;rows=[];render();status.textContent=e.message;}}
 root.querySelector('.telecom-refresh').onclick=()=>void refresh();return {refresh,stop(){generation++;rows=[];list.replaceChildren();status.textContent='';}};
}
