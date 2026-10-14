import importlib.util,json,pathlib,tempfile,unittest,os
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('worker',pathlib.Path(__file__).with_name('didww_gui_worker.py'))
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class Process:
    returncode=0
    def poll(self):return 0
class GuiWorker(unittest.TestCase):
    def test_secret_goes_only_to_private_config_not_command_or_compose_environment(self):
        with tempfile.TemporaryDirectory() as d:
            config=pathlib.Path(d)/'config.json';logs=pathlib.Path(d)/'logs';calls=[]
            def popen(argv,**kw):
                calls.append(argv)
                self.assertNotIn('api-secret',str(argv));self.assertNotIn('DIDWW_API_KEY',kw['env'])
                self.assertEqual(json.loads(config.read_text())['apiKey'],'api-secret')
                self.assertEqual(config.stat().st_mode&0o777,0o600)
                return Process()
            with patch.object(worker,'CONFIG',config),patch.object(worker,'LOGDIR',logs),patch.object(worker.subprocess,'Popen',popen),patch.dict(os.environ,{},clear=True):
                self.assertTrue(worker.execute({'id':'job','mode':'provision','apiKey':'api-secret','config':{'tenantId':'tenant','command':'ignored'}}))
            self.assertEqual(calls[0],['bash','/opt/olamide/repo/deployment/deploy-didww-ip-only.sh'])
            self.assertNotIn('api-secret',(logs/'didww-provisioning.log').read_text())
    def test_missing_key_never_executes(self):
        with patch.object(worker.subprocess,'Popen',side_effect=AssertionError('must not run')):
            self.assertFalse(worker.execute({'apiKey':None}))
if __name__=='__main__':unittest.main()
