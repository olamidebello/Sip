import {createVpnNativeClient} from './vpnNativeClient.js';
export function setupVpnUi({document,get,request,isSignedIn,isSuper,getUserId,show}){
 const account=document.getElementById('account'),admin=document.getElementById('admin');if(!account)return;
 const own=document.createElement('details');own.id='vpn-user-settings';own.hidden=true;own.innerHTML='<summary>VPN status & controls</summary><p data-instructions></p><p data-device role="status">Device VPN: checking…</p><p data-server role="status">Server VPN: checking…</p><p data-details></p><button type="button" data-refresh>Refresh status</button><button type="button" data-connect hidden>Connect VPN</button><button type="button" data-disconnect hidden>Disconnect VPN</button><button type="button" data-download>Download WireGuard setup</button><p><a href="https://github.com/olamidebello/Sip/releases/download/vpn-preview/Olamide-VPN-preview.apk">Download Android app with embedded VPN (development preview)</a></p><p data-status role="status"></p>';account.append(own);
 const $=s=>own.querySelector(s);let owner=null,loading=false,generation=0,userPaused=false,actionBusy=false,serverData=null,lastRefresh=0;
 const plugin=()=>document.defaultView.Capacitor?.Plugins?.OlamideVpn;
 const native=createVpnNativeClient({plugin,getConfig:()=>request('/api/vpn/config',{}),onStatus:text=>{$('[data-status]').textContent=text;void deviceStatus();}});
 function summary(text){const entry=document.querySelector('[data-vpn-settings] small');if(entry)entry.textContent=text;}
 function controls(){
  const embedded=native.available(),signed=isSignedIn()&&!!getUserId();
  if($('[data-connect]').hidden===embedded)$('[data-connect]').hidden=!embedded;if($('[data-disconnect]').hidden===embedded)$('[data-disconnect]').hidden=!embedded;
  $('[data-connect]').disabled=!signed||actionBusy||!serverData?.provisioned||!serverData?.enabled||!serverData?.serverEnabled;
  $('[data-disconnect]').disabled=!signed;
  $('[data-download]').disabled=!signed||!serverData?.provisioned||!serverData?.enabled||!serverData?.serverEnabled;
  const instructions=embedded?'VPN is included in this Android app. Connect after approving Android VPN permission. Disconnect stays off until you reconnect or sign in again.':'Browser Settings can show server status and download your private setup. To connect or disconnect a device VPN, use the embedded Android app or your WireGuard client.';
  if($('[data-instructions]').textContent!==instructions)$('[data-instructions]').textContent=instructions;
 }
 async function deviceStatus(){
  if(!isSignedIn()||!getUserId())return;
  const seq=generation;
  if(!native.available()){$('[data-device]').textContent='Device VPN: managed outside this browser';return;}
  try{const r=await plugin().status();if(seq!==generation||!isSignedIn())return;const on=r.state==='up'&&r.userId===getUserId();$('[data-device]').textContent=on?'Device VPN: On':'Device VPN: Off';summary(on?'Device VPN on · Manage connection':'Device VPN off · Connect and manage');}
  catch{if(seq===generation)$('[data-device]').textContent='Device VPN: status unavailable';}
 }
 async function refresh(){
  if(!isSignedIn()||!getUserId()||loading)return;loading=true;const seq=generation;lastRefresh=Date.now();
  try{
   const r=await get('/api/vpn');if(seq!==generation||!isSignedIn())return;serverData=r;controls();
   const label=!r.provisioned?'Not provisioned':!r.enabled||!r.serverEnabled?'Disabled by administrator':r.recentHandshake?'Recent handshake detected':'Ready · no recent handshake';
   $('[data-server]').textContent='Server VPN: '+label;
   $('[data-details]').textContent=r.provisioned?'VPN address: '+r.address+' · Last handshake: '+(r.lastHandshake?new Date(r.lastHandshake*1000).toLocaleString():'not yet seen')+' · Received: '+Number(r.receivedBytes||0).toLocaleString()+' bytes · Sent: '+Number(r.sentBytes||0).toLocaleString()+' bytes':'';
   summary(label);
   if(native.available()){
    if(r.provisioned&&r.enabled&&r.serverEnabled&&r.automatic&&!userPaused)void native.login(getUserId());
    if(!r.enabled||!r.serverEnabled)await native.logout();
   }
   await deviceStatus();
  }catch(e){if(seq===generation){serverData=null;controls();$('[data-server]').textContent='Server VPN: unavailable';$('[data-details]').textContent='';$('[data-status]').textContent=e.message;summary('VPN status unavailable · Open controls');await deviceStatus();}}
  finally{loading=false;}
 }
 $('[data-connect]').onclick=async()=>{if(!isSignedIn()||!serverData?.enabled||!serverData?.serverEnabled||actionBusy)return;userPaused=false;actionBusy=true;controls();$('[data-device]').textContent='Device VPN: requesting connection…';try{await native.retry(getUserId());await deviceStatus();}finally{actionBusy=false;controls();}};
 $('[data-disconnect]').onclick=async()=>{if(!isSignedIn())return;userPaused=true;try{await native.logout();$('[data-status]').textContent='VPN disconnected. Tap Connect VPN to reconnect.';await deviceStatus();}catch(e){$('[data-status]').textContent=e.message;}};
 $('[data-refresh]').onclick=refresh;own.ontoggle=()=>{if(own.open)void refresh();};
 $('[data-download]').onclick=async()=>{if(!isSignedIn())return;const seq=generation;try{const r=await request('/api/vpn/config',{});if(seq!==generation||!isSignedIn())return;const url=URL.createObjectURL(new Blob([r.config],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='Olamide-VPN.conf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('[data-status]').textContent='Private setup downloaded. Keep it secure and import into WireGuard.';}catch(e){if(seq===generation)$('[data-status]').textContent=e.message;}};
 let manager=null;
 if(admin){manager=document.createElement('details');manager.hidden=true;manager.innerHTML='<summary>VPN provisioning & control</summary><p>Manage VPN accounts for this workspace. Disabling removes the peer from the server. Rotating a key disconnects the previous setup and requires a new download.</p><label><input data-enabled type="checkbox"> Enable workspace VPN</label><label><input data-auto type="checkbox"> Provision & connect embedded app on login</label><button data-save type="button">Save policy</button><button data-refresh type="button">Refresh users & handshakes</button><p data-status role="status"></p><div data-users></div>';admin.append(manager);const shortcut=document.createElement('button');shortcut.type='button';shortcut.textContent='VPN management';shortcut.hidden=true;shortcut.onclick=()=>{if(!isSuper())return;show('admin');manager.open=true;};admin.prepend(shortcut);
 const m=s=>manager.querySelector(s);let seq=0;
 async function load(){if(!isSuper())return;const g=++seq;try{const r=await get('/api/admin/vpn');if(g!==seq||!isSuper())return;m('[data-enabled]').checked=!!r.settings.enabled;m('[data-auto]').checked=!!r.settings.automatic;const list=m('[data-users]');list.replaceChildren();for(const u of r.users){const p=r.peers.find(p=>p.user===u.id),row=document.createElement('p'),text=document.createElement('span');text.textContent=`${u.display_name} · ${u.email} · ${p?(p.enabled?'Enabled':'Disabled')+' · '+p.address+(p.lastHandshake?' · Last handshake '+new Date(p.lastHandshake*1000).toLocaleString():' · No handshake yet'):'Not provisioned'} `;row.append(text);for(const [label,enabled,rotate] of [['Enable',true,false],['Disable',false,false],['Rotate key',false,true]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{if(!isSuper())return;if(rotate&&!document.defaultView.confirm('Disconnect old VPN setup and rotate this user’s key?'))return;try{await request('/api/admin/vpn/users/'+u.id+(rotate?'/rotate':''),{enabled},'PUT');await load();}catch(e){m('[data-status]').textContent=e.message;}};row.append(button);}list.append(row);}m('[data-status]').textContent=`${r.peers.length} VPN profiles · capacity 253 accounts per server`;}catch(e){m('[data-status]').textContent=e.message;}}
 m('[data-save]').onclick=async()=>{if(!isSuper())return;try{await request('/api/admin/vpn/settings',{enabled:m('[data-enabled]').checked,automatic:m('[data-auto]').checked},'PUT');await load();}catch(e){m('[data-status]').textContent=e.message;}};m('[data-refresh]').onclick=load;manager.ontoggle=()=>{if(manager.open)void load();};manager._shortcut=shortcut;
 }
 function visibility(){
  const id=isSignedIn()?getUserId():null;
  if(owner!==id){owner=id;generation++;userPaused=false;serverData=null;lastRefresh=0;void native.logout().catch(()=>{});$('[data-status]').textContent='';$('[data-details]').textContent='';$('[data-server]').textContent='Server VPN: checking…';$('[data-device]').textContent='Device VPN: checking…';if(id)void refresh();}
  if(own.hidden===isSignedIn())own.hidden=!isSignedIn();
  if(manager){if(manager.hidden===isSuper())manager.hidden=!isSuper();if(manager._shortcut.hidden===isSuper())manager._shortcut.hidden=!isSuper();if(!isSuper()&&manager.querySelector('[data-users]').childNodes.length)manager.querySelector('[data-users]').replaceChildren();}
  const settings=document.getElementById('messenger-settings'),menu=document.querySelector('.messenger-settings-menu');
  if(settings&&!settings.contains(own))settings.append(own);
  if(menu&&!menu.querySelector('[data-vpn-settings]')){
   const b=document.createElement('button');b.type='button';b.dataset.vpnSettings='true';b.innerHTML='<span aria-hidden="true">◉</span><span><strong>VPN status & controls</strong><small>Check connection and manage VPN</small></span>';b.onclick=()=>{if(isSignedIn()){show(settings?'messenger-settings':'account');own.open=true;own.scrollIntoView?.({block:'start'});void refresh();}};menu.prepend(b);
  }
  const entry=document.querySelector('[data-vpn-settings]');if(entry&&entry.hidden===isSignedIn())entry.hidden=!isSignedIn();
  controls();
  if(id&&!document.hidden&&(own.open||settings&&!settings.hidden)&&Date.now()-lastRefresh>=10000)void refresh();
 }
 const timer=setInterval(visibility,2000);
 const observer=new document.defaultView.MutationObserver(visibility);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
 document.addEventListener('visibilitychange',visibility);visibility();
 return {dispose(){clearInterval(timer);observer.disconnect();document.removeEventListener('visibilitychange',visibility);generation++;own.remove();manager?._shortcut.remove();manager?.remove();document.querySelector('[data-vpn-settings]')?.remove();}};
}

