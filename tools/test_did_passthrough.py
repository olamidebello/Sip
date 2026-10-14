import unittest
from prepare_did_passthrough import patch,MARKER
from prepare_kamailio_paid_route import patch as paid
from prepare_kamailio_carrier import patch as carrier
class Passthrough(unittest.TestCase):
    def source(self):
        return paid(carrier('loadmodule "rr.so"\nrequest_route {\nif (!($rU =~ "^[a-z]+$")) exit;\n$var(req) = "{}";\nhttp_client_query("http://127.0.0.1:18080/api/switch/kamailio/route", "$var(req)", "headers", "$var(body)");\nif ($var(route) != "extension") exit;\n}\n'),'a'*64)
    def test_patch(self):
        result=patch(self.source());self.assertIn(MARKER,result)
        self.assertIn('remove_hf("P-Asserted-Identity")',result)
        self.assertIn('append_hf("P-Asserted-Identity:',result)
        self.assertIn('$var(paid_provider) == "didww"',result)
        self.assertEqual(patch(result),result)
    def test_reject_unknown(self):
        with self.assertRaises(ValueError):patch('request_route {}')
if __name__=='__main__':unittest.main()
