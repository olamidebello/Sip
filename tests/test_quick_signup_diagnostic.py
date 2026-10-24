from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
class Diagnostic(unittest.TestCase):
 def test_matching_pending_message_is_reported_without_private_data(self):
  source=(ROOT/'tools/diagnose-quick-signup.mjs').read_text()
  source=source.replace("import {defaultTenantId} from '/app/tenancy.js';", "const defaultTenantId='tenant';")
  source=source.replace("import {createDatabase} from '/app/db.js';", """const createDatabase=()=>({query:async(sql)=>{
if(!sql.startsWith('SELECT '))throw Error('Unexpected mutation');
if(sql.includes('FROM quick_signups'))return {rows:[{code_hash:createHash('sha256').update('0123456789ABCDEF').digest('hex'),state:'pending',expires_at:'2099-01-01'}]};
if(sql.includes('FROM flowroute_message_events'))return {rows:[{sender:'+15551234567',recipient:'+12109050290',body:'OLAMIDE 0123456789ABCDEF',tenant_id:'tenant',received_at:'2026-10-24'}]};
return {rows:[]};},end:async()=>{}});""")
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'check.mjs';p.write_text(source)
   r=subprocess.run(['node',str(p)],capture_output=True,text=True)
  self.assertEqual(r.returncode,0,r.stderr)
  self.assertIn('matched_still_pending=1',r.stdout)
  for secret in ['0123456789ABCDEF','15551234567','OLAMIDE','tenant']:
   if secret=='tenant':continue
   self.assertNotIn(secret,r.stdout)
if __name__=='__main__':unittest.main()
