import test from 'node:test';
import assert from 'node:assert/strict';
import {adapterTargets,handleAdapterRegistry,commissionCarrier} from './adapterRegistry.js';

test('adapter registry exposes target keys without URLs or tokens',async()=>{
  const before=process.env.CARRIER_ADAPTER_TARGETS_JSON;
  process.env.CARRIER_ADAPTER_TARGETS_JSON=JSON.stringify({'us-east':{
    url:'https://adapter.example.com/provision',token:'x'.repeat(32)}});
  try{
    const result=await handleAdapterRegistry({req:{method:'GET'},
      path:'/api/admin/carrier-adapters',
      user:{role:'super_admin',tenant_id:'tenant-1'},
      pool:{query:async()=>({rowCount:0,rows:[]})},
      send:(_res,status,body)=>({status,body})});
    assert.equal(result.status,200);
    assert.ok(result.body.targets.includes('us-east'));
    assert.ok(!JSON.stringify(result.body).includes('adapter.example.com'));
    assert.ok(!JSON.stringify(result.body).includes('x'.repeat(32)));
  }finally{
    if(before===undefined)delete process.env.CARRIER_ADAPTER_TARGETS_JSON;
    else process.env.CARRIER_ADAPTER_TARGETS_JSON=before;
  }
});

test('healthy adapter acknowledges activation and pins the assignment',async()=>{
  const old={targets:process.env.CARRIER_ADAPTER_TARGETS_JSON,fetch:globalThis.fetch};
  process.env.CARRIER_ADAPTER_TARGETS_JSON=JSON.stringify({'us-east':{
    url:'https://adapter.example.com/provision',token:'x'.repeat(32)}});
  globalThis.fetch=async(_url,request)=>{
    assert.equal(JSON.parse(request.body).action,'activate');
    return new Response(JSON.stringify({status:'active'}),{status:200});
  };
  const calls=[];
  const node={id:'00000000-0000-4000-8000-000000000003',target_key:'us-east',enabled:1,health:'healthy'};
  const pool={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes('FROM carrier_adapter_nodes WHERE tenant_id='))return {rowCount:1,rows:[node]};
    return {rowCount:1,rows:[]};
  }};
  try{
    const result=await commissionCarrier(pool,{id:'user-1',tenant_id:'tenant-1'},'flowroute','activate',
      {trunkId:'trunk-1',maxConcurrentCalls:10,routingMode:'priority'});
    assert.equal(result.adapterId,node.id);
    assert.ok(calls.some(entry=>entry.sql.startsWith('INSERT INTO carrier_adapter_assignments')));
  }finally{
    globalThis.fetch=old.fetch;
    if(old.targets===undefined)delete process.env.CARRIER_ADAPTER_TARGETS_JSON;
    else process.env.CARRIER_ADAPTER_TARGETS_JSON=old.targets;
  }
});
