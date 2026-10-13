import pathlib,runpy,unittest
module=runpy.run_path(str(pathlib.Path(__file__).with_name('repair_local_sip_domain.py')))
replace=module['replace_domain']
host=module['configured_application_host']
class DomainConfiguration(unittest.TestCase):
 def test_targeted_idempotent_update_preserves_carrier_settings(self):
  source='SIP_ACCOUNT_DOMAIN=us-east-va.sip.flowroute.com\nFLOWROUTE_ACCESS_KEY=private\n'
  result=replace(source,'us-east-va.sip.flowroute.com','sip.dobhrap.com')
  self.assertIn('SIP_ACCOUNT_DOMAIN=sip.dobhrap.com',result);self.assertIn('FLOWROUTE_ACCESS_KEY=private',result)
  self.assertEqual(replace(result,'us-east-va.sip.flowroute.com','sip.dobhrap.com'),result)
 def test_unexpected_or_duplicate_domain_stops_before_write(self):
  for source in ['SIP_ACCOUNT_DOMAIN=another.example','SIP_ACCOUNT_DOMAIN=\nSIP_ACCOUNT_DOMAIN=']:
   with self.assertRaises(ValueError):replace(source,'old.example','local.example')
 def test_compose_derives_origin_from_domain_without_public_origin_key(self):
  self.assertEqual(host('DOMAIN=sip.dobhrap.com\nSIP_PROVISION_MODE=kamailio_local\n'),'sip.dobhrap.com')
  self.assertEqual(host('DOMAIN=sip.dobhrap.com\nPUBLIC_ORIGIN=https://unused.example\n'),'sip.dobhrap.com')
 def test_quoted_whitespace_and_https_port(self):
  for value in ['"sip.dobhrap.com"', "'sip.dobhrap.com'",'SIP.DOBHRAP.COM:443 # comment']:
   self.assertEqual(host('DOMAIN = '+value+'\r\n'),'sip.dobhrap.com')
 def test_missing_duplicate_and_nonliteral_domains_fail_closed(self):
  for text in ['', 'DOMAIN=a.example\nDOMAIN=b.example', 'DOMAIN=user@site.example','DOMAIN=${APP_HOST}','DOMAIN=http://site.example','DOMAIN=site.example:80']:
   with self.assertRaises(ValueError):host(text)
if __name__=='__main__':unittest.main()
