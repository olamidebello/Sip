import importlib.util
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('play',Path(__file__).resolve().parents[1]/'apps/mobile/prepare-play-release.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PlayReleaseTests(unittest.TestCase):
 def test_sdk_and_unique_version(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'app').mkdir();(root/'variables.gradle').write_text('ext {\n compileSdkVersion = 35\n targetSdkVersion = 35\n}\n');(root/'app/build.gradle').write_text(' versionCode 1\n versionName "1.0"\n')
   module.prepare(root,'120003');self.assertIn('targetSdkVersion = 36',(root/'variables.gradle').read_text());self.assertIn('versionCode 120003',(root/'app/build.gradle').read_text());self.assertIn('"0.1.120003"',(root/'app/build.gradle').read_text())
 def test_bad_version(self):
  for value in ['0','-1','abc','1000000000']:
   with self.assertRaises(ValueError):module.prepare(Path('/unused'),value)
 def test_unknown_anchor_is_atomic(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'app').mkdir();variables=root/'variables.gradle';variables.write_text('compileSdkVersion = 35\ntargetSdkVersion = 35\n');(root/'app/build.gradle').write_text('custom format')
   before=variables.read_text()
   with self.assertRaises(ValueError):module.prepare(root,'10')
   self.assertEqual(variables.read_text(),before)
if __name__=='__main__':unittest.main()
