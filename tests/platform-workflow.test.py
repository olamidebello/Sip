import os
from pathlib import Path
import subprocess
import tempfile
import unittest

class WorkflowTests(unittest.TestCase):
 def test_failed_stage_preserves_receipt_and_stops_later_stages(self):
  with tempfile.TemporaryDirectory() as name:
   root=Path(name);repo=root/'repo';work=root/'work';bin=root/'bin'
   work.mkdir();bin.mkdir()
   for f in ['deployment/docker/compose.yml','services/api/locationPolicy.js','services/api/smoothDid.js','services/api/providerManager.js']:
    p=repo/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('fixture')
   (work/'backup-platform.sh').write_text('#!/bin/bash\nexit 0\n')
   for stage in ['twilio-platform-local','did-availability-local','single-auth-local']:(work/(stage+'.yml')).write_text(stage)
   (bin/'id').write_text('#!/bin/bash\necho 0\n')
   (bin/'docker').write_text('#!/bin/bash\necho fixture\n')
   (bin/'ansible-playbook').write_text('#!/bin/bash\nif [[ "$*" == *did-availability-local* ]]; then exit 2; fi\nif [[ "$*" == *single-auth-local* ]]; then touch "'+str(root/'unexpected')+'"; fi\n')
   for p in bin.iterdir():p.chmod(0o700)
   source=(Path(__file__).resolve().parents[1]/'tools/install-platform-supported.sh').read_text()
   source=source.replace('/opt/olamide/reports/platform-install',str(root/'reports')).replace('/opt/olamide/repo',str(repo)).replace('/run/olamide-platform-workflow.lock',str(root/'workflow.lock')).replace('/run/olamide-update.lock',str(root/'update.lock'))
   p=root/'run.sh';p.write_text(source)
   result=subprocess.run(['bash',str(p),str(work),'false'],env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH']},capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0);self.assertIn('Stage failed: did-availability-local',result.stdout)
   self.assertTrue((root/'reports/twilio-platform-local.sha256').exists(), result.stdout)
   self.assertFalse((root/'reports/did-availability-local.sha256').exists());self.assertFalse((root/'unexpected').exists())

if __name__=='__main__':unittest.main()
