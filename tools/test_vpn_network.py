import importlib.util,json,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('network',Path(__file__).with_name('vpn-network.py'));n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
class Test(unittest.TestCase):
 def test_nat_rule_is_terminated_before_closing_braces(self):
  rules,*_=n.render({'endpoint':'154.29.77.102','mediaPorts':['3478','30000-40000']},'eth0')
  self.assertIn('masquerade\n }\n}',rules);self.assertNotIn('masquerade }',rules);self.assertNotIn('flush ruleset',rules)
 def test_command_diagnostic_is_preserved(self):
  with patch.object(n.subprocess,'run',return_value=SimpleNamespace(returncode=1,stderr='stdin:9: syntax error',stdout='')):
   with self.assertRaisesRegex(SystemExit,'stdin:9: syntax error'):n.run(['nft','-c','-f','-'])
 def test_dry_run_cannot_apply_firewall_changes(self):
  calls=[]
  def run(args,data=None,check=True):
   calls.append(args)
   return SimpleNamespace(returncode=1 if args[:3]==['nft','list','table'] else 0,stdout='[{"dev":"eth0"}]',stderr='')
  with patch.object(n.Path,'read_text',return_value=json.dumps({'endpoint':'154.29.77.102','mediaPorts':['3478']})),patch.object(n,'run',side_effect=run):n.apply(True)
  self.assertIn(['nft','-c','-f','-'],calls)
  self.assertTrue(all(args[0] in ('ip','nft') for args in calls));self.assertNotIn(['nft','-f','-'],calls)
 def test_invalid_interface_and_ports_rejected(self):
  for cfg,dev in [({'endpoint':'154.29.77.102','mediaPorts':['0']},'eth0'),({'endpoint':'154.29.77.102','mediaPorts':['3478']},'eth0; drop')]:
   with self.assertRaises(ValueError):n.render(cfg,dev)
if __name__=='__main__':unittest.main()
