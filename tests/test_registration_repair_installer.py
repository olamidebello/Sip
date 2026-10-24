import ast, os, subprocess, sys, tempfile, unittest
from pathlib import Path
installer=Path(os.environ.get('REGISTRATION_REPAIR_INSTALLER',Path(__file__).resolve().parents[1]/'tools/install-registration-repair.py'))
tree=ast.parse(installer.read_text())
patches=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='patches' for t in n.targets))
extra=next(n for n in tree.body if isinstance(n,ast.AugAssign))
patches['services/api/twilioAccountAuth.js']+=ast.literal_eval(extra.value)
class InstallerTests(unittest.TestCase):
 def fixture(self,root):
  base=root/'apps/web/src';base.mkdir(parents=True)
  for name,changes in patches.items():
   p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(('async function accountRequest(path,body,method=\"POST\") {\n const response=await fetch(path);\n'+changes[0][0]+'\n}\nasync function apiGet(path) {}\n'+'\n'.join(a for a,b in changes[1:])) if name=='apps/web/src/main.js' else '\n'.join(a for a,b in changes))
 def test_all_anchors_and_repeat(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root)
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   before={p:p.read_text() for p in (p for p in root.rglob('*') if p.is_file())}
   self.assertTrue(all('// REGISTRATION_REPAIR_V1' in s for s in before.values()))
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   self.assertEqual(before,{p:p.read_text() for p in before})
 def test_unknown_anchor_changes_nothing(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root);(root/'services/api/onboarding.js').write_text('custom source')
   before={p:p.read_text() for p in (p for p in root.rglob('*') if p.is_file())}
   result=subprocess.run([sys.executable,str(installer),str(root)],capture_output=True)
   self.assertNotEqual(result.returncode,0);self.assertEqual(before,{p:p.read_text() for p in before})
 def test_legacy_response_parsers_and_unrelated_code_survive(self):
  variants=["const data=await response.json(); if(!response.ok)throw new Error(data.error || 'Account request failed'); return data;",
   "const data=await response.json(); if(!response.ok){throw new Error(data.error || 'Account request failed');} return data;",
   "const data=await response.json(); if(!response.ok){const error=new Error(data.error || 'Account request failed');error.status=response.status;throw error;} return data;"]
  for variant in variants:
   with self.subTest(variant=variant),tempfile.TemporaryDirectory() as t:
    root=Path(t);self.fixture(root);p=root/'apps/web/src/main.js'
    original=p.read_text().replace(patches['apps/web/src/main.js'][0][0],variant)
    original+='\nasync function unrelated() { const data=await response.json(); return data; }\n'
    p.write_text(original)
    subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
    changed=p.read_text();self.assertIn('return accountJson(response);',changed)
    self.assertIn('const response=await fetch(path);',changed)
    self.assertIn('async function unrelated() { const data=await response.json(); return data; }',changed)
 def test_installed_customer_parser(self):
  variant='''const data = await response.json();
  if (!response.ok) {const error=new Error(["admin","super_admin"].includes(activeRole)?data.error||"Account request failed":customerText(data.error||"Account request failed"));error.status=response.status;error.code=data.code;const retry=Number(response.headers.get('Retry-After')||data.retryAfter);if(Number.isFinite(retry)&&retry>0)error.retryAfter=retry;throw error;}
  return data;'''
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root);p=root/'apps/web/src/main.js'
   p.write_text(p.read_text().replace(patches['apps/web/src/main.js'][0][0],variant))
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   changed=p.read_text();self.assertIn('return await accountJson(response)',changed)
   self.assertIn('error.message=customerText(error.message)',changed)
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   self.assertEqual(changed,p.read_text())
 def test_unknown_frontend_does_not_write_backend_changes(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root);p=root/'apps/web/src/main.js';p.write_text(p.read_text().replace(patches['apps/web/src/main.js'][0][0],'customParser();'))
   before={p:p.read_text() for p in root.rglob('*') if p.is_file()}
   result=subprocess.run([sys.executable,str(installer),str(root)],capture_output=True)
   self.assertNotEqual(result.returncode,0);self.assertEqual(before,{p:p.read_text() for p in before})
 def test_duplicate_response_block_in_another_function_is_not_replaced(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root);p=root/'apps/web/src/main.js';tail=patches['apps/web/src/main.js'][0][0]
   other='\nasync function otherRequest() {\n'+tail+'\n}\n';p.write_text(p.read_text()+other)
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   changed=p.read_text();self.assertEqual(changed.count('return accountJson(response);'),1);self.assertIn(other,changed)
if __name__=='__main__':unittest.main()
