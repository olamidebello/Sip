"""Run unchanged signup assertions against recorded account/plan implementations."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
CONTRACTS=json.loads((ROOT/'tests/fixtures/quick-signup-plan-contracts.json').read_text())
class SignupPlanCompatibility(unittest.TestCase):
 def test_signup_creation_rollback_and_webhook_replay_with_recorded_plan_versions(self):
  for plan in CONTRACTS['plans']:
   with self.subTest(plan=plan['name']),tempfile.TemporaryDirectory() as directory:
    api=Path(directory)/'api'
    shutil.copytree(ROOT/'services/api',api,ignore=shutil.ignore_patterns('node_modules','__pycache__'))
    source=(api/'sipMarketplace.js').read_text()
    source,count=re.subn(r'^export async function createSipAccount\b[\s\S]*?^}',lambda _:CONTRACTS['createSipAccount'],source,count=1,flags=re.M)
    self.assertEqual(count,1)
    if "import {ensureDefaultCallingPlan} from './defaultCallingPlan.js';" not in source:
     source="import {ensureDefaultCallingPlan} from './defaultCallingPlan.js';\n"+source
    (api/'sipMarketplace.js').write_text(source)
    (api/'defaultCallingPlan.js').write_text(plan['module'])
    modules=ROOT/'services/api/node_modules'
    if modules.exists():(api/'node_modules').symlink_to(modules,target_is_directory=True)
    result=subprocess.run(['node','--test','quickSignup.test.js'],cwd=api,capture_output=True,text=True)
    self.assertEqual(result.returncode,0,plan['name']+'\n'+result.stdout+'\n'+result.stderr)
if __name__=='__main__':unittest.main()
