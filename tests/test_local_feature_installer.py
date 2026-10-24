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
