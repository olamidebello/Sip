import pathlib,unittest,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Cleanup(unittest.TestCase):
 def test_production_paths_have_no_auxiliary_switch(self):
  for p in ['deploy/ansible/same-server.yml','deployment/deploy-carrier-console.sh','apps/web/src/kamailioAdmin.js','tools/service_inventory.py','services/carrier-adapter/adapter.py']:
   s=(ROOT/p).read_text().lower();self.assertNotIn('freeswitch',s,p);self.assertNotIn('fs_cli',s,p)
  self.assertNotIn('native-astpp-gui.yml',(ROOT/'deploy/ansible/carrier-console.yml').read_text())
  self.assertNotIn('same-server-freeswitch-cluster',json.loads((ROOT/'deploy/ansible/same-server.profiles.example.json').read_text()))
 def test_legacy_installer_is_removed(self):
  for p in ['deploy/ansible/freeswitch-cluster.yml','deploy/ansible/install-carrier-adapter.yml','deploy/ansible/roles/freeswitch_cluster/tasks/main.yml']:
   self.assertFalse((ROOT/p).exists())
if __name__=='__main__':unittest.main()
