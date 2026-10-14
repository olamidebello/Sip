import pathlib,tempfile,unittest
from xml.etree import ElementTree as ET
from adapter import Adapter,xml_files,validate
TENANT='00000000-0000-4000-8000-000000000001'
def trunk():return dict(host='us-east-va.sip.flowroute.com',port=5060,transport='udp',register=False,authenticationMode='ip',techPrefix='12345678',sipUsername='12345678',callerId='+15551234567',configurationRevision=1,defaultOutbound='flowroute',fallback=False,destinationFormat='techPrefix*E164')
class Tests(unittest.TestCase):
    def test_ip_route_requires_authorization_and_tenant(self):
        gw,dial=xml_files(TENANT,trunk());root=ET.fromstring(dial)
        conditions=root.findall('.//condition');self.assertEqual(len(conditions),3)
        self.assertEqual(conditions[0].get('field'),'${olamide_tenant_id}')
        self.assertEqual(conditions[1].get('expression'),'^true$')
        self.assertIn('12345678*$1',root.find('.//action[@application="bridge"]').get('data'))
        self.assertNotIn(b'password',gw)
    def test_digest_xml_escapes_secret(self):
        c=trunk();c.update(authenticationMode='digest',destinationFormat='E164',sipPassword='a<&"b')
        gw,_=xml_files(TENANT,c);self.assertEqual(ET.fromstring(gw).find('.//param[@name="password"]').get('value'),'a<&"b')
    def test_arbitrary_carrier_rejected(self):
        c=trunk();c['host']='evil.example';self.assertRaises(ValueError,validate,c)
    def test_failed_switch_apply_restores_files(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/('olamide-'+TENANT+'.xml');p.write_bytes(b'old')
            a=Adapter(dict(tenantId=TENANT,gatewayDir=d,dialplanDir=d,profile='external',routingCommissioned=True))
            calls=[]
            def cli(cmd):
                calls.append(cmd)
                if cmd=='status':return 'UP'
                if cmd.startswith('sofia status gateway'):raise RuntimeError('Missing gateway')
                return '+OK'
            a.cli=cli
            self.assertRaises(RuntimeError,a.handle,dict(tenantId=TENANT,provider='flowroute',action='activate',flowrouteTrunk=trunk()))
            self.assertEqual(p.read_bytes(),b'old');self.assertGreater(calls.count('reloadxml'),1)
    def test_uncommissioned_activation_refused(self):
        a=Adapter(dict(tenantId=TENANT,routingCommissioned=False));a.cli=lambda cmd:'UP'
        self.assertRaises(ValueError,a.handle,dict(tenantId=TENANT,provider='flowroute',action='activate',flowrouteTrunk=trunk()))
        self.assertEqual(a.handle(dict(tenantId=TENANT,provider='flowroute',action='health')),{'status':'healthy'})
if __name__=='__main__':unittest.main()
