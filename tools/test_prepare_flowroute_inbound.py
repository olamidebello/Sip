import unittest
from prepare_flowroute_inbound import patch
SOURCE='\n'.join('loadmodule "'+name+'.so"' for name in ['http_client','jansson','registrar','rtpengine','nathelper','rr','tm'])+'\nrequest_route {\n # existing authentication\n}\n'
class Tests(unittest.TestCase):
 def test_guarded_inbound_preserves_existing_config(self):
  out=patch(SOURCE,'a'*64)
  self.assertIn('# existing authentication',out)
  self.assertLess(out.index('route(OLAMIDE_FLOWROUTE_INBOUND);'),out.index('# existing authentication'))
  self.assertIn('!has_totag()',out)
  self.assertIn('src_ip == 34.226.36.32/28',out)
  self.assertIn('lookup("location")',out)
  self.assertIn('UDP/TLS/RTP/SAVPF',out)
  self.assertIn('RTP/AVP ICE=remove',out)
  self.assertEqual(patch(out,'a'*64),out)
 def test_unknown_modules_or_missing_request_route_refused(self):
  with self.assertRaises(ValueError):patch('request_route {}','a'*64)
  with self.assertRaises(ValueError):patch(SOURCE,'bad')
if __name__=='__main__':unittest.main()
