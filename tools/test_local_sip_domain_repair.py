import pathlib,runpy,unittest
replace=runpy.run_path(str(pathlib.Path(__file__).with_name('repair_local_sip_domain.py')))['replace_domain']
class DomainConfiguration(unittest.TestCase):
 def test_targeted_idempotent_update_preserves_carrier_settings(self):
  source='SIP_ACCOUNT_DOMAIN=us-east-va.sip.flowroute.com\nFLOWROUTE_ACCESS_KEY=private\n'
  result=replace(source,'us-east-va.sip.flowroute.com','sip.dobhrap.com')
  self.assertIn('SIP_ACCOUNT_DOMAIN=sip.dobhrap.com',result);self.assertIn('FLOWROUTE_ACCESS_KEY=private',result)
  self.assertEqual(replace(result,'us-east-va.sip.flowroute.com','sip.dobhrap.com'),result)
 def test_unexpected_or_duplicate_domain_stops_before_write(self):
  for source in ['SIP_ACCOUNT_DOMAIN=another.example','SIP_ACCOUNT_DOMAIN=\nSIP_ACCOUNT_DOMAIN=']:
   with self.assertRaises(ValueError):replace(source,'old.example','local.example')
if __name__=='__main__':unittest.main()
