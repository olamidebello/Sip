import test from 'node:test';
import assert from 'node:assert/strict';
import { carrierActive, handleCarrierProviders } from './carrierProviders.js';

test('carrier inventory stays blocked without an acknowledged tenant profile',async()=>{
  let last;
  const pool={query:async(sql,params)=>{last={sql,params};return {rowCount:0,rows:[]};}};
  assert.equal(await carrierActive(pool,'tenant-1','flowroute'),false);
  assert.deepEqual(last.params,['tenant-1','flowroute']);
  assert.match(last.sql,/status='active'/);
});

test('a user cannot manage carrier provisioning',async()=>{
  const result=await handleCarrierProviders({req:{method:'GET'},path:'/api/admin/carriers',
    user:{role:'user',tenant_id:'tenant-1'},pool:{query:()=>{throw Error('must not query');}},
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,403);
});
