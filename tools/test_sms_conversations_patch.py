import unittest,tempfile,subprocess,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class SmsPatchTest(unittest.TestCase):
 def test_commissioned_declarations_and_imports_are_normalized_before_build(self):
  original=(ROOT/'apps/web/src/main.js').read_text()
  fixtures=[original,
    "import { setupPhoneSignal } from './phoneSignal.js';\n"+original,
    "import { setupPhoneSignal, phoneStatusText } from './phoneSignal.js';\n"+original,
    original.replace('smsConversations=setupSmsConversations(', 'const smsConversations = setupSmsConversations(',1),
    original.replace("import {setupSmsConversations} from './smsConversations.js';",'import { setupSmsConversations } from "./smsConversations.js";\nimport {setupSmsConversations} from \'./smsConversations.js\';'),
    original.replace('async function refreshExternalSms(){','smsConversations=setupSmsConversations({document});\nasync function refreshExternalSms(){',1)]
  for i,source in enumerate(fixtures):
   with self.subTest(layout=i),tempfile.TemporaryDirectory() as d:
    p=Path(d)/'apps/web/src/main.js';p.parent.mkdir(parents=True);p.write_text(source)
    for _ in range(2):
     subprocess.run(['python3',str(ROOT/'tools/apply_sms_conversations.py'),d],check=True,capture_output=True)
     s=p.read_text();subprocess.run(['node','--input-type=module','--check'],input=s,text=True,capture_output=True,check=True)
     self.assertEqual(s.count('let smsConversations;'),1)
     self.assertEqual(s.count('smsConversations=setupSmsConversations('),1)
     self.assertEqual(s.count("from './smsConversations.js'"),1)
     self.assertIn('const phoneSignal=',s)
     self.assertIn("history:body=>accountRequest('/api/external-sms/history',body)",s)
if __name__=='__main__':unittest.main()
