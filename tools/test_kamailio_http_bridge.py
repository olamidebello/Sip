import unittest,runpy,pathlib
patch=runpy.run_path(str(pathlib.Path(__file__).with_name('prepare_kamailio_http_bridge.py')))['patch']
class BridgeStaging(unittest.TestCase):
 def test_three_and_four_arguments_and_idempotency(self):
  source='http_client_query("http://127.0.0.1:18080/api/switch/kamailio/auth", "$var(req)", "Content-Type: application/json", "$var(body)");\nhttp_client_query("http://127.0.0.1:18080/api/switch/kamailio/route", "$var(req)", "$var(body)");'
  result=patch(source,'ab'*32);self.assertEqual(result.count('Authorization: Bearer'),2);self.assertEqual(patch(result,'ab'*32),result)
 def test_unrecognized_configuration_is_rejected(self):
  with self.assertRaises(AssertionError):patch('request_route {}','ab'*32)
if __name__=='__main__':unittest.main()
