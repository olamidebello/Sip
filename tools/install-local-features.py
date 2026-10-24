"""Guarded, additive integration of signup, delegated Admin and visible trunk controls."""
from pathlib import Path
import argparse
import json
import hashlib
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from feature_patch_worker import PatchWorker

NEW_FILES = [
 'services/api/locationReportAddress.js','services/api/locationReportAddress.test.js',
 'apps/web/src/locationReportCsv.js','apps/web/src/locationReports.test.js',
 'services/api/featureModuleGraph.mjs',
 'services/api/quickSignup.js','services/api/quickSignup.test.js',
 'services/api/adminGroup.js','services/api/adminGroup.test.js','services/api/manage-admin-group.js',
 'apps/web/src/quickSignup.js','apps/web/src/quickSignup.test.js',
 'apps/web/src/adminGroup.js','apps/web/src/adminGroup.test.js',
 'apps/web/src/trunkAdmin.js','apps/web/src/trunkAdmin.test.js',
]
SHARED = ['services/api/onboarding.js','services/api/messagingWebhooks.js','services/api/server.js',
 'services/api/migrate.js','services/api/trunkManagement.js','services/api/trunkManagement.test.js',
 'apps/web/src/main.js','apps/web/src/adminNavigation.js',
 'services/api/locationReports.js','apps/web/src/locationReports.js']

def once(text, old, new, name):
 if new in text:
  if text.count(new)!=1: raise ValueError('Duplicate integration in '+name)
  return text
 if text.count(old)!=1: raise ValueError('Unknown integration anchor in '+name+'; no files changed')
 return text.replace(old,new,1)

def plan_changes(source, target, worker=None):
 changes={}
 errors=[]
 for name in SHARED:
  p=target/name
  if not p.is_file() or p.is_symlink():
   errors.append('Missing or symlinked integration file: '+name)
   continue
  changes[name]=p.read_text()
 def patch(name,old,new):
  if name not in changes:return
  try:changes[name]=once(changes[name],old,new,name)
  except ValueError:
   if worker:
    try:changes[name]=worker.call('once',text=changes[name],old=old,new=new)
    except ValueError as error:errors.append('SIP_FEATURE_DETAIL file='+name+' check='+str(error))
   else:errors.append('Unknown integration anchor in '+name+'; no files changed')
 def imp(name,line):
  if name not in changes:return
  text=changes[name]
  if line in text:return
  module=line.split(' from ')[-1]
  if module in text:
   errors.append('Unfamiliar existing import in '+name)
   return
  changes[name]=line+'\n'+text
 imp('services/api/onboarding.js',"import {migrateQuickSignup} from './quickSignup.js';")
 patch('services/api/onboarding.js','export async function migrateOnboarding(pool) {','export async function migrateOnboarding(pool) {\n  await migrateQuickSignup(pool);')
 imp('services/api/messagingWebhooks.js',"import {acceptQuickSignup} from './quickSignup.js';")
 patch('services/api/messagingWebhooks.js','handleFlowrouteWebhook({req,res,path,pool,send})','handleFlowrouteWebhook({req,res,path,pool,send,origin=process.env.PUBLIC_ORIGIN})')
 # Quick signup is independent of whether the DID has an inbox/routing recipient.
 # Integrate after event persistence, before delivery receipts and subscriber copies.
 hook="    if(match[2]==='sms') await acceptQuickSignup(pool,event,{tenantId:tenant(),origin});"
 webhook=changes.get('services/api/messagingWebhooks.js','')
 if 'await acceptQuickSignup(pool,event,' in webhook:
  if webhook.count(hook)!=1:errors.append('Unfamiliar existing import in services/api/messagingWebhooks.js')
 else:
  anchor="    if (match[2].endsWith('-dlr') && result.rowCount)"
  patch('services/api/messagingWebhooks.js',anchor,hook+'\n'+anchor)
 imp('services/api/migrate.js',"import {migrateAdminGroup} from './adminGroup.js';")
 patch('services/api/migrate.js',"['access', () => migrateAccess(pool)],","['access', () => migrateAccess(pool)],\n      ['system_admin_group', () => migrateAdminGroup(pool)],")
 # Parse the installed router rather than requiring a particular API bridge,
 # quote style, whitespace layout or adjacency of its existing authentication checks.
 try:
  if not worker:raise ValueError('parser_runtime')
  if 'services/api/server.js' in changes:changes['services/api/server.js']=worker.call('server',text=changes['services/api/server.js'])
 except ValueError as error:errors.append('SIP_FEATURE_DETAIL file=services/api/server.js check='+str(error))
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
 imp('services/api/locationReports.js',"import {profileAddress} from './locationReportAddress.js';")
 imp('apps/web/src/locationReports.js',"import {locationReportCsv} from './locationReportCsv.js';")
 patch('services/api/locationReports.js','SELECT h.user_id AS userId,u.display_name AS name,h.latitude,h.longitude,h.accuracy_meters AS accuracyMeters,h.recorded_at AS recordedAt FROM user_location_history h JOIN users u ON u.id=h.user_id AND u.tenant_id=h.tenant_id WHERE h.tenant_id=$1 ORDER BY h.recorded_at DESC,h.id DESC LIMIT 500','SELECT h.user_id AS userId,u.display_name AS name,h.latitude,h.longitude,h.accuracy_meters AS accuracyMeters,h.recorded_at AS recordedAt,p.address_line1 AS address1,p.address_line2 AS address2,p.city,p.region,p.postal_code AS postalCode,p.country FROM user_location_history h JOIN users u ON u.id=h.user_id AND u.tenant_id=h.tenant_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE h.tenant_id=$1 ORDER BY h.recorded_at DESC,h.id DESC LIMIT 500')
 patch('services/api/locationReports.js','entries:rows.rows,limit:500','entries:rows.rows.map(row=>({...row,profileAddress:profileAddress(row)})),limit:500')
 patch('apps/web/src/locationReports.js','Up to 500 newest entries are shown.','Up to 500 newest entries are shown. Address is the current user profile address and may differ from the saved GPS location.')
 patch('apps/web/src/locationReports.js','<th>Accuracy (m)</th>','<th>Accuracy (m)</th><th>Current profile address</th>')
 patch('apps/web/src/locationReports.js','for(const value of [e.name||e.userId,new Date(e.recordedAt).toLocaleString(),e.latitude,e.longitude,e.accuracyMeters])',"for(const value of [e.name||e.userId,new Date(e.recordedAt).toLocaleString(),e.latitude,e.longitude,e.accuracyMeters,e.profileAddress||'Not provided'])")
 patch('apps/web/src/locationReports.js','const values=[[\'User ID\',\'Saved at\',\'Latitude\',\'Longitude\',\'Accuracy meters\'],...entries.map(e=>[e.userId,e.recordedAt,e.latitude,e.longitude,e.accuracyMeters])];const csv=values.map(row=>row.map(v=>\'"\'+String(v??\'\').replace(/^[=+@-]/,"\'$&").replaceAll(\'"\',\'""\')+\'"\').join(\',\')).join(\'\\r\\n\')','const csv=locationReportCsv(entries)')
 # Refuse to silently replace a locally edited new module on repeated deployments.
 for name in NEW_FILES:
  p=source/name
  if not p.is_file():
   errors.append('Feature source missing: '+name)
   continue
  existing=target/name
  if existing.exists() and (existing.is_symlink() or existing.read_bytes()!=p.read_bytes()):
   errors.append('Existing feature module differs: '+name+'; no files changed')
   continue
  changes[name]=p.read_text()
 if errors:raise ValueError('\n'.join(dict.fromkeys(errors))+'\nIntegration preflight failed; no files changed')
 return {name:text for name,text in changes.items() if not (target/name).exists() or (target/name).read_text()!=text}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('target',type=Path);parser.add_argument('manifest',type=Path);parser.add_argument('--node-image');args=parser.parse_args()
 worker=None
 try:
  worker=PatchWorker(args.source,args.node_image)
  changes=plan_changes(args.source.resolve(),args.target.resolve(),worker)
 except (ValueError,BrokenPipeError) as e:raise SystemExit(str(e))
 finally:
  if worker:worker.close()
 manifest={'files':[{'path':name,'existed':(args.target/name).exists(),'before_sha256':hashlib.sha256((args.target/name).read_bytes()).hexdigest() if (args.target/name).exists() else None} for name in changes]}
 # Planning succeeds for every integration before any destination is written.
 for name,text in changes.items():
  p=args.target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 args.manifest.write_text(json.dumps(manifest))
 print('Guarded feature integration prepared; '+str(len(changes))+' source files updated. Compose and environment files untouched.')
if __name__=='__main__':main()
