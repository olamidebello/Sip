from pathlib import Path
import re,sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo');changes=[]
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown geographic integration anchor; no source changed: '+a[:85])
 return s.replace(a,b)
def edit(path,fn):
 p=root/path;changes.append((p,fn(p.read_text())))
def server(s):
 if '// GEO_CALLING_ADMIN_V1' in s:return s
 s="import {migrateHpInterconnect,handleHpInterconnect} from './hpInterconnect.js';\nimport {migrateGeoCalling,handleGeoCalling} from './geoCalling.js';\n"+s
 s=once(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\nawait migrateGeoCalling(pool);\nawait migrateHpInterconnect(pool);')
 s=once(s,"      if(path==='/api/admin/inbound-routing'","      // GEO_CALLING_ADMIN_V1\n      if(path==='/api/admin/hp-interconnect'||path.startsWith('/api/admin/hp-interconnect/'))return await handleHpInterconnect({req,res,path,user,pool,send,readJson});\n      if(path==='/api/admin/geo-calling'||path.startsWith('/api/admin/geo-calling/'))return await handleGeoCalling({req,res,path,user,pool,send,readJson});\n      if(path==='/api/admin/inbound-routing'")
 return once(s,'handleFlowrouteRates({req,res,path,user,pool,send})','handleFlowrouteRates({req,res,path,user,pool,send,sessionHash:tokenHash(currentToken(req))})')
def location(s):
 if '// GEO_CALLING_LOCATION_V1' in s:return s
 s="import {hpPolicy} from './hpInterconnect.js';\nimport {geoCallingPolicy} from './geoCalling.js';\n"+s
 s=once(s,'export function evaluateLocation(policy,p){', '''export function evaluateLocation(policy,p){
 if(policy.geoCallingAccuracyMeters!==undefined&&(!p||![p.latitude,p.longitude,p.accuracy].every(Number.isFinite)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||p.accuracy<0||p.accuracy>policy.geoCallingAccuracyMeters))return {allowed:false,reason:'Accurate device location required for geographic calling'};''')
 pattern=r'const restricted=([^;]+);'
 if len(re.findall(pattern,s))!=1:raise SystemExit('Unknown location restriction layout; no source changed')
 return re.sub(pattern,lambda m:'''// GEO_CALLING_LOCATION_V1
 const geo=await geoCallingPolicy(db,tenant),hp=await hpPolicy(db,tenant);
 if(geo.enabled||hp.enabled)fence={...fence,geoCallingAccuracyMeters:Math.max(geo.enabled?geo.maxAccuracyMeters:0,hp.enabled?hp.maxAccuracyMeters:0),geoCallingVersion:geo.version,hpCallingVersion:hp.version};
 const restricted=('''+m[1]+''')||geo.enabled||hp.enabled;''',s)
def billing(s):
 if '// GEO_CALLING_RESERVE_V1' in s:return s
 s="import {geoCallingAccess,assertGeoRate} from './geoCalling.js';\n"+s
 s=once(s,"const provider=identity?.provider||'flowroute';",'''const provider=identity?.provider||'flowroute';
  // GEO_CALLING_RESERVE_V1
  if(provider==='hp-inc')throw Error('HP Inc termination adapter not commissioned');
  const geoAccess=await geoCallingAccess(db,{tenantId:actor.tenant_id,userId:actor.user_id,provider,callerId:identity?.callerId||adapterTrunk(await flowrouteTrunk(db,actor.tenant_id)).callerId,proof:data.locationProof});
  if(!geoAccess.allowed)throw Error(geoAccess.reason);''')
 s=once(s,"[actor.tenant_id,destination,provider])).rows[0];","[actor.tenant_id,destination,provider,geoAccess.deckId||null])).rows[0];")
 s=once(s,"AND d.provider=$3 AND d.active=TRUE","AND d.provider=$3 AND (($4 IS NULL AND d.active=TRUE) OR d.id=$4)")
 return once(s,"if(!rate)throw Error('Active carrier rate required for destination');","if(!rate)throw Error('Active carrier rate required for destination');\n  assertGeoRate(geoAccess,rate.deck_id);")
def rates(s):
 if '// GEO_CALLING_RATE_QUOTE_V1' in s:return s
 s="import {geoCallingAccess,assertGeoRate} from './geoCalling.js';\n"+s
 s=once(s,'handleFlowrouteRates({req,res,path,user,pool,send})','handleFlowrouteRates({req,res,path,user,pool,send,sessionHash})')
 s=once(s,"const buying=path.startsWith('/api/admin/');",'''const buying=path.startsWith('/api/admin/');
    // GEO_CALLING_RATE_QUOTE_V1
    const geoAccess=buying?{allowed:true,enabled:false}:await geoCallingAccess(pool,{tenantId:user.tenant_id,userId:user.id,provider:'flowroute',sessionHash,checkCallerId:false});
    if(!geoAccess.allowed)return send(res,403,{error:geoAccess.reason});''')
 s=once(s,"d.provider='flowroute' AND d.active=TRUE AND r.effective_at","d.provider='flowroute' AND (($3 IS NULL AND d.active=TRUE) OR d.id=$3) AND r.effective_at")
 s=once(s,"[user.tenant_id,query]);","[user.tenant_id,query,geoAccess.deckId||null]);")
 s=once(s,'SELECT r.prefix,r.destination,r.price_usd_per_minute,','SELECT r.deck_id,r.prefix,r.destination,r.price_usd_per_minute,')
 return once(s,"return send(res,200,{rate:rows.rows[0]||null,currency:'USD',unit:'minute',markupPercent:30,quoteOnly:true});",'''if(rows.rows[0]){try{assertGeoRate(geoAccess,rows.rows[0].deck_id);}catch(e){return send(res,403,{error:e.message});}}
    return send(res,200,{rate:rows.rows[0]||null,currency:'USD',unit:'minute',markupPercent:30,quoteOnly:true,geofence:buying?undefined:{country:geoAccess.country||null,zone:geoAccess.zone||null,deckId:geoAccess.deckId||null}});''')
def ui(s):
 if '// GEO_CALLING_UI_V1' in s:return s
 s="import {setupHpInterconnectUi} from './hpInterconnectUi.js';\nimport {setupGeoCallingUi} from './geoCallingUi.js';\n"+s
 s=once(s,"const {rate}=await apiGet('/api/rates/flowroute/search?prefix='", "const {rate,geofence}=await apiGet('/api/rates/flowroute/search?prefix='")
 s=once(s, "${rate.sub_interval}s thereafter`", "${rate.sub_interval}s thereafter${geofence?.zone?' · Area: '+geofence.zone:geofence?.country?' · Origin: '+geofence.country:''}`")
 return once(s,'setupInboundRoutingUi({document,',"// GEO_CALLING_UI_V1\nsetupHpInterconnectUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupGeoCallingUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupInboundRoutingUi({document,")
edit('services/api/server.js',server)
edit('services/api/locationPolicy.js',location)
edit('services/api/pstnBilling.js',billing)
edit('services/api/flowrouteRates.js',rates)
edit('apps/web/src/main.js',ui)
for p,s in changes:p.write_text(s)
print('Geographic trunk/rate policy integrated. Existing carrier identity, pricing, wallet, trial and geofence paths preserved.')
