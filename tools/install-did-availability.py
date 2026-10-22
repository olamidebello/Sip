from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown DID availability anchor; no source changed: '+a[:100])
 return s.replace(a,b)
def api(s):
 if '// DID_AVAILABILITY_V1' in s:return s
 s="import {handleDidAvailability} from './didAvailability.js';\n// DID_AVAILABILITY_V1\n"+s
 anchor='      if (path === "/api/numbers" && req.method === "GET") {'
 return replace(s,anchor,"      if(path==='/api/numbers/availability')return await handleDidAvailability({req,res,user,pool,send,sessionHash:tokenHash(currentToken(req))});\n"+anchor)
def ui(s):
 if '// DID_AVAILABILITY_UI_V1' in s:return s
 s="import {setupDidAvailabilityUi} from './didAvailabilityUi.js';\n// DID_AVAILABILITY_UI_V1\n"+s
 return replace(s,'const signupCaptcha=setupSignupCaptcha({document,get:apiGet});',"setupDidAvailabilityUi({document,get:apiGet,getUserId:()=>softphoneUserId});\nconst signupCaptcha=setupSignupCaptcha({document,get:apiGet});")
for path,fn in [('services/api/server.js',api),('apps/web/src/main.js',ui)]:
 p=root/path;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Read-only provider country/region inventory search integrated. Purchase paths unchanged.')
