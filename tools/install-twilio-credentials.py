from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown Twilio credential integration anchor; no source changed: '+a[:90])
 return s.replace(a,b)
def api(s):
 if '// TWILIO_CREDENTIAL_CONTROLS_V1' in s:return s
 s=once(s,r'''export function validateHub(b,old={}){if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.version)||b.version<0)throw Error('Enabled state and current version required');const c={...old};for(const f of fields){if(b[f]!==undefined&&!text(b[f],512))throw Error('Invalid credential field');if(b[f])c[f]=b[f].trim();}for(const [f,prefix]of [['accountSid','AC'],['apiKeySid','SK'],['verifyServiceSid','VA'],['messagingServiceSid','MG']])if(c[f]&&!new RegExp('^'+prefix+'[a-f0-9]{32}$','i').test(c[f]))throw Error('Invalid '+f);if(!!c.apiKeySid!==!!c.apiKeySecret)throw Error('API key SID and secret must be supplied together');if(b.enabled&&(!c.accountSid||!(c.authToken||c.apiKeySid&&c.apiKeySecret)))throw Error('Account SID and Auth Token or API key pair required');return c;}''',r'''export function validateHub(b,old={}){if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.version)||b.version<0)throw Error('Enabled state and current version required');const c={...old};const cleared=b.clearFields||[];if(!Array.isArray(cleared)||cleared.length>fields.length||cleared.some(f=>!fields.includes(f))||new Set(cleared).size!==cleared.length)throw Error('Choose valid credential fields to remove');if(cleared.includes('apiKeySid')!==cleared.includes('apiKeySecret'))throw Error('Remove the API key SID and secret together');for(const f of cleared){if(b[f])throw Error('Cannot replace and remove the same credential');delete c[f];}for(const f of fields){if(b[f]!==undefined&&!text(b[f],512))throw Error('Invalid credential field');if(b[f])c[f]=b[f].trim();}for(const [f,prefix]of [['accountSid','AC'],['apiKeySid','SK'],['verifyServiceSid','VA'],['messagingServiceSid','MG']])if(c[f]&&!new RegExp('^'+prefix+'[a-f0-9]{32}$','i').test(c[f]))throw Error('Invalid '+f);if(!!c.apiKeySid!==!!c.apiKeySecret)throw Error('API key SID and secret must be supplied together');if(b.enabled&&(!c.accountSid||!(c.authToken||c.apiKeySid&&c.apiKeySecret)))throw Error('Account SID and Auth Token or API key pair required');return c;}''')
 s=once(s,'export async function migrateTwilioHub(db){for(const sql of [','export async function migrateTwilioHub(db){for(const sql of [\n'+r''' `CREATE TABLE IF NOT EXISTS twilio_credential_tests(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,hub_version INT NOT NULL,report JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX tw_credential_history(tenant_id,created_at)) ENGINE=InnoDB`,
''')
 s=once(s,'e.providerStatus=response.status;throw e;','e.providerStatus=response.status;e.providerCode=data.code;throw e;')
 s=once(s," if(admin&&(path===root+'/roles'||path.startsWith(root+'/roles/')))"," if(admin&&(path===root+'/credentials'||path.startsWith(root+'/credentials/'))){const {handleTwilioCredentials}=await import('./twilioCredentials.js');return await handleTwilioCredentials({req,res,path,user,pool,send,readJson});}\n"+" if(admin&&(path===root+'/roles'||path.startsWith(root+'/roles/')))")
 return '// TWILIO_CREDENTIAL_CONTROLS_V1\n'+s
def ui(s):
 if '// TWILIO_CREDENTIAL_CONTROLS_UI_V1' in s:return s
 s=once(s,'admin.append(box);billing.append(portal);','admin.append(box);billing.append(portal);const credentialControls=setupTwilioCredentialControls({host:box,document,get,request,getUserId,isSuper});')
 s=once(s,'providerRoles?.dispose();box.remove();','providerRoles?.dispose();credentialControls.dispose();box.remove();')
 return "import {setupTwilioCredentialControls} from './twilioCredentialControls.js';\n// TWILIO_CREDENTIAL_CONTROLS_UI_V1\n"+s
changes=[]
for file,fn in [('services/api/twilioHub.js',api),('apps/web/src/twilioHubUi.js',ui)]:
 p=root/file;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Super-admin credential status, removal, read-only access checks and test history integrated. Existing roles, DID and readiness controls retained.')

