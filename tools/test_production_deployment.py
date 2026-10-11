import importlib.util,sys,tempfile,unittest,json,stat
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,file);value=importlib.util.module_from_spec(spec);sys.modules[name]=value;spec.loader.exec_module(value);return value
secrets=module('runtime_secrets',ROOT/'deployment/production/runtime-secrets.py')
release=module('production_release',ROOT/'deployment/production/release.py')
class Tests(unittest.TestCase):
 def fixture(self):return secrets.merge({}, {}, {}, 'sip.example.org','154.29.77.102')
 def test_rerun_preserves_database_and_encryption_keys(self):
  data=self.fixture();self.assertEqual(data,secrets.merge(data,data,{},'sip.example.org','154.29.77.102'));self.assertEqual(len(data['SIP_CREDENTIAL_KEY']),64)
 def test_empty_template_credentials_do_not_replace_deployed_secrets(self):
  data=self.fixture();empty={key:'' for key in secrets.STABLE+secrets.KEYS};self.assertEqual(data,secrets.merge(data,data,empty,'sip.example.org','154.29.77.102'))
 def test_conflicting_identity_stops_before_replacement(self):
  data=self.fixture();other={**data,'MYSQL_PASSWORD':'b'*64}
  with self.assertRaisesRegex(ValueError,'Conflicting existing credential'):secrets.merge(data,other,{},'sip.example.org','154.29.77.102')
 def test_url_password_mismatch_is_not_silently_fixed(self):
  data=self.fixture();data['MYSQL_URL']='mysql://olamide_app:wrong@mysql:3306/olamide'
  with self.assertRaisesRegex(ValueError,'identity differ'):secrets.merge(data,{}, {},'sip.example.org','154.29.77.102')
 def test_no_duplicate_or_quoted_environment_values(self):
  for text in ['TOKEN=a\nTOKEN=b','TOKEN="a"','not-an-env-line']:
   with self.assertRaises(ValueError):secrets.parse(text)
 def test_atomic_private_write_keeps_correct_permissions(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'private';secrets.atomic_write(path,'first');path.chmod(0o644);secrets.atomic_write(path,'second');self.assertEqual(path.read_text(),'second');self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600);self.assertFalse(path.with_name('private.pending').exists())
 def setup_release(self,tmp):
  r=release.Release(tmp,'a'*40);r.directory=Path(tmp)/'deployment/docker';r.directory.mkdir(parents=True);r.override=Path(tmp)/'images.json';r.canonical=Path(tmp)/'canonical.env';r.previous_ref='b'*40;r.previous_env='DOMAIN=old.example\n';r.previous_override=json.dumps({'services':{}});r.previous_images={'api':'old-api','web':'old-web'};r.commands=[]
  r.compose=lambda *args,**kwargs:r.commands.append(args);r.health=lambda:r.commands.append(('health',));return r
 def test_failed_build_restores_checkout_env_without_restarting_old_callers(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=self.setup_release(tmp)
   with patch.object(release,'run') as run:r.rollback()
   self.assertEqual((r.directory/'.env').read_text(),r.previous_env);self.assertEqual(r.override.read_text(),r.previous_override);self.assertEqual(r.commands,[])
 def test_rollback_restores_release_marker_without_discarding_secret_keys(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=self.setup_release(tmp);r.canonical.write_text('SIP_CREDENTIAL_KEY=preserve-this-key\nAPP_RELEASE='+r.ref+'\n')
   with patch.object(release,'run'):r.rollback()
   self.assertEqual(r.canonical.read_text(),'SIP_CREDENTIAL_KEY=preserve-this-key\n')
 def test_cutover_failure_uses_retained_images_never_restores_database(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=self.setup_release(tmp);r.cutover=True
   with patch.object(release,'run'),patch.object(release,'atomic_write') as write:r.rollback()
   self.assertIn(('up','-d','--no-deps','--no-build','api','web'),r.commands);self.assertNotIn('mysql',' '.join(map(str,r.commands)));self.assertTrue(any('application_rolled_back' in str(c) for c in write.call_args_list))
 def test_first_install_failure_stops_apps_and_preserves_db(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=self.setup_release(tmp);r.previous_ref=None;r.cutover=True
   with self.assertRaisesRegex(release.DeploymentError,'database and credentials preserved'):r.rollback()
   self.assertEqual(r.commands,[('stop','api','web','turn')])
if __name__=='__main__':unittest.main()
