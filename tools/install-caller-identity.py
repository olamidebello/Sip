import os,re,subprocess,tempfile
from pathlib import Path
ROOT=Path('/opt/olamide/repo')
SOURCE='31f793e7b59dded0da179135887879ea2ca31ce6'
def once(s,anchor,value):
 if s.count(anchor)!=1:raise RuntimeError('Integration anchor missing or ambiguous: '+anchor)
 return s.replace(anchor,value,1)
def prepare(files):
 pending=dict(files)
 p='services/api/pstnBilling.js';s=pending[p]
 if "from './callerIdentityPolicy.js'" not in s:s="import {resolveCallerIdentity} from './callerIdentityPolicy.js';\n"+s
 if 'const identity=await resolveCallerIdentity' not in s:
  s,n=re.subn(r'const identity\s*=\s*await managedIdentity\(db,actor\.tenant_id,actor\.user_id\)\s*\|\|\s*assignedIdentity\(loadPolicy\(\),actor\.tenant_id,actor\.user_id\);','const identity=await resolveCallerIdentity(db,actor.tenant_id,actor.user_id);',s)
  if n!=1:raise RuntimeError('PSTN identity integration requires review')
 pending[p]=s
 p='services/api/superAdminControl.js';s=pending[p]
 if "from './callerIdentityPolicy.js'" not in s:s="import {migrateCallerIdentityPolicy} from './callerIdentityPolicy.js';\n"+s
 if 'await migrateCallerIdentityPolicy(pool)' not in s:s=once(s,'export async function migrateSuperAdminControl(pool){','export async function migrateSuperAdminControl(pool){\n await migrateCallerIdentityPolicy(pool);')
 pending[p]=s
 p='services/api/server.js';s=pending[p]
 if "{handleCallerIdentityPolicy}" not in s:s="import {handleCallerIdentityPolicy} from './callerIdentityPolicy.js';\n"+s
 if "path==='/api/admin/caller-identity-policy'" not in s:
  anchor='if(path==="/api/admin/geofence/address")'
  s=once(s,anchor,"if(path==='/api/admin/caller-identity-policy')return await handleCallerIdentityPolicy({req,res,user,pool,send,readJson});\n      "+anchor)
 pending[p]=s
 p='apps/web/src/main.js';s=pending[p]
 if "from './callerIdentityAdmin.js'" not in s:s="import {setupCallerIdentityAdmin} from './callerIdentityAdmin.js';\n"+s
 if 'setupCallerIdentityAdmin({document' not in s:s=once(s,'let geofenceZones=[]',"setupCallerIdentityAdmin({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin'});\nlet geofenceZones=[]")
 pending[p]=s
 return pending

def install():
 paths=['services/api/pstnBilling.js','services/api/superAdminControl.js','services/api/server.js','apps/web/src/main.js']
 pending=prepare({p:(ROOT/p).read_text() for p in paths})
 for p in ['services/api/callerIdentityPolicy.js','services/api/callerIdentityPolicy.test.js','apps/web/src/callerIdentityAdmin.js']:
  content=subprocess.check_output(['git','show',SOURCE+':'+p],cwd=ROOT,text=True)
  if (ROOT/p).exists() and (ROOT/p).read_text()!=content:raise RuntimeError('Existing custom file requires review: '+p)
  pending[p]=content
 # Parse every staged JS file before touching the deployed source tree.
 with tempfile.TemporaryDirectory() as directory:
  for index,(path,content) in enumerate(pending.items()):
   temp=Path(directory)/f'{index}.mjs';temp.write_text(content);temp.chmod(0o444)
   subprocess.run(['docker','compose','run','--rm','--no-deps','-T','-v',str(temp)+':/tmp/check.mjs:ro','--entrypoint','node','api','--check','/tmp/check.mjs'],cwd=ROOT/'deployment/docker',stdin=subprocess.DEVNULL,check=True)
 for path,content in pending.items():(ROOT/path).write_text(content)
 print('Caller identity policy installed. Existing caller-ID approvals and carrier settings retained.')
if __name__=='__main__':install()
