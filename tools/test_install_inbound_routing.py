import unittest,subprocess,json
from pathlib import Path
ns={}
source=Path(__file__).with_name('install-inbound-routing.py').read_text()
exec(compile(source[:source.index("edit('services/api/server.js'")],'<installer>','exec'),ns)
class IntegrationTests(unittest.TestCase):
 def fixture(self,local):
  lookup="const owner = !match[2].endsWith('-dlr') ? await didOwner(pool,tenant(),event.recipient) : null;" if local else "const owner = !match[2].endsWith('-dlr') ? await pool.query('SELECT user_id FROM flowroute_sms_numbers WHERE number_e164=$1 AND tenant_id=$2 AND enabled=TRUE',[event.recipient,tenant()]) : {rows:[]};"
  owner='owner?.user_id' if local else 'owner.rows[0]?.user_id'
  return '''async function deliver(pool,match,event){
    LOOKUP
    const result = await pool.query(`INSERT IGNORE INTO flowroute_message_events
      (owner_id,provider_event_id) VALUES($1,$2)`,[OWNER || null,event.id]);
    if(match[2]==='sms') await queueSubscriberSms(pool,{tenantId:tenant(),number:'+'+event.recipient.replace(/^\\+/,''),senderNumber:'+'+event.sender.replace(/^\\+/,''),body:event.body,eventKey:`flowroute/${event.id}`});
    return result;
}'''.replace('LOOKUP',lookup).replace('OWNER',owner)
 def exercise(self,local):
  original=self.fixture(local);patched=ns['messages'](original)
  self.assertEqual(ns['messages'](patched),patched)
  if local:self.assertIn('await didOwner(pool,tenant(),event.recipient)',patched)
  code=patched.replace("import {resolveInboundRoute} from './inboundRouting.js';",'')
  runner='''const assert=require('node:assert/strict');
let selected,lookups=0,copies=[],writes=[];
const tenant=()=> 'tenant';
const didOwner=async()=>{lookups++;return {user_id:'owner'};};
const resolveInboundRoute=async(_,r)=>{assert.equal(r.ownerId,'owner');assert.equal(r.tenantId,'tenant');assert.equal(r.number,'+19452205026');return {userId:selected};};
const queueSubscriberSms=async(_,r)=>copies.push(r);
const pool={query:async(s,p)=>{if(s.startsWith('SELECT')){lookups++;return {rows:[{user_id:'owner'}]};}writes.push(p);return {rowCount:1};}};
CODE
(async()=>{for(const target of ['owner','other',null]){selected=target;copies=[];writes=[];await deliver(pool,[null,null,'sms'],{id:'event',recipient:'19452205026',sender:'+12149918553',body:'hello'});assert.equal(writes[0][0],target);assert.equal(copies.length,target?1:0);if(target)assert.equal(copies[0].routedUserId,target);}
selected='other';copies=[];writes=[];await deliver(pool,[null,null,'sms-dlr'],{id:'receipt',recipient:'+19452205026'});assert.equal(writes[0][0],null);assert.equal(copies.length,0);assert.equal(lookups,3);
})().catch(e=>{console.error(e);process.exitCode=1;});'''.replace('CODE',code)
  subprocess.run(['node','-e',runner],check=True,capture_output=True,text=True)
 def test_local_did_owner_delivery_and_block(self):self.exercise(True)
 def test_original_number_query_delivery_and_block(self):self.exercise(False)
 def test_unknown_layout_rejected_without_pending_source_writes(self):
  with self.assertRaises(SystemExit):ns['messages'](self.fixture(True).replace('await didOwner(pool,tenant(),event.recipient)','await unknownLookup()'))
  self.assertEqual(ns['changes'],[])
if __name__=='__main__':unittest.main()
