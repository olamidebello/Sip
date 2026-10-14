import tempfile,pathlib,unittest
from billing_queue import connection
class Tests(unittest.TestCase):
 def test_committed_event_survives_reopen_and_duplicate_is_not_added(self):
  with tempfile.TemporaryDirectory() as d:
   path=str(pathlib.Path(d)/'queue.sqlite')
   with connection(path) as db:db.execute('INSERT INTO events(call_key,event,payload) VALUES(?,?,?)',('a'*64,'start','{}'))
   with connection(path) as db:
    db.execute('INSERT OR IGNORE INTO events(call_key,event,payload) VALUES(?,?,?)',('a'*64,'start','{}'))
    self.assertEqual(db.execute('SELECT count(*) FROM events WHERE done=0').fetchone()[0],1)
if __name__=='__main__':unittest.main()
