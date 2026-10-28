import subprocess,tempfile,unittest
from pathlib import Path
import yaml
ROOT=Path(__file__).resolve().parents[1]
class LoggingTests(unittest.TestCase):
 def script(self):
  plays=yaml.safe_load((ROOT/'deploy/ansible/enable-olamideconnect-domain.yml').read_text())
  task=next(t for t in plays[0]['tasks'] if 'block' in t)
  self.assertIn('rescue',task)
  return task['block'][0]['ansible.builtin.shell']
 def test_log_precedes_lock_and_application_path(self):
  s=self.script();self.assertLess(s.index('exec > "$backup/deploy.log"'),s.index('flock -n 9'));self.assertLess(s.index('exec > "$backup/deploy.log"'),s.index('cd /opt/olamide/repo'))
  subprocess.run(['bash','-n'],input=s,text=True,check=True)
 def test_early_path_failure_creates_log_and_safe_stage(self):
  with tempfile.TemporaryDirectory() as d:
   s=self.script().split('phase=source_config')[0].replace('{{ connect_backup.path }}',d).replace('/run/olamide-update.lock',d+'/lock').replace('/opt/olamide/repo/deployment/docker',d+'/missing')
   result=subprocess.run(['bash'],input=s,text=True,capture_output=True)
   self.assertNotEqual(result.returncode,0);self.assertTrue((Path(d)/'deploy.log').exists());self.assertEqual((Path(d)/'status').read_text().strip(),'CONNECT_DOMAIN_ERROR phase=application_path')
 def test_held_lock_is_reported_without_changing_application(self):
  import fcntl
  with tempfile.TemporaryDirectory() as d:
   with open(d+'/lock','w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    s=self.script().split('phase=source_config')[0].replace('{{ connect_backup.path }}',d).replace('/run/olamide-update.lock',d+'/lock')
    result=subprocess.run(['bash'],input=s,text=True,capture_output=True)
    self.assertNotEqual(result.returncode,0);self.assertEqual((Path(d)/'status').read_text().strip(),'CONNECT_DOMAIN_ERROR phase=lock')
if __name__=='__main__':unittest.main()
