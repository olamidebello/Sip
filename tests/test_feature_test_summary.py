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
if __name__=='__main__':unittest.main()
