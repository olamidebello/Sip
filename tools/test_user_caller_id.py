import unittest,tempfile,shutil,subprocess
from pathlib import Path
from install_user_caller_id import integrate
class IntegrationTests(unittest.TestCase):
 def test_resolver_policies_and_idempotent_integration(self):
  root=Path(__file__).resolve().parents[1]
  with tempfile.TemporaryDirectory() as d:
   dest=Path(d)
   for name in ['services/api/callerIdentityPolicy.js','services/api/server.js','apps/web/src/main.js']:
    p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,p)
   self.assertEqual(integrate(dest),3);self.assertEqual(integrate(dest),0)
   p=dest/'services/api/callerIdentityPolicy.js';s=p.read_text();self.assertIn('override must match an assigned',s)
   self.assertLess(s.index("if(approval&&!Number(approval.authorized))"),s.index('const override=await'))
   subprocess.run(['node','--check',str(p)],check=True)
   shutil.copy2(root/'services/api/userCallerId.js',dest/'services/api/userCallerId.js')
   (dest/'services/api/outboundDids.js').write_text('export const loadPolicy=()=>({tenants:{}});export const assignedIdentity=()=>null;')
   (dest/'package.json').write_text('{"type":"module"}')
   check=dest/'check.mjs'
   check.write_text('''import assert from 'node:assert/strict';
import {resolveCallerIdentity} from './services/api/callerIdentityPolicy.js';
const opts={policyLoader:()=>({tenants:{}}),assigned:()=>null};
function db(strict,blocked=false,rental=null){return {query:async s=>({rows:s.includes('require_assigned_did')?[{require_assigned_did:strict}]:s.includes('managed_outbound')?(blocked?[{authorized:0}]:[]):s.includes('user_caller_id_overrides')?[{mode:'authorized',number_e164:'+12147489556'}]:s.includes('user_primary_did')?(rental?[{number_e164:rental}]:[]):[]})};}
assert.equal((await resolveCallerIdentity(db(false),'tenant','user',opts)).callerId,'+12147489556');
await assert.rejects(resolveCallerIdentity(db(true),'tenant','user',opts),/must match an assigned/);
assert.equal((await resolveCallerIdentity(db(true,false,'+12147489556'),'tenant','user',opts)).callerId,'+12147489556');
await assert.rejects(resolveCallerIdentity(db(false,true),'tenant','user',opts),/disabled/);
''')
   subprocess.run(['node',str(check)],check=True)

if __name__=='__main__':unittest.main()
