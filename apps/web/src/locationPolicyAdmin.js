export async function renderLocationPolicyAdmin({document,get,request,isSuperAdmin}){
 const anchor=document.querySelector('#geofence-admin');if(!anchor)return;
 let panel=document.querySelector('#vpn-policy-admin');
 if(!isSuperAdmin){panel?.remove();return;}
 if(!panel){panel=document.createElement('section');panel.id='vpn-policy-admin';panel.innerHTML=`<h3>VPN and location access</h3>
 <p>Allows VPN defaults to Yes. A user override takes priority over group policies. Without a user override, any group set to No wins. With no geofence, service is unrestricted and GPS is not requested.</p>
 <p>With a geofence, VPN-allowed users require fresh device location. Users with VPN disabled require the configured trusted IP/VPN lookup service. Browser location may be approximate or spoofed and cannot certify physical GPS.</p>
 <form data-vpn-user><h4>User profile policy</h4><label>User <select name="id"></select></label>
 <label><input name="allowsVpn" type="checkbox" checked> Allows VPN</label>
 <label><input name="inherit" type="checkbox" checked> Use group / default policy</label><button>Save user policy</button></form>
 <form data-vpn-group><h4>Group policy</h4><label>Group <select name="id"></select></label>
 <label><input name="allowsVpn" type="checkbox" checked> Allows VPN</label>
 <label><input name="inherit" type="checkbox" checked> Use default Yes</label><button>Save group policy</button></form>
 <button type="button" data-vpn-refresh>Refresh VPN policies</button><p role="status"></p>`;anchor.append(panel);}
 const status=panel.querySelector('[role="status"]');let data;
 function selected(form,rows){const row=rows.find(r=>r.id===form.elements.id.value);form.elements.inherit.checked=row?.allows_vpn==null;form.elements.allowsVpn.checked=row?.allows_vpn==null?(row?.effective_allows_vpn==null?true:!!Number(row.effective_allows_vpn)):!!Number(row.allows_vpn);form.elements.allowsVpn.disabled=form.elements.inherit.checked;}
 async function refresh(){data=await get('/api/admin/location-policy');for(const [attr,rows] of [['user',data.users],['group',data.groups]]){const f=panel.querySelector('[data-vpn-'+attr+']'),old=f.elements.id.value;f.elements.id.replaceChildren();for(const row of rows){const o=document.createElement('option');o.value=row.id;o.textContent=row.email||row.name;f.elements.id.append(o);}if([...f.elements.id.options].some(o=>o.value===old))f.elements.id.value=old;selected(f,rows);f.elements.id.onchange=()=>selected(f,rows);f.elements.inherit.onchange=()=>{f.elements.allowsVpn.disabled=f.elements.inherit.checked;};}status.textContent=data.ipLookupConfigured?'Trusted IP/VPN lookup configured.':'Trusted IP/VPN lookup not configured: with an enabled geofence, accounts set to No cannot use services until IP verification is configured.';}
 for(const [attr,kind] of [['user','users'],['group','groups']]){const f=panel.querySelector('[data-vpn-'+attr+']');f.onsubmit=async e=>{e.preventDefault();try{await request('/api/admin/location-policy/'+kind+'/'+f.elements.id.value,{allowsVpn:f.elements.inherit.checked?null:f.elements.allowsVpn.checked},'PUT');await refresh();status.textContent='VPN policy saved; active location permissions are re-evaluated.';}catch(e){status.textContent=e.message;}};}
 panel.querySelector('[data-vpn-refresh]').onclick=()=>refresh().catch(e=>status.textContent=e.message);
 try{await refresh();}catch(e){status.textContent=e.message;}
}
