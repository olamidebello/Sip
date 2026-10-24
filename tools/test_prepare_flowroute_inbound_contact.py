import unittest
from prepare_flowroute_inbound_contact import patch
SOURCE='''request_route { route(OLAMIDE_FLOWROUTE_INBOUND); }
route[OLAMIDE_FLOWROUTE_INBOUND] {
 $var(req)="number=" + $rU + ",sourceIp=" + $si;
 $ru = "sip:" + $var(inbound_user) + "@" + $var(inbound_domain);
 t_relay();
}
'''
class Tests(unittest.TestCase):
 def test_contact_user_uses_called_did_without_changing_sip_delivery(self):
  result=patch(SOURCE,'12345678')
  self.assertIn('$var(fr_called_did) = $tU;',result)
  self.assertIn('if ($rU == "12345678")',result)
  self.assertIn('"number=" + $var(fr_called_did)',result)
  self.assertIn('sourceIp=',result);self.assertIn('$ru = "sip:" + $var(inbound_user)',result)
  self.assertEqual(patch(result,'12345678'),result)
 def test_mutating_user_requires_review(self):
  with self.assertRaises(ValueError):patch(SOURCE.replace(' t_relay();',' $rU = "other"; t_relay();'),'12345678')
 def test_source_safeguard_is_required(self):
  with self.assertRaises(ValueError):patch(SOURCE.replace('sourceIp','other'),'12345678')
if __name__=='__main__':unittest.main()
