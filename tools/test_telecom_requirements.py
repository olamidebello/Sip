import pathlib,runpy,unittest,json,ssl
module=runpy.run_path(str(pathlib.Path(__file__).with_name('telecom_requirements.py')))
check=module['check'];probe=module['served_certificate']
class Session:
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def getpeercert(self):return {'notAfter':'Jan  3 22:39:45 2027 GMT'}
class Context:
 verify_mode=ssl.CERT_REQUIRED
 check_hostname=True
 def wrap_socket(self,connection,server_hostname):self.hostname=server_hostname;return Session()
class Requirements(unittest.TestCase):
 def test_presence_does_not_promote_external_authentication_or_full_readiness(self):
  calls=[]
  def run(argv):
   calls.append(argv);return (0,json.dumps([{'provider':'flowroute','count':1,'token':'private'}])) if argv[0]=='docker' else (0,'private')
  r=check(run=run,certificate_probe=lambda _:{'status':'valid_for_at_least_14_days','source':'served_https_sni'});self.assertFalse(r['fullRequirementsReady']);self.assertEqual(r['providers'][0]['providerAuthentication'],'unverified');self.assertNotIn('private',json.dumps(r));self.assertFalse(any('fullchain.pem' in str(c) for c in calls))
 def test_failure_output_is_not_exposed(self):
  r=check(run=lambda _: (1,'password=secret'),certificate_probe=lambda _:{'status':'unavailable'});self.assertNotIn('secret',json.dumps(r));self.assertEqual(r['checks']['tlsCertificate'],'unavailable')
 def test_caddy_served_certificate_uses_loopback_sni_and_expiry_without_host_files(self):
  context=Context();addresses=[]
  def connect(address,timeout):addresses.append((address,timeout));return Session()
  r=probe('sip.dobhrap.com',connect=connect,context_factory=lambda:context,now=ssl.cert_time_to_seconds('Oct 14 20:39:40 2026 GMT'))
  self.assertEqual(r['status'],'valid_for_at_least_14_days');self.assertEqual(context.hostname,'sip.dobhrap.com');self.assertEqual(addresses,[(('127.0.0.1',443),5)]);self.assertTrue(r['notAfterUtc'].startswith('2027-01-03'))
 def test_expiring_certificate_is_distinct_from_unreachable_service(self):
  r=probe('sip.dobhrap.com',connect=lambda *a,**k:Session(),context_factory=Context,now=ssl.cert_time_to_seconds('Jan  1 00:00:00 2027 GMT'));self.assertEqual(r['status'],'expiring_within_14_days')
  def unavailable(*a,**k):raise OSError('private diagnostic')
  r=probe('sip.dobhrap.com',connect=unavailable,context_factory=Context);self.assertEqual(r['status'],'unavailable');self.assertNotIn('private',json.dumps(r))
 def test_certificate_validation_failure_does_not_fall_back_to_unverified_tls(self):
  class Bad(Context):
   def wrap_socket(self,*a,**k):raise ssl.SSLCertVerificationError('private CA diagnostic')
  self.assertEqual(probe('sip.dobhrap.com',connect=lambda *a,**k:Session(),context_factory=Bad)['status'],'verification_failed')
  class Insecure(Context):check_hostname=False
  self.assertEqual(probe('sip.dobhrap.com',context_factory=Insecure,connect=lambda *a,**k:self.fail('must not connect'))['status'],'verification_failed')
