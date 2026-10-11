import test from 'node:test';
import assert from 'node:assert/strict';
import {validPeriod,handleSettlements} from './settlements.js';

test('settlement periods reject impossible dates and spans over a year',()=>{
  assert.equal(validPeriod('2026-01-01','2026-01-31'),true);
  assert.equal(validPeriod('2026-02-30','2026-03-01'),false);
  assert.equal(validPeriod('2026-03-01','2026-02-01'),false);
  assert.equal(validPeriod('2025-01-01','2026-12-31'),false);
});

test('tenant scoped settlement list and admin gate',async()=>{
  const queries=[];let response;
  const pool={query:async(sql,args)=>{queries.push([sql,args]);return {rows:[]};}};
  const send=(_res,status,body)=>{response={status,body};};
  await handleSettlements({req:{method:'GET'},res:{},path:'/api/admin/settlements',user:{role:'user'},pool,send});
  assert.equal(response.status,403);assert.equal(queries.length,0);
  await handleSettlements({req:{method:'GET'},res:{},path:'/api/admin/settlements',user:{role:'admin',tenant_id:'tenant-a'},pool,send});
  assert.equal(response.status,200);assert.equal(queries.length,2);
  assert.ok(queries.every(([,args])=>args[0]==='tenant-a'));
});

test('review refuses self approval and amount variance',async()=>{
  for(const item of [{created_by:'actor-b',expected_cents:100,carrier_cents:101},
    {created_by:'actor-a',expected_cents:100,carrier_cents:100}]){
    let response;const db={query:async(sql)=>sql.startsWith('SELECT status')?{rowCount:1,rows:[{status:'in_review',...item}]}:{rowCount:0,rows:[]},release(){}};
    const pool={connect:async()=>db},send=(_res,status,body)=>{response={status,body};};
    await handleSettlements({req:{method:'POST'},res:{},path:'/api/admin/settlements/0a000000-0000-4000-8000-000000000000/approve',
      user:{role:'super_admin',id:'actor-a',tenant_id:'tenant-a'},pool,send,readJson:async()=>({})});
    assert.equal(response.status,409);
  }
});
