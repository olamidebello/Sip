import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('watchdog',pathlib.Path(__file__).with_name('location-watchdog.py'));watchdog=importlib.util.module_from_spec(spec);spec.loader.exec_module(watchdog)
class DialogParsing(unittest.TestCase):
 def test_only_confirmed_dialogs_are_candidates(self):
  raw='{\n h_entry: 1\n h_id: 2\n call-id: abc\n from_tag: xyz\n state: 4\n}\n{\n h_entry: 3\n h_id: 4\n call-id: def\n from_tag: uvw\n state: 3\n}'
  rows=watchdog.dialogs(raw);self.assertEqual(len(rows),1);self.assertEqual(rows[0][1:],('1','2'));self.assertEqual(len(rows[0][0]),64)
if __name__=='__main__':unittest.main()
