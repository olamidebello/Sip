import json,subprocess,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ExportTests(unittest.TestCase):
 def run_export(self,args,body=''):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);(p/'package.json').write_text('{"type":"module"}')
   (p/'voicemailExport.mjs').write_text((ROOT/'services/api/voicemailExport.mjs').read_text())
   (p/'db.js').write_text("import fs from 'node:fs'; const queries=[];export const createDatabase=()=>({query:async(sql,args)=>{queries.push({sql,args});return {rowCount:2,rows:[]};},end:async()=>fs.writeFileSync(new URL('./queries.json',import.meta.url),JSON.stringify(queries))});")
   (p/'voicemail.js').write_text("export const migrateVoicemail=async()=>{};export const provisionVoicemail=async db=>db.query('PROVISION_ACTIVE');")
   result=subprocess.run(['node',str(p/'voicemailExport.mjs'),*args],input=body,text=True,capture_output=True)
   return result,json.loads((p/'queries.json').read_text())
 def test_enable_only_disabled_active_user_mailboxes(self):
  r,q=self.run_export(['--enable-all']);self.assertEqual(r.returncode,0,r.stderr)
  self.assertEqual(json.loads(r.stdout),{'enabledExisting':2})
  self.assertEqual(q[0]['sql'],'PROVISION_ACTIVE');self.assertIn("u.status='active'",q[1]['sql']);self.assertIn("t.status='active'",q[1]['sql']);self.assertIn('m.enabled=false',q[1]['sql']);self.assertIn('m.revision=m.revision+1',q[1]['sql'])
 def test_restore_only_disabled_snapshot_with_unchanged_revision(self):
  box='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';r,q=self.run_export(['--restore-enabled'],json.dumps([{'mailbox_id':box,'revision':4,'enabled':0},{'mailbox_id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','revision':2,'enabled':1}]))
  self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(len(q),1);self.assertEqual(q[0]['args'],[box,5]);self.assertIn('revision=$2',q[0]['sql'])
 def test_invalid_restore_rejected_without_query(self):
  r,q=self.run_export(['--restore-enabled'],'[{"mailbox_id":"invalid","revision":1,"enabled":0}]');self.assertNotEqual(r.returncode,0);self.assertEqual(q,[])
if __name__=='__main__':unittest.main()

class GreetingTests(unittest.TestCase):
 def test_new_mailbox_gets_default_but_personal_greeting_and_messages_survive(self):
  import importlib.util,os
  spec=importlib.util.spec_from_file_location('sync',ROOT/'tools/voicemail-sync.py');sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
  row={'mailbox_id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tenant_id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','enabled':1}
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);sound=root/'default.wav';sound.write_bytes(b'RIFF0000WAVEdefault');spool=root/'spool'
   sync.ensure_default_greetings([row],sound,spool,os.getuid(),os.getgid())
   folder=spool/('tenant-'+row['tenant_id'])/row['mailbox_id'];greeting=folder/'unavail.wav'
   self.assertEqual(greeting.read_bytes(),sound.read_bytes());greeting.write_bytes(b'personal-recording');(folder/'INBOX').mkdir();message=folder/'INBOX/msg0000.wav';message.write_bytes(b'saved-message')
   sync.ensure_default_greetings([row],sound,spool,os.getuid(),os.getgid())
   self.assertEqual(greeting.read_bytes(),b'personal-recording');self.assertEqual(message.read_bytes(),b'saved-message')
