import datetime, importlib.util, pathlib, unittest
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit',root/'tools/kamailio_audit.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class AuditTest(unittest.TestCase):
    def test_receipts_are_bound_to_current_configuration_and_host(self):
        now=datetime.datetime.now(datetime.timezone.utc)
        r={'registrar':{'checkedAt':now.isoformat(),'host':'sip-1','configHash':'hash','testId':'registration-1','connectionPassed':True,'acceptancePassed':True}}
        def check(host='sip-1',digest='hash',active=True):
            return audit.evaluate([{'id':'registrar'}],{'registrar'},{'registrar'},active,True,r,host,digest,now)[0]
        self.assertEqual(check()['status'],'tested')
        self.assertEqual(check(digest='changed')['status'],'configured')
        self.assertEqual(check(host='another')['status'],'configured')
        self.assertEqual(check(active=False)['status'],'pending')
    def test_installed_file_is_not_live_configuration(self):
        now=datetime.datetime.now(datetime.timezone.utc)
        f=audit.evaluate([{'id':'registrar'}],set(),{'registrar'},True,True,{},'sip','hash',now)[0]
        self.assertTrue(f['installed']);self.assertEqual(f['status'],'pending')
if __name__=='__main__':unittest.main()
