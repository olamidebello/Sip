import importlib.util
import subprocess
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('installer',Path(__file__).with_name('install-wallet-geofence-local.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Integration(unittest.TestCase):
 def test_preserves_production_balance_and_history(self):
  wallet=subprocess.check_output(['git','show','00a90ae:services/api/wallet.js'],text=True)
  main=subprocess.check_output(['git','show','00a90ae:apps/web/src/main.js'],text=True)
  wallet=wallet.replace('currency:"USD",entries:entries.rows','availableBalanceCents:available,reservedBalanceCents:reserved,currency:"USD",entries:entries.rows')
  main=main.replace('${Number(entry.delta_cents)>=0?', '${entry.type===\'topup\'?"Top Up":Number(entry.delta_cents)>=0?')
  w,j=m.wallet_edits(wallet,main)
  self.assertIn('reservedBalanceCents:reserved',w)
  self.assertIn('availableBalanceCents:available',w)
  self.assertIn('purchases:purchases.rows',w)
  self.assertIn('"Top Up"',j)
  self.assertIn('"Purchase"',j)
  self.assertIn('wallet.availableBalanceCents??wallet.balanceCents',j)
  self.assertEqual((w,j),m.wallet_edits(w,j))
  for text in (w,j):
   subprocess.run(['node','--check','--input-type=module'],input=text,text=True,check=True)
 def test_unknown_layout_stops(self):
  with self.assertRaises(RuntimeError):m.wallet_edits('custom code','custom code')
if __name__=='__main__':unittest.main()
