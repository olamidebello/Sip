import importlib.util,unittest,copy
from pathlib import Path
spec=importlib.util.spec_from_file_location('turn',Path(__file__).with_name('enable-turn-local.py'));t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
class Test(unittest.TestCase):
 def test_missing_turn_added_without_replacing_api_mounts(self):
  c={'services':{'api':{'environment':{'MYSQL_URL':'private-db'},'volumes':[{'source':'/etc/countries.geojson','target':'/app/resources/countries.geojson','read_only':True}]},'web':{'ports':['443:443']}}};before=copy.deepcopy(c)
  r=t.ensure_turn(c);self.assertEqual(r['services']['api']['volumes'],before['services']['api']['volumes']);self.assertEqual(r['services']['web'],before['services']['web']);self.assertEqual(r['services']['api']['environment']['MYSQL_URL'],'private-db');self.assertEqual(r['services']['turn']['network_mode'],'host')
 def test_existing_turn_preserved_and_idempotent(self):
  c={'services':{'api':{},'turn':{'image':'custom-turn','profiles':['media'],'environment':['TURN_SECRET=existing-key','CUSTOM=value']}}};r=t.ensure_turn(c);before=copy.deepcopy(r);t.ensure_turn(c);self.assertEqual(c,before);self.assertEqual(c['services']['turn']['image'],'custom-turn');self.assertEqual(c['services']['turn']['environment']['TURN_SECRET'],'existing-key');self.assertIn('turn',c['services']['turn']['profiles'])
if __name__=='__main__':unittest.main()
