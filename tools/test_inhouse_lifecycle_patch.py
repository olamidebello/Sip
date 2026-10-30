import unittest
from install_inhouse_lifecycle import switch
from prepare_inhouse_inbound import patch
class LifecycleGuardTests(unittest.TestCase):
 def test_composed_generators(self):
  base='request_route {\nif ($var(route) == "pstn") { exit; }\n}\nevent_route[dialog:start] {}\nevent_route[dialog:end] {}\n# 18444/event\n'
  result=switch(patch(base,'a'*64))
  self.assertNotIn('!has_totag()',result)
  self.assertEqual(result.count('&& $tt == $null'),2)
  self.assertIn('dlg_manage();',result)
  self.assertIn('callKey',result)
  self.assertEqual(switch(result),result)
 def test_existing_activity_guard_is_upgraded(self):
  old='# INHOUSE_ACTIVITY_EVENTS_V1\nif (is_method("INVITE") && !has_totag()) { dlg_manage(); }'
  result=switch(old)
  self.assertIn('&& $tt == $null',result)
  self.assertNotIn('has_totag()',result)
if __name__=='__main__':unittest.main()
