from pathlib import Path
import re,sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo');changes=[]
def once(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown administration integration anchor; no source changed: '+a[:90])
 return s.replace(a,b)
def edit(path,fn):
 p=root/path;changes.append((p,fn(p.read_text())))
def server(s):
 if '// CALLER_VERIFY_SERVER_V1' in s:return s
 s="import {migrateUserAppearance,handleUserAppearance} from './userAppearance.js';\nimport {migrateCallerVerification,handleCallerVerification} from './callerVerification.js';\n"+s
 s=once(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\n// CALLER_VERIFY_SERVER_V1\nawait migrateCallerVerification(pool);\nawait migrateUserAppearance(pool);')
 s=once(s,"      if(path==='/api/admin/provider-management'", "      if(path==='/api/caller-verification'||path.startsWith('/api/caller-verification/')||path==='/api/admin/caller-verification'||path.startsWith('/api/admin/caller-verification/'))return await handleCallerVerification({req,res,path,user,pool,send,readJson});\n      if(path==='/api/admin/provider-management'")
 s=once(s,'if (path==="/api/activity/events"', 'if (path.startsWith("/api/smoothdid/") || path==="/api/caller-verification" || path.startsWith("/api/caller-verification/") || path==="/api/activity/events"')
 s=once(s,"      if(path==='/api/caller-verification'","      if(path==='/api/account/appearance')return await handleUserAppearance({req,res,user,pool,send,readJson});\n      if(path==='/api/caller-verification'")
 return once(s,'WHERE s.token_hash=$1 AND s.expires_at>now()', 'WHERE s.token_hash=$1 AND NOT EXISTS(SELECT 1 FROM caller_verification_principals cvp WHERE cvp.user_id=u.id) AND s.expires_at>now()')
def billing(s):
 if '// CALLER_VERIFY_IDENTITY_V1' in s:return s
 s="import {applyVerifiedCallerIdentity} from './callerVerification.js';\n"+s
 start=s.index('export async function reservePstn(');a=s[:start];b=s[start:]
 pattern=r'const identity=([^;]+);'
 if len(re.findall(pattern,b))!=1:raise SystemExit('Unknown caller identity layout; no source changed')
 b=re.sub(pattern,lambda m:'let identity='+m[1]+";\n  // CALLER_VERIFY_IDENTITY_V1\n  identity=await applyVerifiedCallerIdentity(db,{tenantId:actor.tenant_id,userId:actor.user_id,identity});",b)
 return a+b
def ui(s):
 if '// ADMIN_WORKSPACE_UI_V1' in s:return s
 s="import {setupUserAppearanceUi} from './userAppearanceUi.js';\nimport {setupAdminWorkspaceUi} from './adminWorkspaceUi.js';\nimport {setupCallerVerificationUi} from './callerVerificationUi.js';\n"+s
 return once(s,'setupInboundRoutingUi({document,',"// ADMIN_WORKSPACE_UI_V1\nsetupUserAppearanceUi({document,get:apiGet,request:accountRequest,getUserId:()=>softphoneUserId,show:showWorkspace,getView:()=>activeView,canNavigate:navigationAllowed});\nsetupCallerVerificationUi({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId});\nsetupAdminWorkspaceUi({document,isSuper:()=>activeRole==='super_admin',getUserId:()=>softphoneUserId});\nsetupInboundRoutingUi({document,")
def sms(s):
 if '// PROVIDER_SMS_GUARD_V1' in s:return s
 s="import {providerAccess} from './providerManager.js';\n"+s
 return once(s,'export async function handleExternalSms({req,res,path,user,pool,send,readJson}) {', "export async function handleExternalSms({req,res,path,user,pool,send,readJson}) {\n // PROVIDER_SMS_GUARD_V1\n if(req.method==='POST'){const p=await providerAccess(pool,user.tenant_id,'flowroute','sms');if(!p.allowed)return send(res,403,{error:p.reason});}")
edit('services/api/server.js',server)
edit('services/api/pstnBilling.js',billing)
edit('apps/web/src/main.js',ui)
edit('services/api/messagingWebhooks.js',sms)
for p,s in changes:p.write_text(s)
print('Professional administration grouping, caller DID verification and restricted verification service account integrated.')
