from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown API bridge integration; no files changed: '+a[:100])
 return s.replace(a,b)
p=root/'services/api/server.js';s=p.read_text()
if '// API_BRIDGE_KEYS_V1' not in s:
 s="import {migrateApiBridge,handleApiBridge} from './apiBridge.js';\n// API_BRIDGE_KEYS_V1\n"+s
 s=replace(s,"  const hostedBridge=path==='/api/integrations/hosted-account';","  const keyedBridge=path==='/api/bridge/v1/status'||path==='/api/bridge/v1/accounts';\n  const hostedBridge=path==='/api/integrations/hosted-account';")
 s=replace(s,'&& !hostedBridge && !hostedIntegration','&& !keyedBridge && !hostedBridge && !hostedIntegration')
 s=replace(s,'const external=!!(hostedBridge||','const external=!!(keyedBridge||hostedBridge||')
 s=replace(s,'    if(hostedBridge)return',"    if(keyedBridge||path.startsWith('/api/admin/api-bridge/'))return await handleApiBridge({req,res,path,pool,send,readJson,user:keyedBridge?null:await currentUser(req)});\n    if(hostedBridge)return")
 s=replace(s,'await migrateHostedApps(pool);','await migrateHostedApps(pool);\nawait migrateApiBridge(pool);');changes.append((p,s))
p=root/'services/api/hostedAccounts.js';s=p.read_text()
if '// API_BRIDGE_KEYS_V1' not in s:
 s=replace(s,'handleHostedAccounts({req,res,pool,send,readJson})','handleHostedAccounts({req,res,pool,send,readJson,bridgePrincipal})')
 s=replace(s,'if(!bridgeAuthorized(req))','if(!bridgePrincipal&&!bridgeAuthorized(req))')
 anchor=" const db=await pool.connect();let lock=false,userId,tenantId;"
 s=replace(s,anchor," if(bridgePrincipal&&b.instance!==bridgePrincipal.instance)return send(res,403,{error:'API key instance does not match the request'});\n"+anchor)
 changes.append((p,'// API_BRIDGE_KEYS_V1\n'+s))
p=root/'apps/web/src/adminWorkspaceUi.js';s=p.read_text()
if '// API_BRIDGE_KEYS_V1' not in s:
 s="import {setupApiBridgeUi} from './apiBridgeUi.js';\n// API_BRIDGE_KEYS_V1\n"+s
 s=replace(s,"active='overview',monitoring=null;","active='overview',monitoring=null,apiBridge=null;")
 s=replace(s,"function start(){if(layout)return;","function start(){if(layout)return;apiBridge=setupApiBridgeUi({document,isSuper});")
 s=replace(s,'function stop(){monitoring?.dispose();','function stop(){if(apiBridge?.node)items.delete(apiBridge.node);apiBridge?.dispose();apiBridge=null;monitoring?.dispose();')
 changes.append((p,s))
for p,s in changes:p.write_text(s)
print('API bridge routes, instance-bound keys and super-admin key controls integrated.')
