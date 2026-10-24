import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('reporter',ROOT/'tools/report-feature-tests.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TestSummary(unittest.TestCase):
 def test_known_test_name_is_reported_without_diagnostic_payload(self):
  text="not ok 1 - SIP insertion failure rolls back the account and leaves challenge retryable\nerror: SQL password=VERY_PRIVATE\ncode: ERR_ASSERTION\n"
  out='\n'.join(m.summarize(text,ROOT));self.assertIn('file=quickSignup.test.js',out);self.assertIn('check=err_assertion',out);self.assertNotIn('VERY_PRIVATE',out);self.assertNotIn('SQL',out)
 def test_unknown_titles_and_paths_do_not_escape_the_private_log(self):
  text="not ok 1 - sk-proj-PRIVATE_SECRET\nCannot find module '/private/credentials-SECRET.js'\n"
  out='\n'.join(m.summarize(text,ROOT));self.assertEqual(out,'SIP_FEATURE_TEST check=unclassified_failure')
 def test_known_import_failure_reports_only_public_basename(self):
  text="not ok 1 - /app/quickSignup.test.js\nError [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/twilioAccountAuth.js' imported from /app/quickSignup.js\n"
  out='\n'.join(m.summarize(text,ROOT));self.assertIn('file=quickSignup.test.js check=suite_failed',out);self.assertIn('file=twilioAccountAuth.js check=module_not_found',out);self.assertNotIn('/app/',out)
 def test_stack_details_and_public_property_names_are_safe(self):
  text="TypeError: Cannot read properties of undefined (reading 'tenant_id')\n at createSipAccount (file:///app/sipMarketplace.js:48:29)\n at secret (file:///app/PRIVATE_SECRET.js:1:2)\n"
  out='\n'.join(m.summarize(text,ROOT));self.assertIn('file=sipMarketplace.js check=stack line=48 column=29',out);self.assertIn('check=undefined_property property=tenant_id',out);self.assertNotIn('PRIVATE_SECRET',out)
 def test_fingerprints_include_only_known_source_blob_hashes(self):
  import tempfile,hashlib
  with tempfile.TemporaryDirectory() as t:
   folder=Path(t)/'stage/services/api';folder.mkdir(parents=True);data=b'private source marker';(folder/'sipMarketplace.js').write_bytes(data);(folder/'private.env').write_text('PRIVATE_KEY=secret')
   out='\n'.join(m.fingerprints(Path(t)));expected=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();self.assertIn('value='+expected,out);self.assertNotIn('marker',out);self.assertNotIn('PRIVATE_KEY',out);self.assertNotIn('private.env',out)
if __name__=='__main__':unittest.main()
