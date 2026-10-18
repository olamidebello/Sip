import importlib.util,unittest,json,tempfile,subprocess
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('backup-running-image.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_preserves_exact_startup_and_environment_without_host_state(self):
  config={'Env':['KEY=a b\nline2','NODE_ENV=production'],'Cmd':['node','server.js'],'Entrypoint':None,'WorkingDir':'/app','User':'node','ExposedPorts':{'8080/tcp':{}},'Hostname':'old','Image':'missing'}
  r=m.recovery_config(config)
  self.assertEqual(r['Env'],config['Env']);self.assertEqual(r['Cmd'],config['Cmd']);self.assertNotIn('Hostname',r);self.assertNotIn('Image',r);self.assertEqual(r['User'],'node')
 def test_missing_parent_uses_export_and_import_without_stopping_original(self):
  config={'Cmd':['node','server.js'],'Env':['SECRET=test'],'User':'node','WorkingDir':'/app'}
  calls=[]
  def fake_run(argv,**kwargs):
   calls.append(argv)
   if argv[:2]==['docker','tag']:raise subprocess.CalledProcessError(1,argv,stderr=b'content missing')
   if argv[:2]==['docker','inspect']:return SimpleNamespace(stdout=json.dumps([{'Image':'missing','Config':config}]).encode())
   if argv[:3]==['docker','image','inspect']:return SimpleNamespace(stdout=json.dumps([{'Config':config}]).encode())
   return SimpleNamespace(stdout=b'')
  def fake_subprocess(argv,**kwargs):calls.append(argv);return SimpleNamespace(returncode=0)
  with tempfile.TemporaryDirectory() as root,patch.object(m,'run',side_effect=fake_run),patch.object(m.subprocess,'run',side_effect=fake_subprocess),patch.object(m,'api',return_value={}) as api:
   m.backup('docker-api-1','olamide-api:before-did-20261018120000',root)
   self.assertIn(['docker','export','docker-api-1'],calls)
   self.assertFalse(any(c[:2] in [['docker','stop'],['docker','restart']] for c in calls))
   self.assertFalse(any(c[:3]==['docker','rm','docker-api-1'] for c in calls))
   self.assertEqual(api.call_args.args[2]['Env'],config['Env'])
 def test_root_user_aliases_match_but_non_root_identity_must_be_preserved(self):
  for root in ('','0','root','0:0','root:root'):
   self.assertEqual(m.configuration_mismatches({'User':''},{'User':root}),[])
  self.assertEqual(m.configuration_mismatches({'User':'node'},{'User':'0'}),['User'])
  self.assertEqual(m.configuration_mismatches({'User':'1000:1000'},{'User':'1000:1001'}),['User'])
  self.assertEqual(m.configuration_mismatches({'Cmd':['node','server.js']},{'Cmd':['sh']}),['Cmd'])
 def test_service_mismatch_is_rejected_before_docker(self):
  with self.assertRaises(ValueError):m.backup('docker-api-1','olamide-web:before-did-20261018120000','/tmp')
if __name__=='__main__':unittest.main()
