from pathlib import Path
import re,sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
p=root/'services/api/onboarding.js';s=p.read_text()
if '// SIGNUP_GUARD_V1' not in s:
 old=s
 s,n=re.subn(r'import\s*\{\s*issueCaptcha\s*,\s*consumeCaptcha\s*\}', 'import {issueCaptcha,consumeCaptcha,migrateSignupGuard}',s)
 if n!=1:raise SystemExit('Unknown signup guard import; no files changed')
 for a,b in [
 ('export async function migrateOnboarding(pool) {','export async function migrateOnboarding(pool) {\n  await migrateSignupGuard(pool);'),
 ('issueCaptcha(pool)','issueCaptcha(pool,req)'),
 ('consumeCaptcha(pool,input.captchaId,input.captchaAnswer)','consumeCaptcha(pool,input.captchaId,input.captchaAnswer,req)'),
 ("const input=await readJson(req);","const input=await readJson(req);\n    if(input.website)return send(res,400,{error:'Unable to accept this registration'});"),
 ('Invalid or expired CAPTCHA. Refresh and try again.','Signup check expired or was submitted too quickly. Please submit again.')]:
  if s.count(a)!=1:raise SystemExit('Unknown signup guard integration; no files changed: '+a[:65])
  s=s.replace(a,b)
 s='// SIGNUP_GUARD_V1\n'+s;changes.append((p,s))
p=root/'apps/web/src/main.js';s=p.read_text()
if '// SIGNUP_GUARD_V1' not in s:
 pattern=r'<input name="captchaId" type="hidden">.*?<label>CAPTCHA digits <input name="captchaAnswer"[^>]*></label>'
 replacement='<input name="captchaId" type="hidden"><input name="captchaAnswer" type="hidden"><label aria-hidden="true" style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label><p>Signup is protected automatically. No image puzzle is required.</p>'
 s,n=re.subn(pattern,replacement,s,flags=re.S)
 if n!=1:raise SystemExit('Unknown signup CAPTCHA markup; no files changed')
 s,n=re.subn(r"^ if\(!signupCaptcha.ready\(\)\).*?return;\}"," if(!signupCaptcha.ready()){await refreshSignupCaptcha();if(!signupCaptcha.ready()){$('#account-status').textContent='Signup protection is temporarily unavailable. Try again shortly.';return;}}",s,flags=re.M)
 if n!=1:raise SystemExit('Unknown signup submit guard; no files changed')
 s='// SIGNUP_GUARD_V1\n'+s;changes.append((p,s))
for p,s in changes:p.write_text(s)
print('Image CAPTCHA replaced with single-use form tokens, server throttling and a honeypot.')
