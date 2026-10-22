from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def edit(name,fn):
 p=root/name;s=p.read_text();changes.append((p,fn(s)))
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unrecognized integration anchor: '+a[:90])
 return s.replace(a,b)
def server(s):
 if '// INBOUND_ROUTING_ADMIN_V1' in s:return s
 s="import {handleInboundRouting,migrateInboundRouting} from './inboundRouting.js';\n"+s
 s=replace(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\nawait migrateInboundRouting(pool);')
 return replace(s,"      if(path==='/api/vpn'","      // INBOUND_ROUTING_ADMIN_V1\n      if(path==='/api/admin/inbound-routing'||path.startsWith('/api/admin/inbound-routing/'))return await handleInboundRouting({req,res,path,user,pool,send,readJson});\n      if(path==='/api/vpn'")
def voice(s):
 if '// INBOUND_ROUTING_VOICE_V1' in s:return s
 s="import {resolveInboundRoute} from './inboundRouting.js';\n"+s
 return replace(s,'const owner=await didOwner(pool,tenant,number);', '''// INBOUND_ROUTING_VOICE_V1
 let owner=await didOwner(pool,tenant,number);
 if(owner){const selected=await resolveInboundRoute(pool,{tenantId:tenant,number,channel:'voice',ownerId:owner.user_id});if(!selected.userId)return [480,{error:'Inbound route unavailable'}];owner={...owner,user_id:selected.userId};}''')
def messages(s):
 if '// INBOUND_ROUTING_SMS_V1' in s:return s
 s="import {resolveInboundRoute} from './inboundRouting.js';\n"+s
 # Preserve the server's existing ownership resolver. Supported layouts are
 # the original messaging-number query and the local shared didOwner lookup.
 local="const owner = !match[2].endsWith('-dlr') ? await didOwner(pool,tenant(),event.recipient) : null;"
 if s.count(local)==1:
  owner_expr='owner?.user_id'
 elif s.count('[event.recipient,tenant()]) : {rows:[]};')==1:
  s=replace(s,'[event.recipient,tenant()]) : {rows:[]};',"['+'+event.recipient.replace(/^\\+/,''),tenant()]) : {rows:[]};")
  owner_expr='owner.rows[0]?.user_id'
 else:
  raise SystemExit('Unrecognized inbound message ownership layout; no source written')
 s=replace(s,'    const result = await pool.query(`INSERT IGNORE INTO flowroute_message_events', '''    // INBOUND_ROUTING_SMS_V1
    const selected = !match[2].endsWith('-dlr') ? await resolveInboundRoute(pool,{tenantId:tenant(),number:'+'+event.recipient.replace(/^\\+/,''),channel:'sms',ownerId:OWNER_EXPRESSION}) : null;
    const result = await pool.query(`INSERT IGNORE INTO flowroute_message_events'''.replace('OWNER_EXPRESSION',owner_expr))
 s=replace(s,owner_expr+' || null,event.id',"selected?.userId || null,event.id")
 s=replace(s,"if(match[2]==='sms') await queueSubscriberSms", "if(match[2]==='sms'&&selected?.userId) await queueSubscriberSms")
 return replace(s,"eventKey:`flowroute/${event.id}`});", "eventKey:`flowroute/${event.id}`,routedUserId:selected.userId});")
def subscriber(s):
 if '// INBOUND_ROUTING_COPY_V1' in s:return s
 s=replace(s,'eventKey,senderId=null})','eventKey,senderId=null,routedUserId=null})')
 return replace(s,' const recipient=await numberSubscriber(pool,tenantId,number);if(!recipient)return false;', ''' // INBOUND_ROUTING_COPY_V1
 const recipient=routedUserId?(await pool.query("SELECT u.id AS user_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.status='active' AND t.status='active'",[routedUserId,tenantId])).rows[0]:await numberSubscriber(pool,tenantId,number);if(!recipient)return false;''')
def ui(s):
 if '// INBOUND_ROUTING_UI_V1' in s:return s
 s="import {setupInboundRoutingUi} from './inboundRoutingUi.js';\n"+s
 return replace(s,'setupVpnUi({document,',"// INBOUND_ROUTING_UI_V1\nsetupInboundRoutingUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupVpnUi({document,")
edit('services/api/server.js',server)
edit('services/api/flowrouteDidRouting.js',voice)
edit('services/api/messagingWebhooks.js',messages)
edit('services/api/subscriberRouting.js',subscriber)
edit('apps/web/src/main.js',ui)
# Complete all layout checks before writing any source.
for p,s in changes:p.write_text(s)
print('Inbound routing integrated; carrier checks and local settings retained.')
