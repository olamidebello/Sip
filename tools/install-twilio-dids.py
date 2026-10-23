from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown Twilio DID integration anchor; no source changed: '+a[:100])
 return s.replace(a,b)
def api(s):
 if '// TWILIO_DID_CHECKOUT_V1' in s:return s
 s="import {migrateTwilioDids,handleTwilioDids,startTwilioDidRenewals} from './twilioDids.js';\n// TWILIO_DID_CHECKOUT_V1\n"+s
 s=once(s,"      if(path==='/api/twilio'||path.startsWith('/api/twilio/')","      if(path==='/api/twilio/dids'||path.startsWith('/api/twilio/dids/')||path==='/api/admin/twilio/dids'||path.startsWith('/api/admin/twilio/dids/'))return await handleTwilioDids({req,res,path,user,pool,send,readJson,sessionHash:tokenHash(currentToken(req))});\n"+"      if(path==='/api/twilio'||path.startsWith('/api/twilio/')")
 return once(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\nawait migrateTwilioDids(pool);\nstartTwilioDidRenewals(pool);')
def ui(s):
 if '// TWILIO_DID_CHECKOUT_UI_V1' in s:return s
 s="import {setupTwilioDidUi} from './twilioDidUi.js';\nimport {providerBadge as didProviderBadge} from './providerLabels.js';\n// TWILIO_DID_CHECKOUT_UI_V1\n"+s
 s=once(s,'const signupCaptcha=setupSignupCaptcha({document,get:apiGet});',"setupTwilioDidUi({document,get:apiGet,request:accountRequest,getUserId:()=>softphoneUserId,isSuper:()=>activeRole==='super_admin'});\nconst signupCaptcha=setupSignupCaptcha({document,get:apiGet});")
 s=once(s,'<option value="inhouse">In-house</option><option value="flowroute">Flowroute</option><option value="didww">DIDWW</option>','<option value="inhouse">SMO · SmoothDID</option><option value="flowroute">FLO · Flowroute</option><option value="didww">DID · DIDWW</option><option value="twilio">TWI · Twilio</option>')
 s=once(s,'async function searchProviderNumbers(offset) {','async function searchProviderNumbers(offset) {\n  if($("#number-provider").value===\'twilio\'){document.dispatchEvent(new CustomEvent(\'twilio-did-search\'));return;}')
 s=once(s,'li.textContent = `${number.number}: ${money(number.setupCents)} setup, ${money(number.monthlyCents)}/month`;','li.textContent = `[${didProviderBadge(number.provider||$("#number-provider").selectedOptions[0].textContent.split(" · ").pop())}] ${number.number}: ${money(number.setupCents)} setup, ${money(number.monthlyCents)}/month`;')
 s=once(s,'li.textContent=`${number.number_e164}: ${money(number.setup_cents)} setup, ${money(number.monthly_cents)}/month — `;','li.textContent=`[SMO] ${number.number_e164}: ${money(number.setup_cents)} setup, ${money(number.monthly_cents)}/month — `;')
 return s
changes=[]
for file,fn in [('services/api/server.js',api),('apps/web/src/main.js',ui)]:
 p=root/file;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Twilio DID quote, wallet checkout, unique allocation, renewal/release and super-admin controls integrated. New checkout defaults OFF until approved.')
