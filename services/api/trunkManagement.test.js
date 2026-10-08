import test from 'node:test';
import assert from 'node:assert/strict';
import {handleTrunks} from './trunkManagement.js';
const id='11111111-1111-4111-8111-111111111111';
const user={id:'22222222-2222-4222-8222-222222222222',tenant_id:'33333333-3333-4333-8333-333333333333'};
async function call(path,method,body,pool){let result;await handleTrunks({req:{method},res:{},path,user,pool,readJson:async()=>body,send:(res,status,data)=>{result={status,data};}});return result;}
test('trunk edits require a matching revision and block active carrier links',async()=>{
  const seen=[];const db={query:async(sql,args)=>{seen.push(sql);if(sql.startsWith('SELECT id,name,host'))return {rows:[{id,name:'A',host:'sip.example.com',port:5061,transport:'tls',priority:100,enabled:false,revision:2}]};if(sql.startsWith('SELECT (SELECT COUNT'))return {rows:[{rates:0,carriers:1}]};if(sql.includes("status='active'"))return {rowCount:1};return {rowCount:1};},release(){}};
  const pool={connect:async()=>db};const body={name:'B',host:'new.example.com',port:5061,transport:'tls',priority:100,revision:2};
  assert.equal((await call(`/api/pbx/trunks/${id}`,'PUT',{...body,revision:1},pool)).status,409);
  assert.equal((await call(`/api/pbx/trunks/${id}`,'PUT',body,pool)).status,409);
  assert.equal(seen.filter(s=>s==='ROLLBACK').length,2);
  assert.equal(seen.some(s=>s.startsWith('UPDATE pbx_trunks')),false);
});
test('batch rejects duplicate ids before opening a transaction',async()=>{
  const pool={connect:async()=>{throw Error('unexpected transaction')}};
  const r=await call('/api/pbx/trunks/batch','PUT',{enabled:true,trunks:[{id,revision:1},{id,revision:1}]},pool);
  assert.equal(r.status,400);
});
test('trunk list is restricted to selected tenant',async()=>{
  let params;const pool={query:async(sql,args)=>{params=args;return {rows:[]}}};
  assert.equal((await call('/api/pbx/trunks','GET',null,pool)).status,200);
  assert.deepEqual(params,[user.tenant_id]);
});
