import unittest
from prepare_kamailio_carrier import patch
class Tests(unittest.TestCase):
    def test_existing_route_preserved_and_repeat_is_unchanged(self):
        original='loadmodule "tm.so"\nrequest_route { sl_send_reply("403","Denied"); exit; }\n'
        staged=patch(original);self.assertIn('request_route { sl_send_reply("403","Denied"); exit; }',staged)
        self.assertEqual(patch(staged),staged);self.assertIn('olamide_carrier_ctl',staged)
    def test_unknown_existing_rpc_refused(self):self.assertRaises(ValueError,patch,'loadmodule "ctl.so"\nrequest_route {}')
if __name__=='__main__':unittest.main()
