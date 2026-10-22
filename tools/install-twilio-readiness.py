from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown readiness integration anchor; no source changed: '+a[:100])
 return s.replace(a,b)
def api(s):
 if '// TWILIO_READINESS_V1' in s:return s
 return replace(s," if(admin&&(path===root+'/roles'", " // TWILIO_READINESS_V1\n if(admin&&path===root+'/readiness'){const {handleTwilioReadiness}=await import('./twilioReadiness.js');return await handleTwilioReadiness({req,res,pool,user,send});}\n if(admin&&(path===root+'/roles'")
def ui(s):
 if '// TWILIO_READINESS_UI_V1' in s:return s
 s="import {setupTwilioReadinessUi} from './twilioReadinessUi.js';\n// TWILIO_READINESS_UI_V1\n"+s
 s=replace(s,'admin.append(box);billing.append(portal);',"admin.append(box);billing.append(portal);const readiness=setupTwilioReadinessUi({document,get,request,isSuper,getUserId});")
 return replace(s,'providerRoles?.dispose();','providerRoles?.dispose();readiness?.dispose();')
for path,fn in [('services/api/twilioHub.js',api),('apps/web/src/twilioHubUi.js',ui)]:
 p=root/path;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Super-admin Twilio readiness controls integrated; no live feature status inferred.')
