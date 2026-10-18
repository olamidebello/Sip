import importlib.util,unittest,sqlite3
from pathlib import Path
spec=importlib.util.spec_from_file_location('watchdog',Path(__file__).with_name('platform-watchdog.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_only_allowlisted_failed_services_recover_with_limits(self):
  self.assertTrue(m.eligible('api',3,0,0,10000))
  self.assertFalse(m.eligible('mysql',99,0,0,10000))
  self.assertFalse(m.eligible('docker',99,0,0,10000))
  self.assertFalse(m.eligible('api',2,0,0,10000))
  self.assertFalse(m.eligible('api',3,9900,0,10000))
  self.assertFalse(m.eligible('api',3,0,2,10000))
 def test_spool_retains_events_until_database_ingestion(self):
  db=sqlite3.connect(':memory:');m.init(db);m.emit(db,'api','health','error','unhealthy')
  row=db.execute('SELECT payload FROM events').fetchone();self.assertIn('unhealthy',row[0]);self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0],1)
if __name__=='__main__':unittest.main()
