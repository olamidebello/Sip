import unittest,tempfile,shutil
from pathlib import Path
from install_phone_features import integrate
from prepare_phone_features import patch
from test_voicemail_tools import kam,fixture
class PhoneTests(unittest.TestCase):
 def test_guarded_patch_and_idempotence(self):
  original=kam.patch(fixture())
  original=original.replace(' t_relay();\n}','\n    if (!t_relay()) { sl_reply_error(); }\n}')
  result=patch(original)
  self.assertIn('olamide_phone',result);self.assertIn('phone-policy',result)
  self.assertEqual(patch(result),result)
  self.assertIn('Authorization: Bearer '+('a'*64),result)
  self.assertIn('OLAMIDE_FLOWROUTE_INBOUND',result)
 def test_source_integrator_preserves_local_files_and_is_idempotent(self):
  root=Path(__file__).resolve().parents[1]
  names=['services/api/server.js','services/api/pstnBilling.js','services/api/kamailioHttpBridge.js','apps/web/src/main.js']
  with tempfile.TemporaryDirectory() as d:
   dest=Path(d)
   for name in names:
    p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,p)
   self.assertEqual(integrate(dest),4)
   self.assertEqual(integrate(dest),0)
 def test_unknown_route_rejected(self):
  with self.assertRaises(ValueError):patch('request_route {}')
if __name__=='__main__':unittest.main()
