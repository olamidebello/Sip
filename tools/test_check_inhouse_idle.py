import unittest
from check_inhouse_idle import parse_counts
class IdleTests(unittest.TestCase):
 def test_idle(self):
  self.assertEqual(parse_counts('{\n starting: 0\n connecting: 0\n answering: 0\n ongoing: 0\n all: 0\n}'),0)
 def test_busy(self):
  self.assertEqual(parse_counts('starting: 0\nconnecting: 0\nanswering: 0\nongoing: 2\nall: 2'),2)
 def test_rpc_error_is_not_an_active_call(self):
  with self.assertRaisesRegex(ValueError,'rpc_unavailable'):parse_counts('error: 500 - command not found')
 def test_missing_or_inconsistent_counts(self):
  for text in ('','all: 0','starting: 0\nconnecting: 0\nanswering: 0\nongoing: 2\nall: 0'):
   with self.assertRaisesRegex(ValueError,'rpc_invalid_response'):parse_counts(text)
if __name__=='__main__':unittest.main()
