import unittest,runpy,pathlib
choose=runpy.run_path(str(pathlib.Path(__file__).with_name('repair_sip_credential_key.py')))['select_key']
class KeyRecovery(unittest.TestCase):
 def test_preserve_valid_current(self):self.assertEqual(choose({'total':2,'matches':[2,2]},0),0)
 def test_restore_only_full_match(self):self.assertEqual(choose({'total':2,'matches':[0,2]},0),1)
 def test_mixed_credentials_block_repair(self):
  with self.assertRaises(ValueError):choose({'total':2,'matches':[1,1]},0)
 def test_empty_table_does_not_rotate(self):self.assertIsNone(choose({'total':0,'matches':[0,0]},0))
if __name__=='__main__':unittest.main()
