import ast, os, subprocess, sys, tempfile, unittest
from pathlib import Path
installer=Path(os.environ.get('ADMIN_STATUS_INSTALLER',Path(__file__).resolve().parents[1]/'install-admin-status-icons.py'))
tree=ast.parse(installer.read_text())
patches=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='patches' for t in n.targets))
class InstallerTests(unittest.TestCase):
 def fixture(self,root):
  base=root/'apps/web/src';base.mkdir(parents=True)
  for name,changes in patches.items():(base/name).write_text('\n'.join(a for a,b in changes))
 def test_all_anchors_and_repeat(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root)
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   before={p:p.read_text() for p in (root/'apps/web/src').iterdir()}
   self.assertTrue(all('// ADMIN_STATUS_ICONS_V1' in s for s in before.values()))
   subprocess.run([sys.executable,str(installer),str(root)],check=True,capture_output=True)
   self.assertEqual(before,{p:p.read_text() for p in before})
 def test_unknown_anchor_changes_nothing(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);self.fixture(root);(root/'apps/web/src/groups.js').write_text('custom source')
   before={p:p.read_text() for p in (root/'apps/web/src').iterdir()}
   result=subprocess.run([sys.executable,str(installer),str(root)],capture_output=True)
   self.assertNotEqual(result.returncode,0);self.assertEqual(before,{p:p.read_text() for p in before})
if __name__=='__main__':unittest.main()
