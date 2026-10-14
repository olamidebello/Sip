import json,pathlib,runpy,tempfile,unittest
check=runpy.run_path(str(pathlib.Path(__file__).with_name('astpp_commissioning_check.py')))['check']
class CommissioningCheck(unittest.TestCase):
 def test_report_redacts_secrets_and_does_not_promote_adapter_flag_to_native_acceptance(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);secret='private-value-not-for-logs';(p/'config.json').write_text(json.dumps({k:secret for k in ['dbPassword','privateKey','sessionKey','operatorPassword']}|{'baseUrl':'http://localhost:8089/'}));(p/'runtime.env').write_text('private');(p/'adapter.json').write_text(json.dumps({'backend':'kamailio','token':secret,'routingCommissioned':True}))
   calls=[]
   def run(argv):calls.append(argv);return 0,'1\t1\t2\t3\t4\n'
   r=check(p,p/'adapter.json',run,lambda:'<form id="login_form"><input name="password"></form>')
   self.assertEqual(r['stage'],'gui_runtime_ready');self.assertEqual(r['nativeCallAcceptance'],'unverified');self.assertNotIn(secret,json.dumps(r));self.assertNotIn(secret,json.dumps(calls));self.assertEqual(len(calls),1);self.assertNotIn('activate',json.dumps(calls))
 def test_missing_configuration_and_unavailable_web_are_reported_without_raw_errors(self):
  with tempfile.TemporaryDirectory() as d:
   def unavailable():raise OSError('password=never-print-this')
   r=check(d,pathlib.Path(d)/'missing',lambda _:self.fail('no database command expected'),unavailable)
   self.assertEqual(r['stage'],'gui_install_needed');self.assertNotIn('never-print-this',json.dumps(r))

 def test_kamailio_mode_does_not_require_native_gui_and_checks_actual_rpc(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'adapter.json').write_text(json.dumps({'backend':'kamailio','rpcSocket':'unix:/run/kamailio/olamide_carrier_ctl','routingCommissioned':True}))
   calls=[]
   def run(argv):calls.append(argv);return 0,'uptime: 300' if argv[-1]=='core.uptime' else 'name: olamide_carrier'
   r=check(p,p/'adapter.json',run,lambda:'',production_backend='kamailio')
   self.assertEqual(r['stage'],'kamailio_adapter_ready');self.assertEqual(r['nativeCallAcceptance'],'unverified');self.assertNotIn('FreeSWITCH',' '.join(r['nextSteps']));self.assertEqual(len(calls),2)
   r=check(p,p/'adapter.json',lambda _: (1,'error: private error'),lambda:'',production_backend='kamailio')
   self.assertEqual(r['stage'],'kamailio_adapter_check_needed');self.assertNotIn('private error',json.dumps(r))
