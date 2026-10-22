from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo');changes=[]
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown ICN integration anchor; no source changed: '+a[:100])
 return s.replace(a,b)
def edit(path,fn):
 p=root/path;changes.append((p,fn(p.read_text())))
def server(s):
 if '// ICN_SERVER_V1' in s:return s
 s="import {migrateProviderManager,handleProviderManager} from './providerManager.js';\nimport {migrateIcn,handleIcn} from './icnInterconnect.js';\n"+s
 s=once(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\n// ICN_SERVER_V1\nawait migrateIcn(pool);\nawait migrateProviderManager(pool);')
 return once(s,"      if(path==='/api/admin/hp-interconnect'", "      if(path==='/api/admin/provider-management'||path.startsWith('/api/admin/provider-management/'))return await handleProviderManager({req,res,path,user,pool,send,readJson});\n      if(path==='/api/admin/icn'||path.startsWith('/api/admin/icn/'))return await handleIcn({req,res,path,user,pool,send,readJson});\n      if(path==='/api/admin/hp-interconnect'")
def location(s):
 if '// ICN_LOCATION_V1' in s:return s
 s="import {icnPolicy} from './icnInterconnect.js';\n"+s
 return once(s,' const restricted=', ''' // ICN_LOCATION_V1
 const icn=await icnPolicy(db,tenant);
 if(icn.enabled)fence={...fence,geoCallingAccuracyMeters:Math.max(fence.geoCallingAccuracyMeters||0,icn.maxAccuracyMeters),icnVersion:icn.version};
 const restricted=icn.enabled||''')
def billing(s):
 if '// ICN_CALL_V1' in s:return s
 s="import {providerAccess} from './providerManager.js';\nimport {icnAccess} from './icnInterconnect.js';\n"+s
 return once(s,"const provider=identity?.provider||'flowroute';", '''const provider=identity?.provider||'flowroute';
  // ICN_CALL_V1
  const providerState=await providerAccess(db,actor.tenant_id,provider);if(!providerState.allowed)throw Error(providerState.reason);
  if(!['flowroute','didww','icn','hp-inc'].includes(provider))throw Error('Provider termination adapter not commissioned');
  if(provider==='icn'){const icn=await icnAccess(db,{tenantId:actor.tenant_id,userId:actor.user_id,callerId:identity?.callerId,destination,proof:data.locationProof});throw Error(icn.reason||'ICN termination not commissioned');}''')
def geo(s):
 if '// ICN_GEO_PROVIDER_V1' in s:return s
 s="import {providerOptions} from './providerManager.js';\n"+s
 s=once(s,"!providers.includes(r.provider)","!(/^[a-z][a-z0-9-]{1,15}$/).test(r.provider||'')")
 s=once(s,'policy,decks,trunks,users,audit,countries,providers','policy,decks,trunks,users,audit,countries,providers:(await providerOptions(pool,user.tenant_id)).map(p=>p.provider)')
 s=once(s,"!providers.includes(b.provider)","!(/^[a-z][a-z0-9-]{1,15}$/).test(b.provider||'')")
 s=once(s,"  for(const r of policy.rules)for", "  const registered=new Set((await providerOptions(db,user.tenant_id,{includeRemoved:true})).map(p=>p.provider));if(policy.rules.some(r=>!registered.has(r.provider))){await db.query('ROLLBACK');return send(res,400,{error:'Registered tenant provider required'}); }\n  for(const r of policy.rules)for")
 return '// ICN_GEO_PROVIDER_V1\n'+s
def carriers(s):
 if '// ICN_ACTIVATION_GUARD_V1' in s:return s
 s="import {providerAccess,providerOptions} from './providerManager.js';\n"+s
 s=once(s,"    return send(res,200,{providers:[...providers.map","    const managedNames=Object.fromEntries((await providerOptions(pool,user.tenant_id,{includeRemoved:true})).map(p=>[p.provider,p]));\n    return send(res,200,{providers:[...providers.map")
 s=once(s,"displayName:entry.displayName||entry.display_name,","displayName:managedNames[entry.provider]?.displayName||entry.displayName||entry.display_name,managementState:managedNames[entry.provider]?.state,")
 s=once(s,"...(rows.rows.find(row=>row.provider===entry.provider)||{status:'not_configured',routing_mode:'disabled',max_concurrent_calls:0})})),","...(rows.rows.find(row=>row.provider===entry.provider)||{status:'not_configured',routing_mode:'disabled',max_concurrent_calls:0})})).filter(p=>p.managementState!=='removed'),")
 return once(s,"  if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});", "  if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});\n  // ICN_ACTIVATION_GUARD_V1\n  if(req.method!=='GET'&&path!=='/api/admin/carriers'&&!path.includes('/credentials')&&!path.includes('/catalog')){const m=/^\\/api\\/admin\\/carriers\\/([a-z][a-z0-9-]{1,15})/.exec(path);if(m&&!path.endsWith('/deactivate')){const access=await providerAccess(pool,user.tenant_id,m[1]);if(!access.allowed)return send(res,409,{error:access.reason});}}\n  if(path==='/api/admin/carriers/icn/activate')return send(res,409,{error:'ICN live activation requires a commissioned termination adapter and confirmed carrier peering'});")
def rate_guard(s):
 if '// PROVIDER_RATE_GUARD_V1' in s:return s
 s="import {providerAccess} from './providerManager.js';\n"+s
 return once(s,"const buying=path.startsWith('/api/admin/');", "const buying=path.startsWith('/api/admin/');\n    // PROVIDER_RATE_GUARD_V1\n    if(!buying){const p=await providerAccess(pool,user.tenant_id,'flowroute');if(!p.allowed)return send(res,403,{error:p.reason});}")
def adapter(s):
 if '// PROVIDER_ADAPTER_GUARD_V1' in s:return s
 s="import {providerAccess} from './providerManager.js';\n"+s
 return once(s,'export async function commissionCarrier(pool,user,provider,action,details){', "export async function commissionCarrier(pool,user,provider,action,details){\n // PROVIDER_ADAPTER_GUARD_V1\n if(action!=='deactivate'){const p=await providerAccess(pool,user.tenant_id,provider);if(!p.allowed)throw Error(p.reason);}")
def flowroute(s):
 if '// PROVIDER_FLOWROUTE_GUARD_V1' in s:return s
 s="import {providerAccess} from './providerManager.js';\n"+s
 return once(s," const stored=await providerCredentials(pool,tenant,'flowroute');", " // PROVIDER_FLOWROUTE_GUARD_V1\n if(method!=='GET'){const p=await providerAccess(pool,tenant,'flowroute',path.startsWith('/messages')?'sms':'voice');if(!p.allowed)throw Error(p.reason); }\n const stored=await providerCredentials(pool,tenant,'flowroute');")
def ui(s):
 if '// ICN_UI_V1' in s:return s
 s="import {setupProviderManagerUi} from './providerManagerUi.js';\nimport {setupIcnUi} from './icnUi.js';\n"+s
 return once(s,'setupInboundRoutingUi({document,',"// ICN_UI_V1\nsetupProviderManagerUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupIcnUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupInboundRoutingUi({document,")
edit('services/api/server.js',server)
edit('services/api/locationPolicy.js',location)
edit('services/api/pstnBilling.js',billing)
edit('services/api/geoCalling.js',geo)
edit('services/api/carrierProviders.js',carriers)
edit('apps/web/src/main.js',ui)
edit('services/api/flowrouteRates.js',rate_guard)
edit('services/api/adapterRegistry.js',adapter)
if (root/'services/api/didFlowroute.js').exists():edit('services/api/didFlowroute.js',flowroute)
for p,s in changes:p.write_text(s)
print('ICN supplied signaling/media profile and geographic controls integrated; no live trunk or firewall activation performed.')
