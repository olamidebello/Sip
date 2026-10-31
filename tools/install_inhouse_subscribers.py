import pathlib,sys,shutil
def once(s,a,b):
 if s.count(a)!=1:raise ValueError('INHOUSE_PATCH unknown source layout')
 return s.replace(a,b,1)
def patch_bridge(s):
 if '// INHOUSE_FREE_ROUTE_V1' in s:return s
 s=once(s," if(path==='/api/switch/kamailio/route'){"," if(path==='/api/switch/kamailio/route'){\n  // INHOUSE_FREE_ROUTE_V1\n  const included=await routeIncludedDid(pool,data);if(included)return included;")
 s=once(s," const identity=/^[a-zA-Z0-9]{2,64}$/;"," if(path==='/api/switch/kamailio/icn-inbound')return inboundIncludedDid(pool,data);\n const identity=/^[a-zA-Z0-9]{2,64}$/;")
 return "import {routeIncludedDid,inboundIncludedDid} from './inhouseSubscriber.js';\n"+s
def patch_access(s):
 if '// INHOUSE_FREE_ROUTE_V1' in s:return s
 s="import {ensureIncludedDid,inhouseNumber} from './inhouseSubscriber.js';\n"+s
 # Keep the number in the SIP target: the authenticated switch does the final
 # subscriber/ownership check, preventing direct usernames from bypassing it.
 s=once(s,"  const routed=await onlineNumberTarget", "  // INHOUSE_FREE_ROUTE_V1\n  const included=inhouseNumber(address.username);if(included){if(!await activeSubscription(pool,user))return {allowed:false,error:'Active subscription required'};return {allowed:true,scope:'internal',target:`sip:${included}@${address.domain}`,inhouse:true};}\n  const routed=await onlineNumberTarget")
 return once(s,'return send(res,200,{internalCalls:true,externalCalls:external,',"const includedDid=external?await ensureIncludedDid(pool,user):null;\n    return send(res,200,{includedDid,inhouseCallsFree:true,internalCalls:true,externalCalls:external,")
def patch_server(s):
 if '// INHOUSE_SUBSCRIBER_SCHEMA_V1' in s:return s
 return "import {migrateInhouseSubscribers} from './inhouseSubscriber.js';\n"+once(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\n// INHOUSE_SUBSCRIBER_SCHEMA_V1\nawait migrateInhouseSubscribers(pool);')
def patch_smooth(s):
 # Paid marketplace rentals remain available to subscribers; their included
 # number is a separate entitlement. Remove the prior deployment-only blocker.
 old=" // INHOUSE_SUBSCRIBER_NO_RENTAL_V1\n if(await subscriberActive(pool,user.tenant_id,user.id))throw Error('Your subscriber in-house DID is included free. Use your assigned number; no rental purchase is required.');"
 return s.replace(old,'')
if __name__=='__main__':
 root=pathlib.Path(sys.argv[1]);here=pathlib.Path(__file__).resolve().parents[1];pending=[]
 for name,fn in [('kamailioHttpBridge.js',patch_bridge),('callAccess.js',patch_access),('server.js',patch_server),('smoothDid.js',patch_smooth)]:
  p=root/'services/api'/name
  if p.is_symlink():raise ValueError('INHOUSE_PATCH symlink rejected')
  pending.append((p,fn(p.read_text())))
 target=root/'services/api/inhouseSubscriber.js'
 if target.is_symlink():raise ValueError('INHOUSE_PATCH symlink rejected')
 for p,s in pending:p.write_text(s)
 shutil.copyfile(here/'services/api/inhouseSubscriber.js',target)
 shutil.copyfile(here/'services/api/inhouseLifecycle.js',root/'services/api/inhouseLifecycle.js')

 if __name__=='__main__':shutil.copyfile(here/'services/api/inhouseActivation.js',root/'services/api/inhouseActivation.js')
