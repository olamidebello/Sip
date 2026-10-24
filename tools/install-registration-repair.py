from pathlib import Path
import sys
import re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path("/opt/olamide/repo")
patches={'services/api/onboarding.js': [('export async function handleOnboarding({req,res,path,pool,send,readJson,origin}) {', 'async function registrationHandler({req,res,path,pool,send,readJson,origin}) {'), ("import { validateRegistration, hashPassword } from './security.js';", "import { hashPassword } from './security.js';")], 'services/api/twilioAccountAuth.js': [("if(!policy[purpose]||!row||row.status!=='pending'||row.attempts>=5||Number(row.expires_ms)<=Date.now()", "if(!policy[purpose]||!row||(!['pending',...(purpose==='signup'?['consumed']:[])].includes(row.status))||(row.status!=='consumed'&&row.attempts>=5)||Number(row.expires_ms)<=Date.now()"), (' await db.query("UPDATE twilio_account_challenges SET status=\'checking\',attempts=attempts+1 WHERE token_hash=$1",[digest(token)]);', ' if(purpose===\'signup\'&&row.status===\'consumed\')return true;\n await db.query("UPDATE twilio_account_challenges SET status=\'checking\',attempts=attempts+1 WHERE token_hash=$1",[digest(token)]);'), (' }catch(e){return send(res,409,{error:e.message});}', ' }catch(e){if(e.code||e instanceof TypeError){const result=registrationFailure(e);return send(res,result.status,result.body);}return send(res,409,{error:e.message});}')], 'apps/web/src/main.js': [('  const data = await response.json();\n  if (!response.ok) {const error=new Error(data.error || "Account request failed");error.status=response.status;const retry=Number(response.headers.get(\'Retry-After\')||data.retryAfter);if(Number.isFinite(retry)&&retry>0)error.retryAfter=retry;throw error;}\n  return data;', '  return accountJson(response);'), ('button.disabled=true;let created=false,failureMessage;', 'button.disabled=true;let created=false,failureMessage,failureError;'), ('catch(error){failureMessage=error.message;}', 'catch(error){failureMessage=error.message;failureError=error;}'), ("finally{button.disabled=false;if(!created){await refreshSignupCaptcha();$('#account-status').textContent=failureMessage+' '+(signupCaptcha.ready()?'Enter the new CAPTCHA and try again.':'CAPTCHA unavailable. Tap New CAPTCHA to retry.');}}", "finally{button.disabled=false;if(!created){const notice=signupFailureNotice(failureError);if(notice.refreshCaptcha)await refreshSignupCaptcha();$('#account-status').textContent=notice.text;}}")]}
patches['services/api/twilioAccountAuth.js'] += [('SELECT u.id,u.tenant_id FROM twilio_account_challenges c','SELECT u.id,u.tenant_id,u.status,c.status AS challenge_status,c.expires_ms FROM twilio_account_challenges c'),("AND u.status='pending_email'\",[digest(b.authChallenge)])","AND u.status IN ('pending_email','active')\",[digest(b.authChallenge)])"),("if(!u)throw Error('Invalid verification');await consumeAccountChallenge","if(!u)throw Error('Invalid verification');if(u.status==='active'){if(u.challenge_status==='consumed'&&Number(u.expires_ms)>Date.now())return send(res,200,{status:'verified'});throw Error('Invalid verification');}await consumeAccountChallenge")]
prefixes={'services/api/onboarding.js': "import {signupInput,safeRegistration} from './registrationSafety.js';\n// REGISTRATION_REPAIR_V1\nconst validateRegistration=signupInput;\n", 'services/api/twilioAccountAuth.js': "import {registrationFailure} from './registrationSafety.js';\n// REGISTRATION_REPAIR_V1\n", 'apps/web/src/main.js': "import {accountJson,signupFailureNotice} from './registrationFeedback.js';\n// REGISTRATION_REPAIR_V1\n"}
def patch_account_json(source):
 start=re.search(r'^async function accountRequest\([^\n]*\)\s*\{',source,re.M)
 if not start:raise SystemExit('Unknown accountRequest function; no files changed')
 end=re.search(r'^async function apiGet\(',source[start.end():],re.M)
 if not end:raise SystemExit('Unknown accountRequest boundary; no files changed')
 boundary=start.end()+end.start()
 function=source[start.start():boundary]
 parsed=re.search(r'^[ \t]*const data\s*=\s*await response\.json\(\);',function,re.M)
 if not parsed:raise SystemExit('Unknown accountRequest JSON parsing; no files changed')
 close=function.rfind('}')
 tail=function[parsed.start():close].strip()
 # Recognize the legacy and status-aware parsers. Preserve the fetch setup and every unrelated function.
 normalize=lambda text:re.sub(r'\s+','',text).replace('"',"'")
 original=patches['apps/web/src/main.js'][0][0]
 variants=[original,
  "const data = await response.json(); if (!response.ok) throw new Error(data.error || \"Account request failed\"); return data;",
  "const data = await response.json(); if (!response.ok) {const error=new Error(data.error || \"Account request failed\");error.status=response.status;throw error;} return data;",
  "const data = await response.json(); if (!response.ok) { throw new Error(data.error || \"Account request failed\"); } return data;"]
 if normalize(tail) not in [normalize(v) for v in variants]:raise SystemExit('Unknown accountRequest response handling; no files changed')
 updated=function[:parsed.start()]+'  return accountJson(response);\n'+function[close:]
 return source[:start.start()]+updated+source[boundary:]
changes=[]
for name,replacements in patches.items():
 p=root/name;s=p.read_text()
 if "// REGISTRATION_REPAIR_V1" in s:continue
 for index,(a,b) in enumerate(replacements):
  if name=='apps/web/src/main.js' and index==0:
   s=patch_account_json(s);continue
  if s.count(a)!=1:raise SystemExit("Unknown registration integration anchor; no files changed: "+name+": "+a[:80])
  s=s.replace(a,b)
 s=prefixes[name]+s
 if name=="services/api/onboarding.js":s+="\nexport async function handleOnboarding(context){return safeRegistration(registrationHandler,context);}\n"
 changes.append((p,s))
for p,s in changes:p.write_text(s)
print("Registration validation, safe error diagnostics, activation recovery and frontend feedback integrated.")
