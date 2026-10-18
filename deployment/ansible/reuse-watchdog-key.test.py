import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('reuse',Path(__file__).with_name('reuse-watchdog-key.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_existing_runtime_key_is_reused_without_changing_input(self):
  original={'PATH':'/bin'};result=m.inherited_environment({'Env':['OPENAI_SUPPORT_API_KEY=private-test','OTHER=hidden']},original)
  self.assertEqual(result['OPENAI_API_KEY'],'private-test');self.assertNotIn('OTHER',result);self.assertNotIn('OPENAI_API_KEY',original)
 def test_standard_key_has_priority_and_missing_key_uses_existing_compose_environment(self):
  self.assertEqual(m.inherited_environment({'Env':['OPENAI_API_KEY=standard','OPENAI_SUPPORT_API_KEY=support']},{})['OPENAI_API_KEY'],'standard')
  self.assertEqual(m.inherited_environment({'Env':[]},{'OPENAI_API_KEY':'existing'})['OPENAI_API_KEY'],'existing')
if __name__=='__main__':unittest.main()
