import unittest
from allow_flowroute_sip import plan,COMMENT
class Tests(unittest.TestCase):
 def test_limits_exceptions_to_signaling_networks_and_ports(self):
  data={'nftables':[{'chain':{'family':'inet','table':'filter','name':'input','hook':'input','policy':'drop'}}]}
  commands=plan(data);self.assertEqual(len(commands),2)
  for c in commands:
   self.assertIn('ip saddr { 34.226.36.32/28, 34.210.91.112/28 }',c);self.assertIn('dport 5060',c);self.assertNotIn('flush',c)
 def test_idempotent_and_covers_each_input_chain(self):
  entries=[{'chain':{'family':family,'table':'filter','name':'input','hook':'input'}} for family in ['inet','ip']]
  entries += [{'rule':{'family':'inet','table':'filter','chain':'input','comment':COMMENT+'-'+p}} for p in ['udp','tcp']]
  commands=plan({'nftables':entries});self.assertEqual(len(commands),2);self.assertTrue(all('rule ip ' in c for c in commands))
 def test_does_not_invent_a_firewall_on_an_unknown_layout(self):
  with self.assertRaises(ValueError):plan({'nftables':[]})
if __name__=='__main__':unittest.main()
