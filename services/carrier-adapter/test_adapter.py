import pathlib,tempfile,unittest
from adapter import validate
TENANT='00000000-0000-4000-8000-000000000001'
def trunk():return dict(host='us-east-va.sip.flowroute.com',port=5060,transport='udp',register=False,authenticationMode='ip',techPrefix='12345678',sipUsername='12345678',callerId='+15551234567',configurationRevision=1,defaultOutbound='flowroute',fallback=False,destinationFormat='techPrefix*E164')
class Tests(unittest.TestCase):
    def test_arbitrary_carrier_rejected(self):
        c=trunk();c['host']='evil.example';self.assertRaises(ValueError,validate,c)
    def test_invalid_prefix_rejected(self):
        c=trunk();c['techPrefix']='unsafe';self.assertRaises(ValueError,validate,c)
if __name__=='__main__':unittest.main()
