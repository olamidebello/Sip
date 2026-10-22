from pathlib import Path
import sys,yaml
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo');changes=[]
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unrecognized SMS integration anchor: '+a[:100])
 return s.replace(a,b)
p=root/'services/api/server.js';s=p.read_text()
if '// SMS_ROUTE_CONTROL_V1' not in s:
 s="import {outboundSmsRoute,handleSmsRouteControl,migrateSmsRouteControl} from './smsRouteControl.js';\n"+s
 s=once(s,'await migrateInboundRouting(pool);','await migrateInboundRouting(pool);\nawait migrateSmsRouteControl(pool);')
 s=once(s,"      if(path==='/api/admin/inbound-routing'","      // SMS_ROUTE_CONTROL_V1\n      if(path==='/api/admin/sms-routing'||path.startsWith('/api/admin/sms-routing/'))return await handleSmsRouteControl({req,res,path,user,pool,send,readJson});\n      if(path==='/api/admin/inbound-routing'")
 s=once(s,'try{const local=await deliverSubscriberSms({user,pool,input});',"try{const route=await outboundSmsRoute(pool,user,input);Object.assign(input,route.input);const local=route.carrierOnly?null:await deliverSubscriberSms({user,pool,input});")
changes.append((p,s))
p=root/'apps/web/src/main.js';s=p.read_text()
if '// SMS_ROUTE_CONTROL_UI_V1' not in s:
 s="import {setupSmsRouteControlUi} from './smsRouteControlUi.js';\n"+s
 s=once(s,'setupInboundRoutingUi({document,',"// SMS_ROUTE_CONTROL_UI_V1\nsetupSmsRouteControlUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId,show:showWorkspace});\nsetupInboundRoutingUi({document,")
changes.append((p,s))
p=root/'deployment/docker/compose.yml';data=yaml.safe_load(p.read_text());api=data['services']['api'];env=api.get('environment',{})
if isinstance(env,list):env=dict(item.split('=',1) if '=' in item else (item,None) for item in env)
if not isinstance(env,dict):raise SystemExit('Unsupported API environment layout')
env['SUBSCRIBER_ROUTING_ENABLED']='true';api['environment']=env
changes.append((p,yaml.safe_dump(data,sort_keys=False)))
p=root/'deployment/docker/.env';s=p.read_text();lines=[l for l in s.splitlines() if not l.startswith('SUBSCRIBER_ROUTING_ENABLED=')];lines.append('SUBSCRIBER_ROUTING_ENABLED=true');changes.append((p,'\n'.join(lines)+'\n'))
# Finish all source-layout checks before applying any changes.
for p,s in changes:p.write_text(s)
print('SMS route controls installed; existing subscriber delivery worker enabled. Mail credentials retained.')
