import unittest,tempfile,subprocess,yaml
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class FxPatchTest(unittest.TestCase):
 def test_repeatable_preserves_custom_sources(self):
  with tempfile.TemporaryDirectory() as folder:
   for name in ['services/api/server.js','apps/web/src/main.js']:
    p=Path(folder)/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text((ROOT/name).read_text()+'\n// commissioned customization retained\n')
   for _ in range(2):subprocess.run(['python3',str(ROOT/'tools/apply_icn_fx.py'),folder],check=True)
   for name in ['services/api/server.js','apps/web/src/main.js']:
    source=(Path(folder)/name).read_text();self.assertIn('commissioned customization retained',source)
    subprocess.run(['node','--input-type=module','--check'],input=source,text=True,check=True)
   self.assertEqual((Path(folder)/'services/api/server.js').read_text().count('await migrateIcnFx(pool);'),1)
  shell=yaml.safe_load((ROOT/'deploy/ansible/icn-fx-display.yml').read_text())[0]['tasks'][2]['ansible.builtin.shell']
  self.assertIn('"$backup/source/$f" "/opt/olamide/repo/$f"',shell)
  subprocess.run(['bash','-n'],input=shell,text=True,check=True)
if __name__=='__main__':unittest.main()
