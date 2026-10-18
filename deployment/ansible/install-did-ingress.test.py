import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('ingress',Path(__file__).with_name('install-did-ingress.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PatchTests(unittest.TestCase):
 def test_diagnostics_hide_authentication_and_quoted_values(self):
  secret='a'*64
  result=module.sanitized_diagnostics('ERROR Authorization: Bearer '+secret+'\nERROR password="private-value"\nERROR parse line 9 unknown command')
  self.assertNotIn(secret,result)
  self.assertNotIn('private-value',result)
  self.assertIn('parse line 9',result)
 def test_whitespace_in_existing_layout(self):
  old='request_route\n{\n}\nonreply_route [ MEDIA_REPLY ] {}\n# Authorization: Bearer '+('a'*64)
  self.assertIn(module.MARK,module.patch(old))
 def test_requires_known_authenticated_layout(self):
  with self.assertRaises(ValueError):module.patch('request_route {}')
 def test_hook_is_idempotent_and_keeps_token(self):
  old='request_route {\n}\nonreply_route[MEDIA_REPLY] {}\n# Authorization: Bearer '+('a'*64)
  new=module.patch(old)
  self.assertEqual(module.patch(new),new)
  self.assertEqual(new.count('route[OLAMIDE_DID_INBOUND]'),1)
  self.assertIn('Authorization: Bearer '+('a'*64),new)
  self.assertIn('$tt == ""',new)
  self.assertNotIn('has_totag()',new)
  self.assertIn('lookup("location")',new)
if __name__=='__main__':unittest.main()
