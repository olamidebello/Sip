import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
TOOL=ROOT/'tools/local-feature-release.py'
class FeatureRelease(unittest.TestCase):
 def setup_case(self,t):
  root=Path(t);live=root/'live';stage=root/'stage';backup=root/'backup';tools=root/'bin'
  for p in [live/'services/api',stage/'services/api',live/'deployment/docker',stage/'deployment/docker',backup,tools]:p.mkdir(parents=True,exist_ok=True)
  (live/'services/api/server.js').write_text('local old source')
  (stage/'services/api/server.js').write_text('local new source')
  (stage/'services/api/quickSignup.js').write_text('new module')
  (live/'deployment/docker/.env').write_text('PRIVATE_KEY=keep-me\n')
  config={'name':'olamide','services':{s:{'image':'original-'+s+':local','build':{'context':str(live),'dockerfile':'deployment/docker/'+s+'.Dockerfile'},'environment':{'PRIVATE_KEY':'keep-me'}} for s in ['api','web']}}
  (backup/'effective-compose.json').write_text(json.dumps(config))
  manifest={'files':[{'path':'services/api/server.js','existed':True,'before_sha256':hashlib.sha256(b'local old source').hexdigest()},{'path':'services/api/quickSignup.js','existed':False,'before_sha256':None}]}
  (backup/'manifest.json').write_text(json.dumps(manifest))
  docker=tools/'docker';docker.write_text('#!/bin/sh\ncat "$TEST_COMPOSE_JSON"\n');docker.chmod(0o755)
  (root/'current-compose.json').write_text(json.dumps(config))
  env={**os.environ,'PATH':str(tools)+os.pathsep+os.environ['PATH'],'TEST_COMPOSE_JSON':str(root/'current-compose.json')}
  def run(command):return subprocess.run([sys.executable,str(TOOL),command,str(live),str(stage),str(backup)],env=env,capture_output=True,text=True)
  return live,stage,backup,config,run
 def test_stage_configuration_preserves_secrets_and_uses_separate_image_tags(self):
  with tempfile.TemporaryDirectory() as t:
   live,stage,backup,config,run=self.setup_case(t)
   r=run('prepare');self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout,'')
   prepared=json.loads((backup/'stage-compose.json').read_text())
   self.assertEqual(prepared['services']['api']['build']['context'],str(stage))
   self.assertEqual(prepared['services']['api']['environment'],config['services']['api']['environment'])
   self.assertNotEqual(prepared['services']['api']['image'],config['services']['api']['image'])
 def test_narrow_promotion_and_restore_preserve_environment_and_unrelated_files(self):
  with tempfile.TemporaryDirectory() as t:
   live,stage,backup,config,run=self.setup_case(t)
   other=live/'services/api/unrelated.js';other.write_text('keep local integration')
   for op in ['save','promote']:
    r=run(op);self.assertEqual(r.returncode,0,r.stderr)
   self.assertEqual((live/'services/api/server.js').read_text(),'local new source')
   self.assertTrue((live/'services/api/quickSignup.js').exists())
   r=run('restore');self.assertEqual(r.returncode,0,r.stderr)
   self.assertEqual((live/'services/api/server.js').read_text(),'local old source')
   self.assertFalse((live/'services/api/quickSignup.js').exists())
   self.assertEqual(other.read_text(),'keep local integration')
   self.assertEqual((live/'deployment/docker/.env').read_text(),'PRIVATE_KEY=keep-me\n')
 def test_changed_source_is_not_overwritten(self):
  with tempfile.TemporaryDirectory() as t:
   live,stage,backup,config,run=self.setup_case(t)
   self.assertEqual(run('save').returncode,0)
   (live/'services/api/server.js').write_text('concurrent manual fix')
   r=run('promote');self.assertNotEqual(r.returncode,0);self.assertIn('no files promoted',r.stderr)
   self.assertEqual((live/'services/api/server.js').read_text(),'concurrent manual fix')
   self.assertFalse((live/'services/api/quickSignup.js').exists())
 def test_changed_live_compose_is_not_promoted(self):
  with tempfile.TemporaryDirectory() as t:
   live,stage,backup,config,run=self.setup_case(t)
   self.assertEqual(run('save').returncode,0)
   config['services']['api']['environment']['PRIVATE_KEY']='changed privately'
   (Path(t)/'current-compose.json').write_text(json.dumps(config))
   r=run('promote');self.assertNotEqual(r.returncode,0);self.assertIn('no files promoted',r.stderr)
   self.assertEqual((live/'services/api/server.js').read_text(),'local old source')
   self.assertFalse((live/'services/api/quickSignup.js').exists())
 def test_compose_drift_and_unapproved_paths_are_blocked(self):
  with tempfile.TemporaryDirectory() as t:
   live,stage,backup,config,run=self.setup_case(t)
   manifest=json.loads((backup/'manifest.json').read_text());manifest['files'][0]['path']='deployment/docker/.env';(backup/'manifest.json').write_text(json.dumps(manifest))
   r=run('save');self.assertNotEqual(r.returncode,0);self.assertIn('Unexpected promotion path',r.stderr)
   self.assertEqual((live/'deployment/docker/.env').read_text(),'PRIVATE_KEY=keep-me\n')
if __name__=='__main__':unittest.main()
