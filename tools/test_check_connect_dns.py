import unittest
from check_connect_dns import verify,RESOLVERS

def answer(resolver,name,kind):return {'Status':0,'Answer':[{'type':1,'data':'154.29.77.102'}] if kind=='A' else []}
class DnsTests(unittest.TestCase):
 def test_stale_local_cache_does_not_override_matching_public_answers(self):
  result=verify(answer,lambda name:{'154.29.77.102','162.255.119.59'})
  self.assertEqual(len(result),2);self.assertTrue(all(r['local_cache_stale'] for r in result))
 def test_public_extra_address_still_rejected(self):
  def bad(r,n,k):
   reply=answer(r,n,k)
   if r==RESOLVERS[1] and k=='A':reply['Answer'].append({'type':1,'data':'162.255.119.59'})
   return reply
  with self.assertRaises(ValueError):verify(bad,lambda n:{'154.29.77.102'})
 def test_public_ipv6_rejected(self):
  def bad(r,n,k):return {'Status':0,'Answer':[{'type':28,'data':'2001:db8::1'}]} if k=='AAAA' else answer(r,n,k)
  with self.assertRaises(ValueError):verify(bad)
 def test_failed_resolver_is_not_ignored(self):
  with self.assertRaises(ValueError):verify(lambda *args:{'Status':2})
if __name__=='__main__':unittest.main()
