from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path("/opt/olamide/repo")
patches={'serverFleetAdmin.js': [('li.append(p);', "li.append(p);appendAdminStatus(li,'health',{...n,staleSeconds:data.settings?.stale_seconds||300});")], 'fleetNetworkAdmin.js': [('li.dataset.id=d.id;', "const linked=nodes.find(n=>n.id===d.node_id);appendAdminStatus(li,linked?'health':'equipment',linked?{...linked,enabled:!!d.enabled&&!!linked.enabled}:d);li.dataset.id=d.id;")], 'walletProvidersAdmin.js': [('if(row){const button=', "appendAdminStatus(li,'configuration',{enabled:!!row?.enabled});if(row){const button=")], 'operationsAdmin.js': [("const edit=document.createElement('button');", "appendAdminStatus(li,'health',{...nodes.find(n=>n.id===t.node_id),enabled:!!t.enabled,status:t.node_status});const edit=document.createElement('button');")], 'adapterAdmin.js': [("const controls=document.createElement('div');", "appendAdminStatus(detail,'health',node);const controls=document.createElement('div');")], 'kamailioAdmin.js': [('cell(state);', "appendAdminStatus(cell(state),'capability',{status:state});"), ("Object.entries(service.capabilities).map(([k,v])=>k+': '+v).join(' · ');servers.append(li);}", "Object.entries(service.capabilities).map(([k,v])=>k+': '+v).join(' · ');appendAdminStatus(li,'service',service);servers.append(li);}"), ('readiness.append(li);}', "appendAdminStatus(li,'capability',f);readiness.append(li);}"), ('list.append(li);}', "appendAdminStatus(li,'user',a);list.append(li);}")], 'providerManagerUi.js': [("row.append(cell,el('td',p.displayName),el('td',p.provider),el('td',p.state));", "const stateCell=el('td',p.state);appendAdminStatus(stateCell,'provider',p);row.append(cell,el('td',p.displayName),el('td',p.provider),stateCell);")], 'carrierConsole.js': [("cell.textContent=String(value??'');row.append(cell);", "cell.textContent=String(value??'');if(role()==='super_admin'&&selected==='gateways'&&row.children.length===1)appendAdminStatus(cell,'gateway',{status:value});if(role()==='super_admin'&&selected==='trunks'&&row.children.length===4)appendAdminStatus(cell,'configuration',{enabled:value==='Enabled'});row.append(cell);")], 'groups.js': [('$("#group-assign").disabled=', 'if(user)appendAdminStatus($("#group-user-details"),\'user\',user);\n    $("#group-assign").disabled='), ('option.textContent = `${user.name} <${user.email}>`;', "const status=adminStatus('user',user);option.textContent = ({green:'🟢',yellow:'🟡',red:'🔴'})[status.color]+` ${user.name} <${user.email}> · ${user.status}`;")]}
changes=[]
for name,replacements in patches.items():
 p=root/"apps/web/src"/name
 if not p.exists():continue
 s=p.read_text()
 if "// ADMIN_STATUS_ICONS_V1" in s:continue
 for a,b in replacements:
  if s.count(a)!=1:raise SystemExit("Unknown status integration anchor; no sources changed: "+name+": "+a)
  s=s.replace(a,b)
 s="import {appendAdminStatus"+(",adminStatus" if name=="groups.js" else "")+"} from './adminStatusIcons.js';\n// ADMIN_STATUS_ICONS_V1\n"+s
 changes.append((p,s))
for p,s in changes:p.write_text(s)
print("Status indicators integrated into "+str(len(changes))+" installed admin modules.")
