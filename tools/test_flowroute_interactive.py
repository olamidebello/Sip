import pathlib,unittest,yaml
root=pathlib.Path(__file__).resolve().parents[1]
class InteractiveTest(unittest.TestCase):
 def test_secret_prompt_and_transport_are_private(self):
  play=yaml.safe_load((root/'deploy/ansible/flowroute-gateway-interactive.yml').read_text())[1]
  prompt=next(p for p in play['vars_prompt'] if p['name']=='flowroute_sip_password')
  self.assertTrue(prompt['private']);self.assertTrue(prompt['confirm'])
  task=next(t for t in play['tasks'] if 'stdin' in t.get('ansible.builtin.command',{}))
  self.assertTrue(task['no_log']);self.assertIn('flowroute_sip_password',task['ansible.builtin.command']['stdin'])
  self.assertNotIn('flowroute_sip_password',' '.join(task['ansible.builtin.command']['argv']))
 def test_pdf_import_retains_default_preservation(self):
  importer=(root/'services/api/importFlowrouteTrunk.js').read_text()
  self.assertIn('if(old&&!b.replaceExisting)',importer)
  self.assertIn('expectedRevision:old?.revision||0',importer)

class GuiDeploymentTest(unittest.TestCase):
 def test_default_is_unattended_and_preserves_credentials(self):
  wrapper=(root/'deployment/deploy-flowroute-gateway.sh').read_text()
  self.assertIn('play_name=flowroute-gateway-gui',wrapper)
  play=yaml.safe_load((root/'deploy/ansible/flowroute-gateway-gui.yml').read_text())[1]
  self.assertNotIn('vars_prompt',play)
  self.assertFalse(any('importFlowrouteTrunk' in str(t) for t in play['tasks']))
