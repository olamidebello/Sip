from pathlib import Path
import sys,re
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
 # The legacy provider selector is optional: newer country/area shops replace it.
 # Only add its Twilio option when its known search handler can dispatch safely.
 selector=re.search(r'''<select\b(?=[^>]*\sid\s*=\s*["']number-provider["'])[^>]*>[\s\S]*?</select>''',s)
 handler='async function searchProviderNumbers(offset) {'
 if selector and handler in s:
  block=selector.group(0)
  for key,label in [('inhouse','SMO · SmoothDID'),('flowroute','FLO · Flowroute'),('didww','DID · DIDWW')]:
   block=re.sub(r'''(<option\b[^>]*\bvalue=["']'''+key+r'''["'][^>]*>)[^<]*(</option>)''',lambda m:m.group(1)+label+m.group(2),block)
  if not re.search(r'''<option\b[^>]*\bvalue=["']twilio["']''',block):
   block=block.replace('</select>','<option value="twilio">TWI · Twilio</option></select>')
  s=s[:selector.start()]+block+s[selector.end():]
  s=once(s,handler,handler+'''\n  if($("#number-provider").value==='twilio'){document.dispatchEvent(new CustomEvent('twilio-did-search'));return;}''')
  # These renderers are optional; modern shops keep their existing implementation.
  s=s.replace('li.textContent = `${number.number}: ${money(number.setupCents)} setup, ${money(number.monthlyCents)}/month`;',
              'li.textContent = `[${didProviderBadge(number.provider||$("#number-provider").selectedOptions[0].textContent.split(" · ").pop())}] ${number.number}: ${money(number.setupCents)} setup, ${money(number.monthlyCents)}/month`;')
  s=s.replace('li.textContent=`${number.number_e164}: ${money(number.setup_cents)} setup, ${money(number.monthly_cents)}/month — `;',
              'li.textContent=`[SMO] ${number.number_e164}: ${money(number.setup_cents)} setup, ${money(number.monthly_cents)}/month — `;')

 return s
changes=[]
for file,fn in [('services/api/server.js',api),('apps/web/src/main.js',ui)]:
 p=root/file;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Twilio DID quote, wallet checkout, unique allocation, renewal/release and super-admin controls integrated. New checkout defaults OFF until approved.')

