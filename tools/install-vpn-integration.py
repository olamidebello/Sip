from pathlib import Path
root=Path('/opt/olamide/repo');changes=[]
p=root/'services/api/server.js';s=p.read_text()
if "import {handleVpn} from './vpn.js';" not in s:
 anchor="      if(path==='/api/voicemail'"
 if s.count(anchor)!=1:raise SystemExit('Unknown HTTP integration layout')
 s="import {handleVpn} from './vpn.js';\n"+s.replace(anchor,"      if(path==='/api/vpn'||path.startsWith('/api/vpn/')||path.startsWith('/api/admin/vpn'))return await handleVpn({req,res,path,user,pool,send,readJson});\n"+anchor)
 auth='path.startsWith("/api/meetings") ||'
 if s.count(auth)!=1:raise SystemExit('Unknown authentication layout')
 s=s.replace(auth,'path.startsWith("/api/vpn") || '+auth)
changes.append((p,s))
p=root/'services/api/kamailioHttpBridge.js';s=p.read_text()
if '// OLAMIDE_VPN_ACCOUNTS_V1' not in s:
 anchor='export async function bridgeLookup(pool,path,data){'
 if s.count(anchor)!=1:raise SystemExit('Unknown private bridge layout')
 s=s.replace(anchor,anchor+'''\n // OLAMIDE_VPN_ACCOUNTS_V1
 if(path==='/api/switch/kamailio/vpn-accounts')return [200,{users:(await pool.query("SELECT u.id,u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.status='active' AND t.status='active'")).rows}];''')
changes.append((p,s))
p=root/'apps/web/src/main.js';s=p.read_text()
if "import {setupVpnUi} from './vpnUi.js';" not in s:
 anchor='setupVoicemailUi({document,'
 if s.count(anchor)!=1:raise SystemExit('Unknown UI layout')
 s="import {setupVpnUi} from './vpnUi.js';\n"+s.replace(anchor,"setupVpnUi({document,get:apiGet,request:accountRequest,isSignedIn:()=>['user','admin','super_admin'].includes(activeRole),isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\n"+anchor)
changes.append((p,s))
for p,s in changes:p.write_text(s)
