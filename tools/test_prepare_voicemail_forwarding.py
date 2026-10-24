import unittest
from prepare_voicemail_forwarding import patch
from test_voicemail_tools import fixture, kam

class RepairTests(unittest.TestCase):
    def setUp(self):
        self.fixed=kam.patch(fixture())
        self.legacy=self.fixed.replace('    # OLAMIDE_VOICEMAIL_FORWARD_V2\n    clear_branches();\n','').replace('    if ($avp(vm_rr) != 1)', '    clear_branches();\n    if ($avp(vm_rr) != 1)').replace('    remove_hf("Authorization"); remove_hf("Proxy-Authorization");','    consume_credentials();')
    def test_repairs_legacy_and_preserves_surrounding_routes(self):
        self.assertEqual(patch(self.legacy), self.fixed)
    def test_idempotent(self):
        self.assertEqual(patch(self.fixed),self.fixed)
    def test_unknown_destination_rejected(self):
        with self.assertRaises(ValueError):
            patch(self.legacy.replace('127.0.0.1:5062','127.0.0.1:5099'))
    def test_new_destination_is_assigned_after_branch_clear(self):
        start=self.fixed.index('route[OLAMIDE_VOICEMAIL]')
        route=self.fixed[start:]
        self.assertLess(route.index('clear_branches();'),route.index('$ru='))

if __name__=='__main__':unittest.main()
