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

test('Flowroute auto setup stages the selected PoP and leaves traffic disabled',async()=>{
  const calls=[];
  const pool={
    connect:async()=>({query:async(sql,params)=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT id FROM pbx_trunks')) return {rowCount:0,rows:[]};
      return {rowCount:1,rows:[]};
    },release(){}})
  };
  const result=await handleCarrierProviders({req:{method:'POST'},
    path:'/api/admin/carriers/flowroute/auto-provision',
    user:{id:'user-1',role:'super_admin',tenant_id:'tenant-1'},pool,
    readJson:async()=>({pop:'US-East-VA',maxConcurrentCalls:100,routingMode:'priority'}),
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,200);
  assert.equal(result.body.host,'us-east-va.sip.flowroute.com');
  assert.equal(result.body.status,'draft');
  assert.match(calls.find(x=>x.sql.startsWith('INSERT INTO pbx_trunks')).sql,/enabled\) VALUES.*FALSE/);
  assert.ok(calls.some(x=>x.sql==='COMMIT'));
});

test('super admin can register a future carrier and duplicate IDs are rejected',async()=>{
  const calls=[];
  const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}};
  const base={req:{method:'POST'},path:'/api/admin/carriers/catalog',
    user:{id:'user-1',role:'super_admin',tenant_id:'tenant-1'},pool,
    send:(_res,status,body)=>({status,body})};
  const added=await handleCarrierProviders({...base,readJson:async()=>({provider:'example-voice',displayName:'Example Voice'})});
  assert.equal(added.status,201);
  assert.deepEqual(calls[0].params,['tenant-1','example-voice','Example Voice','user-1']);
  const invalid=await handleCarrierProviders({...base,readJson:async()=>({provider:'flowroute',displayName:'Duplicate'})});
  assert.equal(invalid.status,400);
});

test('tenant administrator cannot register a future carrier',async()=>{
  const result=await handleCarrierProviders({req:{method:'POST'},path:'/api/admin/carriers/catalog',
    user:{role:'admin',tenant_id:'tenant-1'},pool:{query:()=>{throw Error('must not query');}},
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,403);
});
