from pathlib import Path
import re,sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo');changes=[]
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown SmoothDID integration anchor; no source changed: '+a[:100])
 return s.replace(a,b)
def edit(path,fn):
 p=root/path;changes.append((p,fn(p.read_text())))
def server(s):
 if '// SMOOTHDID_SERVER_V1' in s:return s
 s="import {migrateSmoothDid,handleSmoothDid,startSmoothRentals} from './smoothDid.js';\n"+s
 s=once(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\n// SMOOTHDID_SERVER_V1\nawait migrateSmoothDid(pool);\nconst stopSmoothRentals=startSmoothRentals(pool);')
 return once(s,'      if (path.startsWith("/api/inhouse/")',"      if(path.startsWith('/api/smoothdid/')||path==='/api/admin/smoothdid'||path.startsWith('/api/admin/smoothdid/'))return await handleSmoothDid({req,res,path,user,pool,send,readJson,sessionHash:tokenHash(currentToken(req))});\n      if (path.startsWith(\"/api/inhouse/\")")
def legacy(s):
 if '// SMOOTHDID_LEGACY_V1' in s:return s
 s=once(s,"WHERE tenant_id=$1 AND status='available' AND number_e164 LIKE", "WHERE tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM smooth_did_members sm WHERE sm.did_id=inhouse_dids.id) AND status='available' AND number_e164 LIKE")
 s=once(s,'WHERE tenant_id=$1 AND number_e164=$2 FOR UPDATE','WHERE tenant_id=$1 AND number_e164=$2 AND NOT EXISTS(SELECT 1 FROM smooth_did_members sm WHERE sm.did_id=inhouse_dids.id) FOR UPDATE')
 return '// SMOOTHDID_LEGACY_V1\n'+s
def location(s):
 if '// SMOOTHDID_LOCATION_V1' in s:return s
 s="import {smoothGeoRequirements} from './smoothDid.js';\n"+s
 return once(s,' const restricted=', ''' // SMOOTHDID_LOCATION_V1
 const smooth=await smoothGeoRequirements(db,tenant);
 if(smooth.enabled)fence={...fence,geoCallingAccuracyMeters:Math.max(fence.geoCallingAccuracyMeters||0,smooth.maxAccuracyMeters),smoothDidVersion:smooth.version};
 const restricted=smooth.enabled||''')
def billing(s):
 if '// SMOOTHDID_CALL_V1' in s:return s
 s="import {smoothServiceAccess} from './smoothDid.js';\n"+s
 return once(s,"const provider=identity?.provider||'flowroute';",'''const provider=identity?.provider||'flowroute';
  // SMOOTHDID_CALL_V1
  const smoothCallerId=identity?.callerId||adapterTrunk(await flowrouteTrunk(db,actor.tenant_id)).callerId;
  const smoothAccess=await smoothServiceAccess(db,{tenantId:actor.tenant_id,userId:actor.user_id,number:smoothCallerId,provider,destination,proof:data.locationProof,requireProof:true});
  if(!smoothAccess.allowed)throw Error(smoothAccess.reason);''')
def subscriber(s):
 if '// SMOOTHDID_SUBSCRIBER_V1' in s:return s
 s="import {smoothServiceAccess} from './smoothDid.js';\n"+s
 s=once(s,'numberSubscriber(pool,tenantId,number){',"numberSubscriber(pool,tenantId,number,channel='voice'){")
 s=once(s,'numberSubscriber(pool,tenantId,number);if(!recipient)',"numberSubscriber(pool,tenantId,number,'sms');if(!recipient)")
 return once(s,' return found.rows.length===1&&', ''' // SMOOTHDID_SUBSCRIBER_V1
 if(found.rows.length===1){const access=await smoothServiceAccess(pool,{tenantId,userId:found.rows[0].user_id,number:normalized,channel});if(!access.allowed)return null;}
 return found.rows.length===1&&''')
def inbound(s):
 if '// SMOOTHDID_INBOUND_V1' in s:return s
 s="import {smoothServiceAccess} from './smoothDid.js';\n"+s
 return once(s," if(!ownerId)return {action:'block',userId:null,reason:'No current DID owner'};",''' if(!ownerId)return {action:'block',userId:null,reason:'No current DID owner'};
 // SMOOTHDID_INBOUND_V1
 const smooth=await smoothServiceAccess(db,{tenantId,userId:ownerId,number:did,channel});
 if(!smooth.allowed)return {action:'block',userId:null,reason:smooth.reason};''')
def ui(s):
 if '// SMOOTHDID_UI_V1' in s:return s
 s="import {setupSmoothDidUi} from './smoothDidUi.js';\n"+s
 return once(s,'setupInboundRoutingUi({document,',"// SMOOTHDID_UI_V1\nsetupSmoothDidUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupInboundRoutingUi({document,")
edit('services/api/server.js',server)
edit('services/api/dids.js',legacy)
edit('services/api/locationPolicy.js',location)
edit('services/api/pstnBilling.js',billing)
edit('services/api/subscriberRouting.js',subscriber)
edit('services/api/inboundRouting.js',inbound)
edit('apps/web/src/main.js',ui)
for p,s in changes:p.write_text(s)
print('SmoothDID purchase and runtime geographic checks integrated; existing numbering and carrier paths preserved.')
