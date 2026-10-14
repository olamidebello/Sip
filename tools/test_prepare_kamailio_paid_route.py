import unittest
from prepare_kamailio_paid_route import patch
SOURCE=r'''
# OLAMIDE_CARRIER_ADAPTER_V1
loadmodule "tm.so"
request_route {
 if (!($rU =~ "^[a-zA-Z0-9]+$")) { exit; }
 $var(req)="{\"domain\":\"" + $var(realm) + "\",\"caller\":\"" + $au + "\",\"destination\":\"" + $rU + "\"}";
 http_client_query("http://127.0.0.1:18080/api/switch/kamailio/route", "$var(req)", "Content-Type: application/json", "$var(route_response)");
 if ($var(route) != "extension") { exit; }
}
'''
class Tests(unittest.TestCase):
 def test_patch_preserves_bridge_and_adds_billing_hooks(self):
  s=patch(SOURCE,'ab'*32);self.assertIn('callKey',s);self.assertIn('event_route[dialog:end]',s);self.assertIn('$dlg_ctx(timeout_bye) = 1',s);self.assertIn('$var(route_response)',s);self.assertEqual(patch(s,'ab'*32),s)
 def test_unknown_configuration_is_refused(self):self.assertRaises(ValueError,patch,'request_route {}','ab'*32)
if __name__=='__main__':unittest.main()
