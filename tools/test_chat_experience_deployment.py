import pathlib,unittest,yaml
root=pathlib.Path(__file__).resolve().parents[1]
class ChatDeployment(unittest.TestCase):
 def test_uses_validated_database_backup_and_migration_workflow(self):
  plays=yaml.safe_load((root/'deploy/ansible/chat-experience.yml').read_text())
  self.assertEqual(plays[1]['ansible.builtin.import_playbook'],'messenger-features.yml')
  existing=(root/'deploy/ansible/messenger-features.yml').read_text()
  for key in ['messaging_head.stdout in','mysqldump','--hex-blob','migrate','api, web']:self.assertIn(key,existing)
 def test_bundle_check_is_same_origin_and_installer_copies_imports(self):
  text=(root/'deploy/ansible/chat-experience.yml').read_text()
  for key in ['chat-icon-composer','message-selected','chat-date-divider','chat-message-dialog','validate_certs: true']:self.assertIn(key,text)
  shell=(root/'deployment/deploy-chat-experience.sh').read_text()
  self.assertIn('messenger-features.yml',shell);self.assertIn('flock -n 9',shell)
if __name__=='__main__':unittest.main()
