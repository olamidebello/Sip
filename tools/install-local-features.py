"""Guarded, additive integration of signup, delegated Admin and visible trunk controls."""
from pathlib import Path
import argparse
import json
import hashlib

NEW_FILES = [
 'services/api/featureModuleGraph.mjs',
 'services/api/quickSignup.js','services/api/quickSignup.test.js',
 'services/api/adminGroup.js','services/api/adminGroup.test.js','services/api/manage-admin-group.js',
 'apps/web/src/quickSignup.js','apps/web/src/quickSignup.test.js',
 'apps/web/src/adminGroup.js','apps/web/src/adminGroup.test.js',
 'apps/web/src/trunkAdmin.js','apps/web/src/trunkAdmin.test.js',
]
SHARED = ['services/api/onboarding.js','services/api/messagingWebhooks.js','services/api/server.js',
 'services/api/migrate.js','services/api/trunkManagement.js','services/api/trunkManagement.test.js',
 'apps/web/src/main.js','apps/web/src/adminNavigation.js']

def once(text, old, new, name):
 if new in text:
  if text.count(new)!=1: raise ValueError('Duplicate integration in '+name)
  return text
 if text.count(old)!=1: raise ValueError('Unknown integration anchor in '+name+'; no files changed')
 return text.replace(old,new,1)

def plan_changes(source, target):
 changes={}
 for name in SHARED:
  p=target/name
  if not p.is_file() or p.is_symlink(): raise ValueError('Missing or symlinked integration file: '+name)
  changes[name]=p.read_text()
 def patch(name,old,new): changes[name]=once(changes[name],old,new,name)
 def imp(name,line):
  text=changes[name]
  if line in text:return
  module=line.split(' from ')[-1]
  if module in text:raise ValueError('Unfamiliar existing import in '+name)
  changes[name]=line+'\n'+text
 imp('services/api/onboarding.js',"import {migrateQuickSignup} from './quickSignup.js';")
 patch('services/api/onboarding.js','export async function migrateOnboarding(pool) {','export async function migrateOnboarding(pool) {\n  await migrateQuickSignup(pool);')
 imp('services/api/messagingWebhooks.js',"import {acceptQuickSignup} from './quickSignup.js';")
 patch('services/api/messagingWebhooks.js','handleFlowrouteWebhook({req,res,path,pool,send})','handleFlowrouteWebhook({req,res,path,pool,send,origin=process.env.PUBLIC_ORIGIN})')
 patch('services/api/messagingWebhooks.js',"    if(match[2]==='sms') await queueSubscriberSms", "    if(match[2]==='sms') await acceptQuickSignup(pool,event,{tenantId:tenant(),origin});\n    if(match[2]==='sms') await queueSubscriberSms")
 imp('services/api/migrate.js',"import {migrateAdminGroup} from './adminGroup.js';")
 patch('services/api/migrate.js',"['access', () => migrateAccess(pool)],","['access', () => migrateAccess(pool)],\n      ['system_admin_group', () => migrateAdminGroup(pool)],")
 # Normalize the prior managed Admin integration without changing its semantics.
 old="      let user = await currentUser(req);"
 if old in changes['services/api/server.js'] and '      user=await scopedAdminUser(pool,user,path);' in changes['services/api/server.js']:
  changes['services/api/server.js']=changes['services/api/server.js'].replace(old,'      const user = await currentUser(req);',1).replace('      user=await scopedAdminUser(pool,user,path);','      Object.assign(user,await scopedAdminUser(pool,user,path));',1)
 imp('services/api/server.js',"import {handleQuickSignup,handleQuickProfile} from './quickSignup.js';")
 imp('services/api/server.js',"import {adminRouteAllowed,scopedAdminUser,handleAdminGroup,adminGroupPolicy} from './adminGroup.js';")
 patch('services/api/server.js','handleFlowrouteWebhook({req,res,path,pool,send})','handleFlowrouteWebhook({req,res,path,pool,send,origin})')
 anchor="    if(keyedBridge||path.startsWith('/api/admin/api-bridge/'))"
 patch('services/api/server.js',anchor,"""    if(path.startsWith('/api/admin/')){
      const viewer=await currentUser(req);
      if(!viewer)return send(res,401,{error:'Sign in required'});
      if(!await adminRouteAllowed(pool,viewer,path,req.method))return send(res,403,{error:'This action requires Super Admin or an assigned Admin group permission'});
    }
"""+anchor)
 anchor="    if (path.startsWith('/api/register'))"
 patch('services/api/server.js',anchor,"""    if (path.startsWith('/api/register/quick/')) return await handleQuickSignup({req,res,path,pool,send,readJson,origin});
    if (path==='/api/account/quick-profile') return await handleQuickProfile({req,res,pool,user:await currentUser(req),send,readJson});
"""+anchor)
 patch('services/api/server.js','      const user = await currentUser(req);\n      if (!user) return send(res, 401, { error: "Sign in required" });', '''      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Sign in required" });
      if(path==='/api/account/admin-access'&&req.method==='GET')return send(res,200,{role:user.role,policy:user.role==='admin'?await adminGroupPolicy(pool,user.tenant_id):null});
      Object.assign(user,await scopedAdminUser(pool,user,path));
      if(path.startsWith('/api/admin/system-admin-group'))return await handleAdminGroup({req,res,path,user,pool,send,readJson,meetingSignaling});''')
 name='services/api/trunkManagement.js'
 anchor='export async function handleTrunks({req,res,path,user,pool,send,readJson}){'
 patch(name,anchor,anchor+"\n  if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required for trunk management'});")
 patch('services/api/trunkManagement.test.js','const user={id:',"const user={role:'super_admin',id:")
 name='apps/web/src/main.js'
 for line in ["import {setupQuickSignup} from './quickSignup.js';","import {setupSystemAdminGroup} from './adminGroup.js';","import {setupTrunkAdmin} from './trunkAdmin.js';"]:imp(name,line)
 patch(name,'const navigationGroups=[',"""const trunkSuperAdmin=setupTrunkAdmin({document,get:apiGet,request:accountRequest,getRole:()=>activeRole,getUserId:()=>softphoneUserId,show:showWorkspace});
const systemAdminGroup=setupSystemAdminGroup({document,get:apiGet,request:accountRequest,getRole:()=>activeRole,getUserId:()=>softphoneUserId,show:showWorkspace});
const navigationGroups=[""")
 patch(name,'const signupCaptcha=setupSignupCaptcha',"const quickSignup=setupQuickSignup({document,get:apiGet,request:accountRequest,getUserId:()=>softphoneUserId});\nconst signupCaptcha=setupSignupCaptcha")
 patch(name,'  softphoneUserId=user.id;','  softphoneUserId=user.id;\n  void quickSignup.refreshProfile();\n  void systemAdminGroup.refresh();\n  void trunkSuperAdmin.refresh().catch(()=>{});')
 patch(name,'softphoneLoad++;softphoneUserId=null;favorites.clear();','softphoneLoad++;softphoneUserId=null;void quickSignup.refreshProfile();void systemAdminGroup.refresh();void trunkSuperAdmin.refresh();favorites.clear();')
 patch(name,'function navigationAllowed(target){let node=',"function navigationAllowed(target){if(activeRole==='admin'&&adminTarget(target)&&target!=='delegated-admin-panel')return false;let node=")
 patch(name,'  if(target==="top")target=userHome();','  if(target==="top")target=userHome();\n  if(activeRole===\'admin\'&&target===\'admin\')target=\'delegated-admin-panel\';')
 patch(name,'  if(!adminTarget(target)&&navigationPolicy&&!navigationAllowed(target))return false;','  if(navigationPolicy&&!navigationAllowed(target))return false;')
 name='apps/web/src/adminNavigation.js'
 patch(name,"['group-admin','Users & groups'],","['system-admin-group','Admin group access',superOnly],['delegated-admin-panel','Admin workspace',['admin']],['group-admin','Users & groups'],")
 patch(name,"['carrier-console','Carriers & termination'],","['trunk-super-admin','SIP trunks',superOnly],['carrier-console','Carriers & termination'],")
 # Refuse to silently replace a locally edited new module on repeated deployments.
 for name in NEW_FILES:
  p=source/name
  if not p.is_file():raise ValueError('Feature source missing: '+name)
  existing=target/name
  if existing.exists() and (existing.is_symlink() or existing.read_bytes()!=p.read_bytes()):raise ValueError('Existing feature module differs: '+name+'; no files changed')
  changes[name]=p.read_text()
 return {name:text for name,text in changes.items() if not (target/name).exists() or (target/name).read_text()!=text}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('target',type=Path);parser.add_argument('manifest',type=Path);args=parser.parse_args()
 try:changes=plan_changes(args.source.resolve(),args.target.resolve())
 except ValueError as e:raise SystemExit(str(e))
 manifest={'files':[{'path':name,'existed':(args.target/name).exists(),'before_sha256':hashlib.sha256((args.target/name).read_bytes()).hexdigest() if (args.target/name).exists() else None} for name in changes]}
 # Planning succeeds for every integration before any destination is written.
 for name,text in changes.items():
  p=args.target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 args.manifest.write_text(json.dumps(manifest))
 print('Guarded feature integration prepared; '+str(len(changes))+' source files updated. Compose and environment files untouched.')
if __name__=='__main__':main()
