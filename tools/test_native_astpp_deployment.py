import pathlib,runpy,tempfile,unittest,json,yaml
root=pathlib.Path(__file__).resolve().parents[1]
prepare=runpy.run_path(str(root/'tools/prepare_native_astpp.py'))['prepare']
class NativeTest(unittest.TestCase):
 def test_keys_and_operator_credentials_are_preserved(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);a=prepare(p);b=prepare(p);self.assertEqual(a,b);self.assertNotEqual(a['operatorPassword'],'admin');self.assertEqual((p/'config.json').stat().st_mode&0o777,0o600)
 def test_native_database_and_listener_are_isolated(self):
  c=yaml.safe_load((root/'deployment/native-astpp/compose.yml').read_text());self.assertNotIn('ports',c['services']['native-db']);self.assertEqual(c['services']['native-web']['ports'],['127.0.0.1:8089:80']);self.assertNotIn('network_mode',c['services']['native-web']);self.assertNotIn('privileged',c['services']['native-web'])
 def test_native_origin_is_private_and_default_access_is_separate(self):
  play=yaml.safe_load((root/'deploy/ansible/native-astpp-gui.yml').read_text())[0];self.assertNotIn('vars_prompt',play);self.assertTrue(any(t.get('no_log') for t in play['tasks']))
