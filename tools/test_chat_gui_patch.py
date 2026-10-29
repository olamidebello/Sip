import unittest,tempfile,subprocess,yaml
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ChatPatchTests(unittest.TestCase):
 def test_patch_is_repeatable_and_rollback_paths_are_absolute(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);src=root/'apps/web/src';src.mkdir(parents=True)
   # Reverse generated replacement blocks to reproduce the commissioned baseline.
   import runpy,ast
   tree=ast.parse((ROOT/'tools/apply_chat_gui.py').read_text())
   changes=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CHANGES' for t in n.targets))
   for name in ['conversations.js','messengerMedia.js']:
    s=(ROOT/'apps/web/src'/name).read_text()
    for path,old,new in reversed(changes):
     if path.endswith('/'+name):s=s.replace(new,old,1)
    (src/name).write_text(s)
   (src/'style.css').write_text('/* commissioned custom style */')
   for _ in range(2):subprocess.run(['python3',str(ROOT/'tools/apply_chat_gui.py'),folder],check=True)
   for name in ['conversations.js','messengerMedia.js','chatWritingTools.js']:
    subprocess.run(['node','--input-type=module','--check'],input=(src/name).read_text(),text=True,check=True)
   self.assertIn('commissioned custom style',(src/'style.css').read_text())
   self.assertEqual((src/'conversations.js').read_text().count('const writing=setupChatWritingTools'),1)
  data=yaml.safe_load((ROOT/'deploy/ansible/chat-gui.yml').read_text())
  shell=data[0]['tasks'][2]['block'][0]['ansible.builtin.shell']
  self.assertIn('"$backup/source/$f" "/opt/olamide/repo/$f"',shell)
  subprocess.run(['bash','-n'],input=shell,text=True,check=True)
if __name__=='__main__':unittest.main()
