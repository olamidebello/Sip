from pathlib import Path
import shutil,subprocess,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
class BillingCompatibility(unittest.TestCase):
 def test_caller_authorization_and_verification_integration(self):
  source=ROOT/'services/api'
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'api';shutil.copytree(source,target,ignore=shutil.ignore_patterns('node_modules'))
   (target/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
   p=target/'pstnBilling.js';s=p.read_text()
   s="import {resolveCallerIdentity} from './callerIdentityPolicy.js';\nimport {applyVerifiedCallerIdentity} from './callerVerification.js';\n"+s
   s=s.replace('const identity=assignedIdentity(loadPolicy(),actor.tenant_id,actor.user_id);','let identity=await resolveCallerIdentity(db,actor.tenant_id,actor.user_id);\n identity=await applyVerifiedCallerIdentity(db,{tenantId:actor.tenant_id,userId:actor.user_id,identity});')
   p.write_text(s)
   r=subprocess.run(['node','--test','pstnDigest.test.js'],cwd=target,capture_output=True,text=True)
   self.assertEqual(r.returncode,0,r.stdout+r.stderr)
   # Reproduce the original fixture failure with the actual authorization helper.
   p=target/'pstnDigest.test.js';s=p.read_text()
   s=s.replace("rows=[{number_e164:'+15551234567',authorized:1,provider:'flowroute'}]",'rows=[]').replace("rows=[{phone_e164:'+15551234567',country:'US'}]",'rows=[]');p.write_text(s)
   r=subprocess.run(['node','--test','pstnDigest.test.js'],cwd=target,capture_output=True,text=True)
   self.assertNotEqual(r.returncode,0);self.assertIn('caller-ID authorization',r.stdout+r.stderr)
if __name__=='__main__':unittest.main()
