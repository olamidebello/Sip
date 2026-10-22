from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown Twilio integration anchor; no source changed: '+a[:90])
 return s.replace(a,b)
def edit(path,fn):
 p=root/path;changes.append((p,fn(p.read_text())))
def server(s):
 if '// TWILIO_HUB_SERVER_V1' in s:return s
 s="import {migrateTwilioHub,handleTwilioHub} from './twilioHub.js';\n"+s
 s=replace(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\n// TWILIO_HUB_SERVER_V1\nawait migrateTwilioHub(pool);')
 s=replace(s,'if (path.startsWith("/api/smoothdid/")','if (path.startsWith("/api/twilio") || path.startsWith("/api/smoothdid/")')
 return replace(s,"      if(path==='/api/account/appearance')","      if(path==='/api/twilio'||path.startsWith('/api/twilio/')||path==='/api/admin/twilio'||path.startsWith('/api/admin/twilio/'))return await handleTwilioHub({req,res,path,user,pool,send,readJson});\n      if(path==='/api/account/appearance')")
def ui(s):
 if '// TWILIO_HUB_UI_V1' in s:return s
 s="import {setupTwilioHubUi} from './twilioHubUi.js';\n"+s
 return replace(s,'setupCallerVerificationUi({document,',"// TWILIO_HUB_UI_V1\nsetupTwilioHubUi({document,get:apiGet,request:accountRequest,getUserId:()=>softphoneUserId,isSuper:()=>activeRole==='super_admin'});\nsetupCallerVerificationUi({document,")
def caller(s):
 if '// TWILIO_HUB_VERIFY_V1' in s:return s
 s="import {twilioVoiceCredentials} from './twilioHub.js';\n// TWILIO_HUB_VERIFY_V1\n"+s
 return replace(s,"async function settings(db,tenant){const r=(await db.query('SELECT policy,ciphertext,version FROM caller_verification_settings WHERE tenant_id=$1',[tenant])).rows[0];if(!r)return null;const key=masterKey();return {policy:typeof r.policy==='string'?JSON.parse(r.policy):r.policy,version:Number(r.version),credentials:key?unseal(r.ciphertext,key,tenant,'voice-verification'):null};}","async function settings(db,tenant){const r=(await db.query('SELECT policy,ciphertext,version FROM caller_verification_settings WHERE tenant_id=$1',[tenant])).rows[0];const integrated=await twilioVoiceCredentials(db,tenant);if(!r)return integrated?.managed?{policy:{enabled:false,allowedPrefixes:[],dailyLimit:100},version:0,credentials:integrated.credentials}:null;const key=masterKey();return {policy:typeof r.policy==='string'?JSON.parse(r.policy):r.policy,version:Number(r.version),credentials:integrated?.managed?integrated.credentials:(key?unseal(r.ciphertext,key,tenant,'voice-verification'):null)};}")
edit('services/api/server.js',server)
edit('apps/web/src/main.js',ui)
edit('services/api/callerVerification.js',caller)
for p,s in changes:p.write_text(s)
print('Twilio provider hub and existing phone-verification credential bridge integrated.')

