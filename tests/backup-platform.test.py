import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE=Path(__file__).resolve().parents[1]/'tools'/'backup-platform.sh'

class BackupTests(unittest.TestCase):
 def exercise(self,fail=False):
  temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
  root=Path(temp.name);repo=root/'repo';(repo/'deployment/docker').mkdir(parents=True)
  (repo/'example.txt').write_text('source fixture')
  bin=root/'bin';bin.mkdir()
  (bin/'docker').write_text('#!/bin/bash\nif [[ "$*" == *information_schema* ]]; then echo 0; elif [[ "$*" == *mysqldump* ]]; then '+('echo rejected >&2; exit 1' if fail else "printf '%s\\n' '-- dump fixture' 'CREATE TABLE fixture(id INT);'")+'; else exit 1; fi\n')
  (bin/'df').write_text('#!/bin/bash\nprintf "Avail\\n999999999999\\n"\n')
  (bin/'id').write_text('#!/bin/bash\necho 0\n')
  for p in bin.iterdir():p.chmod(0o700)
  script=SOURCE.read_text().replace('/opt/olamide/repo',str(repo)).replace('/opt/olamide/backups/platform',str(root/'backups')).replace('/run/olamide-update.lock',str(root/'lock'))
  p=root/'backup.sh';p.write_text(script)
  result=subprocess.run(['bash',str(p)],env={**os.environ,'PATH':str(bin)+':'+os.environ['PATH']},capture_output=True,text=True)
  return root,result
 def test_completed_snapshot_has_checksums_and_private_permissions(self):
  root,r=self.exercise();self.assertEqual(r.returncode,0,r.stderr)
  snapshots=list((root/'backups').glob('snapshot-*'));self.assertEqual(len(snapshots),1)
  snapshot=snapshots[0];self.assertEqual(snapshot.stat().st_mode&0o777,0o700)
  self.assertEqual(subprocess.run(['sha256sum','-c','SHA256SUMS'],cwd=snapshot,capture_output=True).returncode,0)
  self.assertEqual(subprocess.run(['gzip','-t',str(snapshot/'database.sql.gz')]).returncode,0)
 def test_failed_dump_never_publishes_completed_or_partial_snapshot(self):
  root,r=self.exercise(True);self.assertNotEqual(r.returncode,0)
  self.assertEqual(list((root/'backups').iterdir()),[])

if __name__=='__main__':unittest.main()
