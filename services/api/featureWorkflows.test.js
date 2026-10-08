import test from 'node:test';
import assert from 'node:assert/strict';
import {validWorkItem} from './workPlanner.js';
import {effectivePasskeyMode} from './passkeyPolicy.js';
const future=new Date(Date.now()+86400000).toISOString();
test('planner rejects expired and invalid event intervals',()=>{
  const base={kind:'event',title:'Maintenance',description:'Window',status:'scheduled',startAt:future,endAt:new Date(Date.now()+90000000).toISOString()};
  assert.equal(validWorkItem(base),true);
  assert.equal(validWorkItem({...base,endAt:future}),false);
  assert.equal(validWorkItem({...base,startAt:new Date(0).toISOString()}),false);
});
test('user override precedes required group and tenant policy',async()=>{
  const pool={query:async(sql)=>({rows:sql.includes('user_passkey_policy')?[{mode:'optional'}]:[{mode:'required'}]})};
  assert.equal(await effectivePasskeyMode(pool,{id:'u',tenant_id:'t',auth_source:'local'}),'optional');
  assert.equal(await effectivePasskeyMode(pool,{id:'u',tenant_id:'t',auth_source:'ldap'}),'optional');
});
