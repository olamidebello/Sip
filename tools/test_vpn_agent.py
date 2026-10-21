import base64,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('agent',Path(__file__).with_name('vpn-agent.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
T='a'*36;U='b'*36;T2='c'*36;U2='d'*36
class Reply:
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def read(self):return json.dumps({'users':[{'id':U,'tenant_id':T},{'id':U2,'tenant_id':T2}]}).encode()
class Test(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.n=0;self.applied=''
  def run(args,data=None):
   if args[1]=='genkey':self.n+=1;return base64.b64encode(hashlib.sha256(str(self.n).encode()).digest()).decode()
   if args[1]=='pubkey':return base64.b64encode(hashlib.sha256(data.encode()).digest()).decode()
   if args[1]=='syncconf':self.applied=data;return ''
   return 'header'
  self.a=m.Agent({'privateKey':'server-secret','publicKey':'server-public','endpoint':'154.29.77.102','bridgeToken':'token'},Path(self.tmp.name)/'state.db',run)
  self.patch=patch.object(m.urllib.request,'urlopen',return_value=Reply());self.patch.start()
 def tearDown(self):self.patch.stop();self.a.db.close();self.tmp.cleanup()
 def req(self,op,tenant=T,user=U,**kw):return self.a.handle(dict(op=op,tenant=tenant,user=user,**kw))
 def test_idempotent_login_and_secret_isolation(self):
  a=self.req('provision');b=self.req('provision');self.assertEqual(a['address'],b['address']);self.assertEqual(self.n,1);self.assertNotIn('config',a);self.assertIn('PrivateKey',self.req('config')['config']);self.assertNotIn('private_key',str(self.req('list')))
 def test_revocation_and_rotation(self):
  self.req('provision');key=self.req('config')['config'];self.req('update',enabled=False);self.assertNotIn('[Peer]',self.applied)
  with self.assertRaises(ValueError):self.req('config')
  self.req('rotate');self.req('update',enabled=True);self.assertNotEqual(key,self.req('config')['config'])
 def test_tenant_policy_does_not_disable_another_tenant(self):
  self.req('provision');self.req('provision',T2,U2);self.req('settings',enabled=False,automatic=False)
  self.assertEqual(self.applied.count('[Peer]'),1);self.assertEqual(len(self.req('list')['peers']),1)
 def test_invalid_user_is_rejected(self):
  with self.assertRaises(ValueError):self.req('provision',user='../../etc/passwd')
 def test_bridge_outage_removes_authorized_peers(self):
  self.req('provision')
  with patch.object(m.urllib.request,'urlopen',side_effect=OSError()):self.a.sync()
  self.assertNotIn('[Peer]',self.applied)
if __name__=='__main__':unittest.main()
