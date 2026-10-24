from pathlib import Path
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('installer',ROOT/'tools/install-local-features.py')
MODULE=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MODULE)
class FeatureInstaller(unittest.TestCase):
 def fixture(self,path):
  for name in MODULE.SHARED:
   p=path/name;p.parent.mkdir(parents=True,exist_ok=True)
   text=subprocess.check_output(['git','show','HEAD:'+name],cwd=ROOT,text=True)
   p.write_text(text+'\n// PRIVATE_LOCAL_INTEGRATION_PRESERVED\n')
  p=path/'deployment/docker/.env';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('LOCAL_SECRET=private\n')
 def run_installer(self,path):
  return subprocess.run([sys.executable,str(ROOT/'tools/install-local-features.py'),str(ROOT),str(path),str(path.parent/'manifest.json')],capture_output=True,text=True)
 def test_preserves_local_edits_and_environment_and_is_repeatable(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
   for name in MODULE.SHARED:self.assertIn('PRIVATE_LOCAL_INTEGRATION_PRESERVED',(path/name).read_text())
   self.assertEqual((path/'deployment/docker/.env').read_text(),'LOCAL_SECRET=private\n')
   contents={p:p.read_bytes() for p in path.rglob('*') if p.is_file()}
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
   self.assertEqual(contents,{p:p.read_bytes() for p in path.rglob('*') if p.is_file()})
 def test_absent_report_modules_are_added_and_repeatable(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   for name in MODULE.OPTIONAL_REPORTS:(path/name).unlink()
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
   manifest=json.loads((path.parent/'manifest.json').read_text())
   for name in MODULE.OPTIONAL_REPORTS:
    self.assertEqual((path/name).read_text(),(ROOT/name).read_text())
    entry=next(e for e in manifest['files'] if e['path']==name)
    self.assertFalse(entry['existed']);self.assertIsNone(entry['before_sha256'])
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
 def test_report_symlink_is_rejected_without_writes(self):
  for dangling in (False,True):
   with tempfile.TemporaryDirectory() as t:
    path=Path(t)/'stage';self.fixture(path)
    p=path/'services/api/locationReports.js';p.unlink()
    outside=Path(t)/'outside.js'
    if not dangling:outside.write_text('private integration')
    p.symlink_to(outside)
    before={p:p.read_bytes() for p in path.rglob('*') if p.is_file()}
    r=self.run_installer(path);self.assertNotEqual(r.returncode,0)
    self.assertIn('Missing or symlinked integration file',r.stderr)
    self.assertEqual(before,{p:p.read_bytes() for p in path.rglob('*') if p.is_file()})
 def test_routed_inbound_sms_guard_is_retained_and_verification_is_not_nested(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   p=path/'services/api/messagingWebhooks.js'
   text=p.read_text().replace("if(match[2]==='sms') await queueSubscriberSms", "if(match[2]==='sms'&&selected?.userId) await queueSubscriberSms")
   text=text.replace("eventKey:`flowroute/${event.id}`});", "eventKey:`flowroute/${event.id}`,routedUserId:selected.userId});")
   p.write_text(text)
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
   patched=p.read_text()
   self.assertIn("if(match[2]==='sms'&&selected?.userId) await queueSubscriberSms",patched)
   self.assertIn('routedUserId:selected.userId',patched)
   self.assertEqual(patched.count('await acceptQuickSignup(pool,event,'),1)
   self.assertLess(patched.index('await acceptQuickSignup(pool,event,'),patched.index("if(match[2]==='sms'&&selected?.userId)"))
   self.assertNotIn("if(match[2]==='sms'&&selected?.userId) await acceptQuickSignup",patched)
   again=self.run_installer(path);self.assertEqual(again.returncode,0,again.stderr)
 def test_server_without_api_bridge_and_with_formatted_authentication_is_integrated(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   p=path/'services/api/server.js';text=p.read_text()
   text='\n'.join(line for line in text.splitlines() if "if(keyedBridge||path.startsWith('/api/admin/api-bridge/'))" not in line)
   text=text.replace('const user = await currentUser(req);','let user=await currentUser( req );')
   text=text.replace('if (!user) return send(res, 401, { error: "Sign in required" });',"// retain local authentication validation\n      if (!user) return send(res,401,{error:'Sign in required'});")
   text+='\n// parser must not execute this code\nprocess.exit(99);\n'
   p.write_text(text)
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
   patched=p.read_text();self.assertIn('// SIP_FEATURE_ROUTER_V2',patched)
   self.assertIn('process.exit(99)',patched);self.assertIn('retain local authentication validation',patched)
   self.assertIn('currentUser(req).then(featureUser=>',patched)
   self.assertLess(patched.index('const limited=requestLimiter.check'),patched.index('// SIP_FEATURE_ROUTER_V2'))
   self.assertIn('principal.must_change_password||principal.passkeyGate',patched)
   again=self.run_installer(path);self.assertEqual(again.returncode,0,again.stderr)
 def test_whitespace_and_quote_variants_in_client_are_matched_by_tokens(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   p=path/'apps/web/src/main.js';text=p.read_text().replace('const navigationGroups=[','const navigationGroups = [').replace('  softphoneUserId=user.id;','  softphoneUserId = user.id;')
   text=text.replace('if(target==="top")target=userHome();',"if (target === 'top') target = userHome();")
   p.write_text(text)
   r=self.run_installer(path);self.assertEqual(r.returncode,0,r.stderr)
   self.assertIn('setupTrunkAdmin',p.read_text())
 def test_reports_multiple_unknown_files_without_writing_any_source(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   p=path/'services/api/server.js';p.write_text(p.read_text().replace('async function handler(req, res)', 'async function unfamiliarHandler(req, res)'))
   p=path/'apps/web/src/main.js';p.write_text(p.read_text().replace('function navigationAllowed(target){','function unfamiliarNav(target){'))
   before={p:p.read_bytes() for p in path.rglob('*') if p.is_file()}
   r=self.run_installer(path);self.assertNotEqual(r.returncode,0)
   self.assertIn('file=services/api/server.js check=server_handler',r.stderr)
   self.assertIn('file=apps/web/src/main.js check=unknown_pattern',r.stderr)
   self.assertEqual(before,{p:p.read_bytes() for p in path.rglob('*') if p.is_file()})
 def test_unknown_integration_leaves_every_file_unchanged(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path)
   p=path/'apps/web/src/main.js';p.write_text(p.read_text().replace('function navigationAllowed(target){','function unfamiliarNav(target){'))
   before={p:p.read_bytes() for p in path.rglob('*') if p.is_file()}
   r=self.run_installer(path);self.assertNotEqual(r.returncode,0);self.assertIn('no files changed',r.stderr)
   self.assertEqual(before,{p:p.read_bytes() for p in path.rglob('*') if p.is_file()})
 def test_preexisting_modified_feature_module_is_not_overwritten(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'stage';self.fixture(path);p=path/'services/api/quickSignup.js';p.write_text('local custom signup')
   before={p:p.read_bytes() for p in path.rglob('*') if p.is_file()}
   r=self.run_installer(path);self.assertNotEqual(r.returncode,0);self.assertIn('Existing feature module differs',r.stderr)
   self.assertEqual(before,{p:p.read_bytes() for p in path.rglob('*') if p.is_file()})
if __name__=='__main__':unittest.main()
