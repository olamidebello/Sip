import socket,struct,unittest
from trace_flowroute_inbound import decode
def packet(body,sport,dport):
 data=body.encode();udp=struct.pack('!HHHH',sport,dport,len(data)+8,0)+data
 ip=bytearray(20);ip[0]=0x45;ip[9]=17;ip[12:16]=socket.inet_aton('34.226.36.33');ip[16:20]=socket.inet_aton('154.29.77.102')
 return b'\0'*12+b'\x08\x00'+ip+udp
class Tests(unittest.TestCase):
 def test_invite_and_response_are_correlated_without_returning_identity(self):
  request=decode(packet('INVITE sip:private-number@host SIP/2.0\r\nCall-ID: private-id\r\nAuthorization: private-secret\r\n',5070,5060))
  reply=decode(packet('SIP/2.0 484 Called DID required\r\nCall-ID: private-id\r\n',5060,5070))
  self.assertEqual(request[1],reply[1]);self.assertEqual(request[0],'invite');self.assertTrue(request[2]);self.assertEqual(reply[2],484)
  self.assertNotIn('private',repr(request))
 def test_registration_and_other_ports_are_ignored(self):
  self.assertIsNone(decode(packet('REGISTER sip:host SIP/2.0\r\nCall-ID: private\r\n',5070,5060)))
  self.assertIsNone(decode(packet('INVITE sip:host SIP/2.0\r\nCall-ID: private\r\n',5070,5070)))
if __name__=='__main__':unittest.main()
