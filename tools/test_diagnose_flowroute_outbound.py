import unittest
from diagnose_flowroute_outbound import diagnose
class Tests(unittest.TestCase):
 def test_private_values_are_not_reported(self):
  result='\n'.join(diagnose('request_route { $var(secret)="PRIVATE_PASSWORD"; }'))
  self.assertNotIn('PRIVATE_PASSWORD',result);self.assertIn('blocker=paid_marker_missing',result)
 def test_existing_auth_detected(self):
  result='\n'.join(diagnose('# OLAMIDE_PAID_ROUTE_V1 OLAMIDE_CARRIER_ADAPTER_V1\nloadmodule "uac.so"\nmodparam("uac","auth_password_avp","PRIVATE_PASSWORD")\nrequest_route {}'))
  self.assertIn('blocker=existing_uac_auth',result);self.assertNotIn('PRIVATE_PASSWORD',result)
if __name__=='__main__':unittest.main()
