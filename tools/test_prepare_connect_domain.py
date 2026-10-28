import unittest
from prepare_connect_domain import patch,BLOCK
class DomainTests(unittest.TestCase):
 def test_preserves_existing_routes_and_paths(self):
  old='{$DOMAIN} {\n handle /api/* { reverse_proxy api:8080 }\n handle /ws { reverse_proxy {$SIP_WS_UPSTREAM} }\n}\n'
  updated=patch(old);self.assertTrue(updated.startswith(old));self.assertIn('https://sip.dobhrap.com{uri} 302',updated);self.assertEqual(patch(updated),updated)
 def test_unknown_existing_alias_refused(self):
  with self.assertRaises(ValueError):patch('olamideconnect.com { reverse_proxy other:8080 }')
 def test_unknown_canonical_site_refused(self):
  with self.assertRaises(ValueError):patch('unrelated.example { file_server }')
 def test_modified_marker_refused(self):
  with self.assertRaises(ValueError):patch('{$DOMAIN} {}\n'+BLOCK.replace('302','301'))
if __name__=='__main__':unittest.main()
