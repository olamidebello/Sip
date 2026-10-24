import pathlib,tempfile,unittest
from kamailio import KamailioAdapter
from test_adapter import TENANT,trunk
class Tests(unittest.TestCase):
    def make(self,path,commissioned=True):
        a=KamailioAdapter(dict(tenantId=TENANT,routingCommissioned=commissioned,stateFile=str(path)));a.value=''
        def rpc(*args):
            if args[0]=='htable.sets':a.value=args[3];return 'ok'
            if args[0]=='htable.get':return a.value
            return 'ok'
        a.rpc=rpc;return a
    def test_ip_activation_acknowledges_revision_and_deactivation(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'state';a=self.make(p);c=trunk();c['publicIp']='154.29.77.102'
            result=a.handle(dict(tenantId=TENANT,provider='flowroute',action='activate',flowrouteTrunk=c))
            self.assertEqual(result['configurationRevision'],1);self.assertIn(c['host'],p.read_text())
            self.assertEqual(a.handle(dict(tenantId=TENANT,provider='flowroute',action='deactivate')),{'status':'inactive'})
            self.assertEqual(p.read_bytes(),b'')
    def test_digest_activation_requires_validated_route_and_returns_matching_mode(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.make(pathlib.Path(d)/'state');c=trunk();c.update(authenticationMode='digest',sipPassword='test-secret',publicIp='154.29.77.102',destinationFormat='E164')
            body=dict(tenantId=TENANT,provider='flowroute',action='activate',flowrouteTrunk=c)
            self.assertRaises(ValueError,a.handle,body)
            a.config['digestCommissioned']=True
            result=a.handle(body)
            self.assertEqual(result['authenticationMode'],'digest')
            self.assertNotIn('sipPassword',result)
    def test_uncommissioned_route_refused(self):
        a=self.make('/unused',False)
        self.assertEqual(a.handle(dict(tenantId=TENANT,provider='flowroute',action='health')),{'status':'healthy','backend':'kamailio','routingCommissioned':False})
        self.assertRaises(ValueError,a.handle,dict(tenantId=TENANT,provider='flowroute',action='verify'))
    def test_failed_readback_restores_runtime(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'state';p.write_text('old');a=self.make(p);original=a.rpc
            a.rpc=lambda *args:'mismatch' if args[0]=='htable.get' else original(*args)
            c=trunk();c['publicIp']='154.29.77.102'
            self.assertRaises(RuntimeError,a.handle,dict(tenantId=TENANT,provider='flowroute',action='activate',flowrouteTrunk=c))
            self.assertEqual(a.value,'old');self.assertEqual(p.read_text(),'old')
    def test_tenant_mismatch_rejected(self):
        a=self.make('/unused');self.assertRaises(ValueError,a.handle,dict(tenantId='00000000-0000-4000-8000-000000000002',provider='flowroute',action='health'))
if __name__=='__main__':unittest.main()
