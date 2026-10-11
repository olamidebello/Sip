import datetime, importlib.util, pathlib, unittest
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('controller',root/'tools/kamailio_controller.py')
controller=importlib.util.module_from_spec(spec);spec.loader.exec_module(controller)

class AcceptanceTest(unittest.TestCase):
    def receipt(self):
        report={'host':'sip','nodeId':'node','configHash':'hash'}
        tests=['registration','invalid_credentials_rejected','unauthenticated_relay_rejected','two_way_audio','dtmf','carrier_inbound','carrier_outbound','billing_reservation','billing_settlement','fraud_limits','credential_revocation','backup_restore','monitoring_alert','failover','smtp_delivery','imap_login','spf_dkim_dmarc','ptr']
        receipt={**report,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tests':dict.fromkeys(tests,True),'concurrentCalls':500}
        return report,receipt
    def test_complete_receipt_is_accepted(self):
        report,receipt=self.receipt()
        self.assertTrue(controller.verify_acceptance(report,receipt,500))
    def test_other_host_and_low_capacity_are_rejected(self):
        report,receipt=self.receipt();receipt['host']='other'
        with self.assertRaises(ValueError):controller.verify_acceptance(report,receipt,500)
        report,receipt=self.receipt();receipt['concurrentCalls']=50
        with self.assertRaises(ValueError):controller.verify_acceptance(report,receipt,500)
    def test_installed_services_do_not_replace_billing_acceptance(self):
        report,receipt=self.receipt();receipt['tests']['billing_settlement']=False
        with self.assertRaises(ValueError):controller.verify_acceptance(report,receipt,500)
    def test_stale_receipt_is_rejected(self):
        report,receipt=self.receipt();receipt['checkedAt']=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=2)).isoformat()
        with self.assertRaises(ValueError):controller.verify_acceptance(report,receipt,500)
