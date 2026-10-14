import unittest
from prepare_didww_ip_only import reconcile
class DidwwPrerequisites(unittest.TestCase):
    def trunk(self):return {'status':'active','authentication_method':{'type':'ip_only','attributes':{'allowed_sip_ips':['203.0.113.9'],'tech_prefix':None}},'allowed_rtp_ips':['203.0.113.9'],'on_cli_mismatch_action':'reject_call'}
    def test_preserve_and_add_exact_ip(self):
        attrs=self.trunk();result=reconcile(attrs,'154.29.77.102')
        self.assertEqual(result['authentication_method']['attributes']['allowed_sip_ips'],['203.0.113.9','154.29.77.102'])
        self.assertEqual(attrs['on_cli_mismatch_action'],'reject_call')
        self.assertEqual(result['on_cli_mismatch_action'],'send_original_cli')
    def test_idempotent(self):
        attrs=self.trunk();attrs.update(reconcile(attrs,'154.29.77.102'));self.assertEqual(reconcile(attrs,'154.29.77.102'),{k:attrs[k] for k in reconcile(attrs,'154.29.77.102')})
    def test_digest_not_downgraded(self):
        attrs=self.trunk();attrs['authentication_method']['type']='credentials_and_ip'
        with self.assertRaisesRegex(ValueError,'approve'):reconcile(attrs,'154.29.77.102')
    def test_inactive_rejected(self):
        attrs=self.trunk();attrs['status']='blocked'
        with self.assertRaises(ValueError):reconcile(attrs,'154.29.77.102')
    def test_prefix_and_unrestricted_ip_rejected(self):
        attrs=self.trunk();attrs['authentication_method']['attributes']['tech_prefix']='123#'
        with self.assertRaises(ValueError):reconcile(attrs,'154.29.77.102')
        attrs=self.trunk();attrs['allowed_rtp_ips']=['0.0.0.0/0']
        with self.assertRaises(ValueError):reconcile(attrs,'154.29.77.102')
    def test_private_ip_rejected(self):
        with self.assertRaises(ValueError):reconcile(self.trunk(),'127.0.0.1')
if __name__=='__main__':unittest.main()
