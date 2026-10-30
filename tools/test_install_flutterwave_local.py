import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('flutterwave_installer',Path(__file__).with_name('install-flutterwave-local.py'))
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
ROUTER='''import {localFix} from './localFix.js';
function handler(req,res) {
  const providerWebhook=path.startsWith("/api/webhooks/providers/");
  if (req.method !== "GET" && !localBridge && !providerWebhook && req.headers.origin !== origin)
    return send(res,403,{error:'Invalid origin'});
  const external=!!(localBridge||providerWebhook||didwwWebhook);
  if (providerWebhook) return await handleProviderWebhook({req,res,path,pool,send});
  if(path.startsWith('/api/marketplace/')||path==='/api/admin/marketplace/gateways') return await handleStoreGateways({req,res,path,user,pool,send,readJson,origin});
  if(path==='/api/local/fix') return localFix();
}
'''

class RouterTests(unittest.TestCase):
 def test_production_description_sanitizer_and_joined_lines_are_preserved(self):
  root=Path(__file__).resolve().parents[1];path='apps/web/src/main.js'
  base=subprocess.check_output(['git','show',installer.BASE+':'+path],cwd=root).decode()
  incoming=(root/path).read_text()
  local=base.replace('${invoice.description}','${customerText(invoice.description)}').replace('Number(wallet.balanceCents)','Number(wallet.availableBalanceCents??wallet.balanceCents)')
  local=local.replace('const li = document.createElement("li");\n    li.textContent','const li = document.createElement("li");    li.textContent')
  local=local.replace("for(const a of attempts.attempts.filter(a=>a.status!=='paid')){\n    const li", "for(const a of attempts.attempts.filter(a=>a.status!=='paid')){    const li")
  patched=installer.integrate_ui(local,base,incoming,path)
  self.assertIn('${customerText(invoice.description)}',patched)
  self.assertIn('wallet.availableBalanceCents??wallet.balanceCents',patched)
  self.assertIn('/api/marketplace/naira-quote',patched)
  self.assertNotIn("attempts.attempts.filter(a=>a.status!=='paid')",patched)
  self.assertEqual(installer.integrate_ui(patched,base,incoming,path),patched)
  with tempfile.TemporaryDirectory() as tmp:
   output=Path(tmp)/'main.mjs';output.write_text(patched);subprocess.run(['node','--check',str(output)],check=True)
 def test_ui_edits_keep_adjacent_wallet_fixes(self):
  base='import old;\nconst walletBalance=wallet.balanceCents;\ncheckoutOld();\nfooter();\n'
  incoming=base.replace('checkoutOld();','checkoutWithNairaQuote();')
  local=base.replace('import old;','import old;\nimport localFeature;').replace('wallet.balanceCents','wallet.availableBalanceCents')
  result=installer.integrate_ui(local,base,incoming,'main.js')
  self.assertIn('import localFeature;',result);self.assertIn('wallet.availableBalanceCents',result);self.assertIn('checkoutWithNairaQuote();',result)
  self.assertEqual(installer.integrate_ui(result,base,incoming,'main.js'),result)
 def test_ui_insertions_support_repeated_runs(self):
  base='head();\nuniqueAnchor();\nfooter();\n';incoming=base.replace('uniqueAnchor();','uniqueAnchor();\nnairaSettings();')
  result=installer.integrate_ui(base,base,incoming,'admin.js')
  self.assertEqual(installer.integrate_ui(result,base,incoming,'admin.js'),result)
 def test_unknown_or_ambiguous_ui_edit_fails(self):
  for local in ['other();\n','checkoutOld();\ncheckoutOld();\n']:
   with self.assertRaisesRegex(RuntimeError,'missing or ambiguous'):installer.integrate_ui(local,'checkoutOld();\n','checkoutWithNairaQuote();\n','main.js')
 def test_overlapping_local_routes_are_preserved(self):
  result=installer.integrate_server(ROUTER)
  for line in ["import {localFix} from './localFix.js';","  if(path==='/api/local/fix') return localFix();"]:self.assertIn(line,result)
  self.assertIn('!localBridge && !flutterwaveWebhook && !providerWebhook',result)
  self.assertIn('localBridge||flutterwaveWebhook||providerWebhook||didwwWebhook',result)
  self.assertLess(result.index('return await handleFlutterwaveWebhook'),result.index('return await handleProviderWebhook'))
  self.assertIn("path==='/api/admin/marketplace/naira'",result)
 def test_repeat_is_identical(self):
  result=installer.integrate_server(ROUTER)
  self.assertEqual(installer.integrate_server(result),result)
 def test_unknown_origin_guard_is_rejected(self):
  with self.assertRaisesRegex(RuntimeError,'origin guard'):installer.integrate_server(ROUTER.replace('req.headers.origin','req.customOrigin'))
 def test_ambiguous_origin_guard_is_rejected(self):
  guard=next(line for line in ROUTER.splitlines() if 'req.headers.origin' in line)
  with self.assertRaisesRegex(RuntimeError,'origin guard'):installer.integrate_server(ROUTER+'\n'+guard+'\n')
 def test_conflict_stops_before_any_source_write(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   def git(*args):return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.DEVNULL)
   git('init');git('config','user.name','Test');git('config','user.email','test@example.test')
   for path in installer.FILES:
    p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(ROUTER if path=='services/api/server.js' else 'base\n')
   git('add','.');git('commit','-m','base');previous=installer.BASE;installer.BASE=git('rev-parse','HEAD').decode().strip()
   try:
    p=root/'services/api/payments.js';p.write_text('incoming\n');git('add','.');git('commit','-m','incoming');target=git('rev-parse','HEAD').decode().strip()
    git('checkout','--detach',installer.BASE);p.write_text('conflicting local edit\n')
    before={p:(root/p).read_bytes() for p in installer.FILES}
    with self.assertRaisesRegex(RuntimeError,'no files written'):installer.install(root,target)
    self.assertEqual(before,{p:(root/p).read_bytes() for p in installer.FILES})
   finally:installer.BASE=previous

if __name__=='__main__':unittest.main()
