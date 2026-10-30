import pathlib,sys,shutil
def once(s,a,b):
 if s.count(a)!=1:raise ValueError('INHOUSE_LIFECYCLE_PATCH unknown layout')
 return s.replace(a,b,1)
def server(s):
 if '// INHOUSE_LIFECYCLE_SERVER_V1' in s:return s
 s="import {handleInhouseLifecycle,startInhouseLifecycle} from './inhouseLifecycle.js';\n"+s
 s=once(s,'await migrateInhouseSubscribers(pool);',"await migrateInhouseSubscribers(pool);\n// INHOUSE_LIFECYCLE_SERVER_V1\nconst stopInhouseLifecycle=startInhouseLifecycle(pool);")
 return once(s,"      if(path==='/api/softphone/access'||path==='/api/softphone/authorize')", "      if(path==='/api/softphone/inhouse-verification')return await handleInhouseLifecycle({req,res,user,pool,send,readJson});\n      if(path==='/api/softphone/access'||path==='/api/softphone/authorize')")
def webhook(s):
 if '// INHOUSE_SMS_VERIFY_V1' in s:return s
 return "import {acceptInhouseVerification} from './inhouseLifecycle.js';\n"+once(s,"    if(match[2]==='sms') await acceptQuickSignup", "    // INHOUSE_SMS_VERIFY_V1: after carrier authentication, never from a client-submitted sender.\n    if(match[2]==='sms')await acceptInhouseVerification(pool,event);\n    if(match[2]==='sms') await acceptQuickSignup")
def bridge(s):
 if '// INHOUSE_ACTIVITY_EVENTS_V1' in s:return s
 s="import {inhouseCallEvent} from './inhouseLifecycle.js';\n"+s
 return once(s,"if(path==='/api/switch/kamailio/billing-event')return settlePstn(pool,data);", "// INHOUSE_ACTIVITY_EVENTS_V1\n if(path==='/api/switch/kamailio/billing-event'){const onnet=await inhouseCallEvent(pool,data);return onnet||await settlePstn(pool,data);}")
def mainjs(s):
 if '// INHOUSE_VERIFICATION_UI_V1' in s:return s
 return "import {setupInhouseVerification} from './inhouseVerification.js';\n"+once(s,'function finishCall(result) {',"// INHOUSE_VERIFICATION_UI_V1\nsetupInhouseVerification({document,get:apiGet,request:accountRequest});\nfunction finishCall(result) {")
def switch(s):
 if '# INHOUSE_ACTIVITY_EVENTS_V1' in s:return s
 for t in ['event_route[dialog:start]','event_route[dialog:end]','18444/event']:
  if t not in s:raise ValueError('Durable dialog event queue required')
 # Track on-net subscriber calls through the existing durable dialog event queue.
 anchor='if ($var(route) == "pstn")'
 matches=__import__('re').search(r'if\s*\(\s*\$var\(route\)\s*==\s*"pstn"\s*\)',s)
 if not matches:raise ValueError('Paid route gate missing')
 hook='''# INHOUSE_ACTIVITY_EVENTS_V1
    if ($rU =~ "^([+]?23420315[0-4][0-9]{4}|020315[0-4][0-9]{4})$" && is_method("INVITE") && !has_totag()) {
        dlg_manage();
        $dlg_var(paid_key) = $(ci{s.md5}) + $(ft{s.md5});
    }
    '''
 s=s[:matches.start()]+hook+s[matches.start():]
 # The inbound route is source-restricted and also records its stable call key.
 old=r'''$var(inhouse_body) = "{\"sourceIp\":\"196.216.253.173\",\"destination\":\"" + $rU + "\"}";'''
 new=r'''$var(inhouse_body) = "{\"sourceIp\":\"196.216.253.173\",\"destination\":\"" + $rU + "\",\"callKey\":\"" + $(ci{s.md5}) + $(ft{s.md5}) + "\"}";'''
 s=once(s,old,new)
 return once(s,'    t_on_reply("INHOUSE_ICN_REPLY");','    dlg_manage();\n    $dlg_var(paid_key) = $(ci{s.md5}) + $(ft{s.md5});\n    t_on_reply("INHOUSE_ICN_REPLY");')
if __name__=='__main__':
 root=pathlib.Path(sys.argv[1]);stage=pathlib.Path(sys.argv[2]);here=pathlib.Path(__file__).resolve().parents[1];pending=[]
 for path,fn in [('services/api/server.js',server),('services/api/messagingWebhooks.js',webhook),('services/api/kamailioHttpBridge.js',bridge),('apps/web/src/main.js',mainjs)]:
  p=root/path
  if p.is_symlink():raise ValueError('Symlink rejected')
  pending.append((p,fn(p.read_text())))
 staged=switch(pathlib.Path(sys.argv[3] if len(sys.argv)>3 else '/etc/kamailio/kamailio.cfg').read_text())
 for p,t in pending:p.write_text(t)
 for path in ['services/api/inhouseLifecycle.js','apps/web/src/inhouseVerification.js']:shutil.copyfile(here/path,root/path)
 stage.write_text(staged);stage.chmod(0o640)
