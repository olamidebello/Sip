import unittest
from prepare_inhouse_inbound import patch
class InboundGuardTests(unittest.TestCase):
 def test_fresh_route_uses_core_to_tag(self):
  result=patch('request_route {\n}\n','a'*64)
  self.assertIn('is_method("INVITE") && $tt == $null',result)
  self.assertNotIn('has_totag()',result)
  self.assertIn('$si == "196.216.253.173"',result)
 def test_previous_generated_guard_is_repaired_idempotently(self):
  old='# INHOUSE_ICN_INBOUND_V1\nif (is_method("INVITE") && !has_totag()) { exit; }'
  fixed=patch(old,'a'*64)
  self.assertNotIn('has_totag()',fixed)
  self.assertEqual(patch(fixed,'a'*64),fixed)
if __name__=='__main__':unittest.main()
