import pathlib,runpy,unittest,json
check=runpy.run_path(str(pathlib.Path(__file__).with_name('telecom_requirements.py')))['check']
class Requirements(unittest.TestCase):
 def test_presence_does_not_promote_external_authentication_or_full_readiness(self):
  def run(argv):return (0,json.dumps([{'provider':'flowroute','count':1,'token':'private'}])) if argv[0]=='docker' else (0,'private')
  r=check(run=run);self.assertFalse(r['fullRequirementsReady']);self.assertEqual(r['providers'][0]['providerAuthentication'],'unverified');self.assertNotIn('private',json.dumps(r))
 def test_failure_output_is_not_exposed(self):
  r=check(run=lambda _: (1,'password=secret'));self.assertNotIn('secret',json.dumps(r));self.assertEqual(r['checks']['tlsCertificate'],'missing_or_expiring')
