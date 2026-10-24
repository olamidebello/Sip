import importlib.util,pathlib,unittest,hashlib
spec=importlib.util.spec_from_file_location('registration',pathlib.Path(__file__).with_name('register.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Digest(unittest.TestCase):
 def test_qop_auth(self):
  r=m.authorization('Digest realm="example", nonce="abc", qop="auth,auth-int"','12345678','secret','sip:host','xyz')
  h=lambda s:hashlib.md5(s.encode()).hexdigest()
  expected=h(h('12345678:example:secret')+':abc:00000001:xyz:auth:'+h('REGISTER:sip:host'))
  self.assertIn('response="'+expected+'"',r);self.assertNotIn('secret',r);self.assertIn('qop=auth',r)
 def test_legacy_digest(self):
  r=m.authorization('Digest realm="example", nonce="abc"','12345678','secret','sip:host','xyz')
  self.assertNotIn('qop=',r)
 def test_unsupported_algorithm_rejected(self):
  with self.assertRaises(ValueError):m.authorization('Digest realm="example", nonce="abc", algorithm=SHA-512','12345678','secret','sip:host','xyz')
if __name__=='__main__':unittest.main()
class RegistrationExchange(unittest.TestCase):
 def test_challenge_response_uses_auth_and_public_contact(self):
  from unittest.mock import patch
  class Sock:
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def settimeout(self,n):pass
   def connect(self,peer):self.peer=peer
   def getsockname(self):return ('10.0.0.1',43000)
   def send(self,packet):self.packet=packet.decode();sent.append(self.packet)
   def recv(self,n):
    headers=[line for line in self.packet.split('\r\n') if line.startswith(('Call-ID:','CSeq:'))]
    status='200 OK' if 'Authorization: Digest' in self.packet else '401 Unauthorized'
    return ('SIP/2.0 '+status+'\r\n'+'\r\n'.join(headers)+'\r\nWWW-Authenticate: Digest realm="flowroute", nonce="abc", qop="auth", opaque="opaque"\r\nExpires: 600\r\n\r\n').encode()
  sent=[]
  with patch.object(m.socket,'socket',return_value=Sock()):
   result=m.register({'host':'us-east-va.sip.flowroute.com','username':'12345678','password':'private-secret','publicIp':'154.29.77.102'})
  self.assertEqual(result['state'],'registered');self.assertEqual(len(sent),2)
  self.assertIn('Contact: <sip:12345678@154.29.77.102:5060;transport=udp>',sent[1]);self.assertIn('opaque="opaque"',sent[1]);self.assertNotIn('private-secret',sent[1])
