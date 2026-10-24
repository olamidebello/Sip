import unittest
from prepare_flowroute_outbound import patch
from prepare_kamailio_paid_route import patch as paid
from prepare_kamailio_carrier import ROUTE
from test_prepare_kamailio_paid_route import SOURCE
class Tests(unittest.TestCase):
 def test_digest_keeps_paid_authorization_and_billing(self):
  source=paid(SOURCE,'ab'*32)+ROUTE
  result=patch(source)
  for gate in ['olamide_pstn_authorized) != 1','maxSeconds','OLAMIDE_PAID_FAILED','rtpengine_offer','dlg_manage','uac_auth()','fr_auth_retry) == 0']:self.assertIn(gate,result)
  self.assertEqual(patch(result),result)
  self.assertIn('P-Asserted-Identity: <$var(paid_from)>',result)
  self.assertIn('remove_hf("Remote-Party-ID")',result)
  self.assertIn('remove_hf("P-Preferred-Identity")',result)
  self.assertLess(result.index('route(OLAMIDE_FLOWROUTE);'),result.index('t_on_failure("OLAMIDE_FLOWROUTE_AUTH")'))
 def test_custom_failure_handler_is_rejected(self):
  source=paid(SOURCE,'ab'*32)+ROUTE
  source=source.replace('t_on_reply("MEDIA_REPLY");','t_on_failure("CUSTOM");t_on_reply("MEDIA_REPLY");')
  with self.assertRaises(ValueError):patch(source)
 def test_uncommissioned_config_rejected(self):
  with self.assertRaises(ValueError):patch('request_route {}')
if __name__=='__main__':unittest.main()

class RelayVariants(unittest.TestCase):
 def test_existing_reply_handler_is_preserved(self):
  source=paid(SOURCE,'ab'*32)+ROUTE
  source=source.replace('t_on_reply("MEDIA_REPLY");','t_on_reply ( "LOCAL_MEDIA" );').replace('if (!t_relay()) {','if ( ! t_relay ( ) ) {')
  result=patch(source)
  self.assertIn('t_on_reply ( "LOCAL_MEDIA" );',result)
  self.assertLess(result.index('t_on_failure("OLAMIDE_FLOWROUTE_AUTH");'),result.index('if ( ! t_relay ( ) )'))
 def test_no_reply_handler_is_required(self):
  source=(paid(SOURCE,'ab'*32)+ROUTE).replace('    t_on_reply("MEDIA_REPLY");\n','')
  self.assertIn('t_on_failure("OLAMIDE_FLOWROUTE_AUTH");',patch(source))
 def test_spaced_existing_failure_handler_is_rejected(self):
  source=(paid(SOURCE,'ab'*32)+ROUTE).replace('t_on_reply("MEDIA_REPLY");','t_on_failure ("CUSTOM");')
  with self.assertRaises(ValueError):patch(source)
 def test_multiple_relays_are_rejected(self):
  source=(paid(SOURCE,'ab'*32)+ROUTE).replace('    t_on_reply("MEDIA_REPLY");','    t_relay();')
  with self.assertRaises(ValueError):patch(source)
