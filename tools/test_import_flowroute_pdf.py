import pathlib,runpy,unittest
extract=runpy.run_path(str(pathlib.Path(__file__).with_name('import_flowroute_pdf.py')))['extract']
class ImportTest(unittest.TestCase):
 def test_credentials_are_distinct_from_api_keys(self):
  c=extract('SIP Credentials\nUsername & Auth Username 12345678\nprivate-example\nPassword\nReset Password')
  self.assertEqual(c,{'sipUsername':'12345678','techPrefix':'12345678','sipPassword':'private-example'})
 def test_unrecognized_layout_stops(self):
  with self.assertRaises(ValueError):extract('Username\nunknown\nPassword')
