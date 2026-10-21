export function setupVoicemailUi({document,get,request,isSignedIn,isSuper,call,show=()=>{}}){
 const account=document.getElementById('account'),admin=document.getElementById('admin');if(!account)return;
 function panel(parent,title){const d=document.createElement('details');d.hidden=true;d.innerHTML=`<summary>${title}</summary><p>Unanswered and offline calls can leave a message. Dial *98 to listen, delete messages, or record your greeting. Mailbox changes synchronize within 30 seconds.</p><label><input type="checkbox" data-enabled> Enable voicemail</label><label>Maximum message seconds <input type="number" data-seconds min="30" max="180" value="120"></label><button type="button" data-refresh>Refresh</button><button type="button" data-save disabled>Save</button><p data-status role="status"></p>`;parent.append(d);return d;}
 const own=panel(account,'Voicemail'),manager=admin?panel(admin,'Voicemail provisioning & control'):null;
 own.id='voicemail-settings';const listen=document.createElement('button');listen.type='button';listen.textContent='Call my voicemail (*98)';listen.onclick=()=>{if(isSignedIn())call('*98');};own.append(listen);
 function wire(p,path,allowed){const $=s=>p.querySelector(s);let revision=0,busy=false,generation=0;
 const clear=()=>{generation++;revision=0;$('[data-save]').disabled=true;$('[data-status]').textContent='';};
 async function load(){clear();if(!allowed())return;const seq=generation;try{const r=await get(path());if(seq!==generation||!allowed())return;revision=r.revision;$('[data-enabled]').checked=r.enabled;$('[data-seconds]').value=r.maxSeconds;$('[data-save]').disabled=false;$('[data-status]').textContent=r.provisioned?(r.enabled?'Mailbox provisioned.':'Voicemail disabled.'):'Waiting for recorder synchronization.';}catch(e){if(seq===generation)$('[data-status]').textContent=e.message;}}
 $('[data-refresh]').onclick=load;$('[data-save]').onclick=async()=>{if(!allowed()||!revision||busy)return;busy=true;$('[data-save]').disabled=true;try{await request(path(),{enabled:$('[data-enabled]').checked,maxSeconds:Number($('[data-seconds]').value),revision},'PUT');await load();}catch(e){$('[data-status]').textContent=e.message;}finally{busy=false;$('[data-save]').disabled=!revision;}};p.ontoggle=()=>{if(p.open)void load();};return {load,clear};}
 const mine=wire(own,()=>'/api/voicemail',isSignedIn);let manage=null;
 if(manager){manager.id='voicemail-admin';const shortcut=document.createElement('button');shortcut.type='button';shortcut.textContent='Voicemail';shortcut.onclick=()=>{manager.open=true;manager.scrollIntoView?.({block:'start'});};admin.prepend(shortcut);const select=document.createElement('select');select.setAttribute('aria-label','Voicemail user');const users=document.createElement('button');users.type='button';users.textContent='Refresh users';const provision=document.createElement('button');provision.type='button';provision.textContent='Provision missing mailboxes';manager.insertBefore(select,manager.querySelector('label'));manager.append(users,provision);
 manage=wire(manager,()=>'/api/admin/voicemail/users/'+encodeURIComponent(select.value),()=>isSuper()&&!!select.value);select.onchange=manage.load;
 users.onclick=async()=>{if(!isSuper())return;try{const r=await get('/api/admin/voicemail');if(!isSuper())return;select.replaceChildren();for(const u of r.users){const o=document.createElement('option');o.value=u.id;o.textContent=(u.display_name||u.email)+' · '+u.email;select.append(o);}await manage.load();}catch(e){manager.querySelector('[data-status]').textContent=e.message;}};
 provision.onclick=async()=>{if(!isSuper())return;try{await request('/api/admin/voicemail/provision',{});manager.querySelector('[data-status]').textContent='Mailbox provisioning queued. Refresh after 30 seconds.';}catch(e){manager.querySelector('[data-status]').textContent=e.message;}};manager.ontoggle=()=>{if(manager.open&&isSuper())users.click();};}
 function openPanel(panel,workspace){show(workspace);panel.open=true;panel.scrollIntoView?.({block:'start'});}
 function navigation(){
  const heading=document.querySelector('#app-nav .menu-heading');if(!heading)return;
  for(const [kind,label,allowed,panel,workspace] of [
   ['own','Voicemail',isSignedIn(),own,'account'],
   ['manage','Manage voicemail',isSuper(),manager,'admin']]){
   let button=heading.querySelector('[data-voicemail-nav="'+kind+'"]');
   if(!button){button=document.createElement('button');button.type='button';button.dataset.voicemailNav=kind;button.textContent=label;button.onclick=()=>{if(kind==='manage'?!isSuper():!isSignedIn())return;openPanel(panel,workspace);};heading.append(button);}
   if(button.hidden===allowed)button.hidden=!allowed;
  }
 }
 let wasSignedIn=null,wasSuper=null;const adminShortcut=admin?.querySelector('button');
 function visibility(){navigation();if(own.hidden===isSignedIn())own.hidden=!isSignedIn();if(manager&&manager.hidden===isSuper())manager.hidden=!isSuper();if(adminShortcut&&adminShortcut.hidden===isSuper())adminShortcut.hidden=!isSuper();if(wasSignedIn!==isSignedIn()&&!isSignedIn())mine.clear();if(manager&&wasSuper!==isSuper()&&!isSuper())manage.clear();wasSignedIn=isSignedIn();wasSuper=isSuper();}
 const observer=new document.defaultView.MutationObserver(visibility);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});visibility();
 return {dispose(){observer.disconnect();document.querySelectorAll('[data-voicemail-nav]').forEach(n=>n.remove());own.remove();manager?.remove();adminShortcut?.remove();}};
}
