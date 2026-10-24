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
   p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('\n'.join(a for a,b in changes))
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
if __name__=='__main__':unittest.main()
