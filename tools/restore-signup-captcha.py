from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown CAPTCHA restoration anchor; no files changed: '+a[:90])
 return s.replace(a,b)
p=root/'services/api/onboarding.js';s=p.read_text()
if '// SIGNUP_GUARD_V1' in s:
 s=once(s,'// SIGNUP_GUARD_V1\n','')
 for a,b in [
 ('import {issueCaptcha,consumeCaptcha,migrateSignupGuard}','import {issueCaptcha,consumeCaptcha}'),
 ('\n  await migrateSignupGuard(pool);',''),
 ('issueCaptcha(pool,req)','issueCaptcha(pool)'),
 ('consumeCaptcha(pool,input.captchaId,input.captchaAnswer,req)','consumeCaptcha(pool,input.captchaId,input.captchaAnswer)'),
 ("\n    if(input.website)return send(res,400,{error:'Unable to accept this registration'});",''),
 ('Signup check expired or was submitted too quickly. Please submit again.','Invalid or expired CAPTCHA. Refresh and try again.')]:s=once(s,a,b)
 changes.append((p,s))
p=root/'apps/web/src/main.js';s=p.read_text()
if '// SIGNUP_GUARD_V1' in s:
 s=once(s,'// SIGNUP_GUARD_V1\n','')
 a='<input name="captchaId" type="hidden"><input name="captchaAnswer" type="hidden"><label aria-hidden="true" style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label><p>Signup is protected automatically. No image puzzle is required.</p>'
 b='<input name="captchaId" type="hidden"><img id="signup-captcha-image" alt="CAPTCHA challenge: enter the six digits shown" width="240" height="76">\n      <button id="signup-captcha-refresh" type="button">New CAPTCHA</button>\n      <label>CAPTCHA digits <input name="captchaAnswer" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" required></label>'
 s=once(s,a,b)
 a=" if(!signupCaptcha.ready()){await refreshSignupCaptcha();if(!signupCaptcha.ready()){$('#account-status').textContent='Signup protection is temporarily unavailable. Try again shortly.';return;}}"
 b=" if(!signupCaptcha.ready()){await refreshSignupCaptcha();$('#account-status').textContent=signupCaptcha.ready()?'CAPTCHA refreshed. Enter the new six digits, then submit again.':'CAPTCHA unavailable. Tap New CAPTCHA to retry.';return;}"
 s=once(s,a,b);changes.append((p,s))
if s.count('id="signup-captcha-image"')!=1 or s.count('name="captchaAnswer"')!=1:raise SystemExit('Unknown installed CAPTCHA form; no files changed')
for p,s in changes:p.write_text(s)
print('Image CAPTCHA restored; registration recovery, country selection and other integrations preserved.')
