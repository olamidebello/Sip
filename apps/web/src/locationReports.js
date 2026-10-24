import {locationReportCsv} from './locationReportCsv.js';
export function setupLocationReports({document,get,request}){
 const panel=document.createElement('section');panel.id='location-reports-admin';panel.hidden=true;
 panel.innerHTML='<h3>Location history reports</h3><p>Reports show user-saved check-ins for the selected tenant. Saving a location requires user consent. Up to 500 newest entries are shown. Address is the current user profile address and may differ from the saved GPS location.</p><label><input type="checkbox" data-enabled> Enable user location-history saves</label><label>Retention (days, 1–30) <input type="number" data-retention min="1" max="30" value="30"></label><button type="button" data-save>Save report policy</button><button type="button" data-refresh>Refresh report</button><button type="button" data-export>Download CSV</button><label>Clear history for user <select data-user><option value="">Select user</option></select></label><button type="button" data-clear>Clear selected user history</button><p role="status"></p><div style="overflow:auto"><table><thead><tr><th>User</th><th>Saved at</th><th>Latitude</th><th>Longitude</th><th>Accuracy (m)</th><th>Current profile address</th></tr></thead><tbody></tbody></table></div>';
 document.getElementById('admin').append(panel);
 const $=s=>panel.querySelector(s),status=$('[role=status]');let entries=[],generation=0,active=false;
 async function load(){const token=generation;const data=await get('/api/admin/location-reports');if(token!==generation||!active)return;
 entries=data.entries;$('[data-enabled]').checked=data.policy.enabled;$('[data-retention]').value=data.policy.retentionDays;
 $('tbody').replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select user';$('[data-user]').replaceChildren(placeholder);const users=new Map();
 for(const e of entries){const tr=document.createElement('tr');for(const value of [e.name||e.userId,new Date(e.recordedAt).toLocaleString(),e.latitude,e.longitude,e.accuracyMeters,e.profileAddress||'Not provided']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('tbody').append(tr);users.set(e.userId,e.name||e.userId);}
 for(const [id,name]of users){const o=document.createElement('option');o.value=id;o.textContent=name;$('[data-user]').append(o);}status.textContent=`${entries.length} saved check-ins. Retention: ${data.policy.retentionDays} days.`;
 }
 const guarded=fn=>async()=>{if(!active)return;const token=generation;try{await fn();}catch(e){if(token===generation)status.textContent=e.message;}};
 $('[data-refresh]').onclick=guarded(load);
 $('[data-save]').onclick=guarded(async()=>{await request('/api/admin/location-reports/policy',{enabled:$('[data-enabled]').checked,retentionDays:Number($('[data-retention]').value)},'PUT');await load();});
 $('[data-clear]').onclick=guarded(async()=>{const userId=$('[data-user]').value;if(!userId)throw Error('Select a user');if(!document.defaultView.confirm('Permanently clear this user’s saved location history?'))return;await request('/api/admin/location-reports',{userId},'DELETE');await load();});
 $('[data-export]').onclick=()=>{if(!active)return;const csv=locationReportCsv(entries);const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='location-history-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return {start(user){generation++;active=user.role==='super_admin';panel.hidden=!active;entries=[];$('tbody').replaceChildren();if(active)void guarded(load)();},stop(){generation++;active=false;entries=[];panel.hidden=true;$('tbody').replaceChildren();$('[data-user]').replaceChildren();status.textContent='';}};
}
