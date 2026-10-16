export function setupModuleReadiness({document,get,request}){
 const root=document.querySelector('#telecom-features-admin'),box=document.createElement('section');box.innerHTML=`<h3>Module audit and CDR archives</h3>
 <button type="button" id="module-audit-refresh">Examine module evidence</button><p id="module-audit-status" role="status"></p><div id="module-audit-list"></div>
 <h3>Recorded CDR archive copies</h3><p>Exports retain the original call records. Each archive supports up to 50,000 rows. Download before removing an archive copy. At 20 stored copies, the automatic schedule pauses.</p>
 <form id="cdr-archive-create"><label>From date <input name="from" type="date" required></label><label>Through date <input name="to" type="date" required></label><button>Queue compressed CSV archive</button></form>
 <form id="cdr-archive-schedule"><label>Every hours <input name="intervalHours" type="number" min="1" max="720" value="24" required></label><label>Completed days to include <input name="lookbackDays" type="number" min="1" max="31" value="1" required></label><label>Next run (UTC) <input name="nextAt" type="datetime-local" required></label><label><input name="enabled" type="checkbox">Enable automatic archives</label><button>Save archive schedule</button></form>
 <button type="button" id="cdr-archive-refresh">Refresh archive jobs</button><p id="cdr-archive-status" role="status"></p><ul id="cdr-archive-list"></ul>`;root.append(box);box.hidden=true;
 let generation=0,revision=0;
 const status=box.querySelector('#module-audit-status'),archiveStatus=box.querySelector('#cdr-archive-status');
 const schedule=box.querySelector('#cdr-archive-schedule');
 async function refresh(){const token=++generation;try{
  const [audit,data]=await Promise.all([get('/api/admin/telecom/module-audit'),get('/api/admin/telecom/archives')]);if(token!==generation)return;
  box.hidden=false;
  status.textContent=`${audit.summary.apiSourceModules} API source modules, ${audit.summary.applicationFeatures} feature entries, ${audit.summary.kamailioModules} Kamailio entries. ${audit.appliedSchema.length} schema components recorded. Live installation and acceptance remain separate checks.`;
  const list=box.querySelector('#module-audit-list');list.replaceChildren();
  for(const m of audit.apiModules){const row=document.createElement('details'),title=document.createElement('summary'),detail=document.createElement('p');title.textContent=m.id;detail.textContent=`Server import graph: ${m.reachableFromServer?'referenced':'no reference found'}. Migration import: ${m.migrationImported?'present':'none found'}. Tests: ${m.tests.join(', ')||'none identified'}. Handler calls: ${m.serverReferencedHandlers.join(', ')||'none found'}. Worker starts: ${m.serverStartedWorkers.join(', ')||'none found'}. Live acceptance: ${m.liveAcceptance}.`;row.append(title,detail);list.append(row);}
  renderArchives(data);
 }catch(e){if(token===generation)status.textContent=e.message;}}
 function renderArchives(data){revision=data.schedule?.revision||0;const s=data.schedule;if(s){schedule.elements.intervalHours.value=s.interval_hours;schedule.elements.lookbackDays.value=s.lookback_days;schedule.elements.enabled.checked=!!s.enabled;schedule.elements.nextAt.value=new Date(s.next_at).toISOString().slice(0,16);}archiveStatus.textContent=data.note;
  const list=box.querySelector('#cdr-archive-list');list.replaceChildren();
  for(const a of data.archives){const li=document.createElement('li');li.textContent=`${a.id}: ${a.status} · ${a.row_count??'?'} rows ${a.error_code||''} ${a.sha256?'SHA-256 '+a.sha256:''} `;
   if(a.status==='ready'){const link=document.createElement('a');link.href='/api/admin/telecom/archives/'+a.id+'/download';link.textContent='Download CSV.gz';li.append(link);}
   if(['ready','failed','cancelled'].includes(a.status)){const b=document.createElement('button');b.type='button';b.textContent='Remove archive copy';b.onclick=async()=>{try{await request('/api/admin/telecom/archives/'+a.id,{},'DELETE');await refreshArchives();}catch(e){archiveStatus.textContent=e.message;}};li.append(b);}list.append(li);
  }
 }
 async function refreshArchives(){const token=generation;try{const data=await get('/api/admin/telecom/archives');if(token===generation)renderArchives(data);}catch(e){if(token===generation)archiveStatus.textContent=e.message;}}
 box.querySelector('#cdr-archive-create').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await request('/api/admin/telecom/archives',{from:f.elements.from.value,to:f.elements.to.value});await refreshArchives();}catch(e){archiveStatus.textContent=e.message;}};
 schedule.onsubmit=async e=>{e.preventDefault();try{await request('/api/admin/telecom/archives/schedule',{intervalHours:Number(schedule.elements.intervalHours.value),lookbackDays:Number(schedule.elements.lookbackDays.value),nextAt:new Date(schedule.elements.nextAt.value+'Z').toISOString(),enabled:schedule.elements.enabled.checked,revision},'PUT');await refreshArchives();}catch(e){archiveStatus.textContent=e.message;}};
 box.querySelector('#module-audit-refresh').onclick=refresh;box.querySelector('#cdr-archive-refresh').onclick=refreshArchives;
 return {refresh,stop(){generation++;box.hidden=true;box.querySelector('#module-audit-list').replaceChildren();box.querySelector('#cdr-archive-list').replaceChildren();status.textContent='';archiveStatus.textContent='';revision=0;schedule.reset();}};
}
