import unittest,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).parent))
from install_icn_outbound import patch_switch,patch_billing,patch_server,patch_main
class PatchTest(unittest.TestCase):
 def test_unknown_unchanged(self):
  with self.assertRaises(ValueError):patch_switch('custom config')
  with self.assertRaises(ValueError):patch_billing('custom source')
 def test_switch_guard_and_idempotence(self):
  s=r'''http_client_query("http://127.0.0.1:18080/api/switch/kamailio/route", "{\"caller\":\"" + $fU + "\"}", "Content-Type: application/json", "$var(response)");
route[OLAMIDE_PAID_CALL] {
 if (!jansson_get("callerId", "$var(response)", "$var(caller)")) { }
}
event_route[dialog:start] {}
event_route[dialog:end] {}
# OLAMIDE_PAID_FAILED 18444/event uac_replace_from rtpengine_offer
'''
  out=patch_switch(s);self.assertEqual(out,patch_switch(out));self.assertLess(out.index('route(OLAMIDE_ICN_PAID)'),out.index('route[OLAMIDE_ICN_PAID]'));self.assertIn('t_on_failure("ICN_PAID_FAILURE")',out);self.assertIn('rtcp-mux-demux',out)
  self.assertIn('locationProof',out);self.assertIn('^[a-f0-9]{64}$',out);self.assertIn('remove_hf("X-Olamide-Location-Proof")',out)
 def test_billing_idempotence(self):
  root=pathlib.Path(__file__).parents[1];s=(root/'services/api/pstnBilling.js').read_text();out=patch_billing(s);self.assertEqual(out,patch_billing(out));self.assertLess(out.index('const icnPaid='),out.index('  const identity='));self.assertIn('await migrateIcnOutbound(db)',out)
 def test_session_proof_hooks_are_idempotent(self):
  root=pathlib.Path(__file__).parents[1];s=(root/'services/api/server.js').read_text();out=patch_server(s);self.assertEqual(out,patch_server(out));self.assertIn('tokenHash(currentToken(req))',out)
  out=patch_main('await phone.call(authorizedTarget);');self.assertEqual(out,patch_main(out));self.assertIn('extraHeaders:icnHeaders',out)
if __name__=='__main__':unittest.main()
