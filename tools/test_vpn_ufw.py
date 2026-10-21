import importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('u',Path(__file__).with_name('vpn-ufw.py'));u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
class Test(unittest.TestCase):
 def test_rules_are_narrow(self):
  rules=u.vpn_rules('154.29.77.102',['5060','30000-40000'])
  self.assertIn('30000:40000',rules[-1]);self.assertIn('wg-olamide',rules[1]);self.assertIn('10.77.0.0/24',rules[1])
  self.assertTrue(all(not any(a in r for a in ['reset','disable','delete','reload']) for r in rules))
 def test_existing_firewall_stays_enabled(self):
  commands=[]
  def run(args,**kw):commands.append(args);return SimpleNamespace(returncode=0,stdout='Status: active' if args==['ufw','status'] else 'Rule added',stderr='')
  with patch.object(u.shutil,'which',return_value='/usr/sbin/ufw'):u.apply('turn','154.29.77.102',runner=run)
  self.assertEqual(len(commands),4);self.assertTrue(all('154.29.77.102' in r for r in commands[1:]));self.assertTrue(all('disable' not in r for r in commands))
 def test_inactive_firewall_is_not_enabled(self):
  commands=[]
  def run(args,**kw):commands.append(args);return SimpleNamespace(returncode=0,stdout='Status: inactive',stderr='')
  with patch.object(u.shutil,'which',return_value='/usr/sbin/ufw'):u.apply('vpn','154.29.77.102',['5060'],runner=run)
  self.assertEqual(commands,[['ufw','status']])
 def test_invalid_port_rejected(self):
  for p in ['0','65536','100-1','22;reset']:
   with self.assertRaises(ValueError):u.vpn_rules('154.29.77.102',[p])
if __name__=='__main__':unittest.main()
