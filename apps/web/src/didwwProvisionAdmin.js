const hosts=['nyc.us.out.didww.com','lac.us.out.didww.com','mia.us.out.didww.com','fra.eu.out.didww.com','ams.eu.out.didww.com','sg.out.didww.com','hk.out.didww.com'];
export function setupDidwwProvisionAdmin({root,get,request}){
 const box=document.createElement('article');box.id='didww-ip-only-panel';
 box.innerHTML='<h4>DIDWW outbound DID provisioning</h4><p>Assign an authorized Caller ID to each user. DIDWW must approve IP-only mode before provisioning. Verification checks the provider; provisioning updates its IP/CLI settings and installs server routing. Test a billed call and two-way audio afterward.</p><form autocomplete="off"><label>Outbound trunk ID <input name="trunkId" required></label><label>Server public IP <input name="publicIp" required value="154.29.77.102"></label><label>Regional gateway <select name="host"></select></label><label>Concurrent call limit <input name="maxConcurrentCalls" type="number" min="1" max="500" value="10" required></label><label>DIDWW approval reference <input name="approvalReference" maxlength="200" required></label><label>Production DIDWW API key <input name="apiKey" type="password" maxlength="256" autocomplete="new-password" placeholder="Blank keeps the saved key"></label><p data-key-state></p><label><input name="cliRightsConfirmed" type="checkbox" required> I have DIDWW IP-only approval and permission to present every assigned DID.</label><h5>User DID assignments</h5><div data-assignments></div><button type="button" data-add>Add user DID</button><button type="submit">Save settings</button></form><div><button type="button" data-verify>Verify prerequisites</button><button type="button" data-provision>Provision DIDWW</button><button type="button" data-refresh>Refresh status</button></div><p role="status" aria-live="polite"></p><ul data-jobs></ul>';
 root.append(box);const form=box.querySelector('form'),status=box.querySelector('[role=status]'),rows=box.querySelector('[data-assignments]');let revision=0,users=[],timer,pending=false,worker=false;
 for(const host of hosts){const o=document.createElement('option');o.value=o.textContent=host;form.elements.host.append(o);}
 function row(a={}){
  const div=document.createElement('fieldset');div.innerHTML='<legend>Authorized DID</legend><label>User <select name="user" required></select></label><label>DID in international format <input name="number" placeholder="+12145550123" pattern="\\+[1-9][0-9]{7,14}" required></label><label>Number rights reference <input name="evidence" maxlength="200" required></label><button type="button">Remove assignment</button>';
  const select=div.querySelector('select');for(const u of users){const option=document.createElement('option');option.value=u.id;option.textContent=u.email;select.append(option);}select.value=a.userId||users[0]?.id||'';
  div.querySelector('[name=number]').value=a.number||'';div.querySelector('[name=evidence]').value=a.evidence||'';
  div.querySelector('button').onclick=()=>div.remove();rows.append(div);
 }
 function controls(){box.querySelector('[data-verify]').disabled=box.querySelector('[data-provision]').disabled=!revision||pending||!worker;form.querySelector('[type=submit]').disabled=pending;}
 async function refresh(populate=true){
  clearTimeout(timer);
  try{const data=await get('/api/admin/carriers/didww/ip-only');revision=data.revision;users=data.users;worker=data.worker.available;pending=data.jobs.some(j=>['queued','running'].includes(j.status));
   if(populate){form.elements.apiKey.value='';rows.replaceChildren();if(data.config){for(const k of ['trunkId','publicIp','host','maxConcurrentCalls','approvalReference'])form.elements[k].value=data.config[k];form.elements.cliRightsConfirmed.checked=data.config.cliRightsConfirmed;for(const a of data.config.assignments)row(a);}else row();}
   box.querySelector('[data-key-state]').textContent=data.apiKeyConfigured?'A dedicated production API key is stored securely.':'Enter a production key here, or use existing production DIDWW credentials.';
   status.textContent=!worker?'Private provisioning worker is unavailable. Run the DIDWW GUI installer on the server.':pending?'Provisioning job pending; status updates automatically.':'Private worker available. Save settings, verify prerequisites, then provision.';
   const list=box.querySelector('[data-jobs]');list.replaceChildren();for(const job of data.jobs){const li=document.createElement('li');li.textContent=job.mode+' · '+job.status+' · '+job.message+' · '+job.created_at;list.append(li);}controls();
   if(pending)timer=setTimeout(()=>{if(!root.hidden)void refresh(false);},5000);
  }catch(e){status.textContent=e.message;}
 }
 box.querySelector('[data-add]').onclick=()=>row();box.querySelector('[data-refresh]').onclick=()=>refresh();
 form.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));data.expectedRevision=revision;data.maxConcurrentCalls=Number(data.maxConcurrentCalls);data.cliRightsConfirmed=form.elements.cliRightsConfirmed.checked;data.assignments=[...rows.children].map(r=>({userId:r.querySelector('select').value,number:r.querySelector('[name=number]').value,evidence:r.querySelector('[name=evidence]').value,authorized:true}));delete data.user;delete data.number;delete data.evidence;
  try{await request('/api/admin/carriers/didww/ip-only',data,'PUT');form.elements.apiKey.value='';await refresh();status.textContent='Settings saved. Verification and provisioning are separate actions.';}catch(error){status.textContent=error.message;}
 };
 async function run(mode){if(mode==='provision'&&!confirm('Apply DIDWW IP/CLI settings and deploy routing? The switch may restart and interrupt active calls.'))return;try{await request('/api/admin/carriers/didww/ip-only/provision',{mode,expectedRevision:revision});await refresh(false);}catch(e){status.textContent=e.message;}}
 box.querySelector('[data-verify]').onclick=()=>run('verify');box.querySelector('[data-provision]').onclick=()=>run('provision');
 return {refresh};
}
