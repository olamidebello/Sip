import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCluster} from './cluster.js';
const send=(res,status,body)=>({status,body});
test('only super admin may request bounded API replicas',async()=>{
  const req={method:'POST'},path='/api/admin/cluster/scale',user={id:'a',role:'admin'};
  const a=await handleCluster({req,res:{},path,user,pool:{},send,readJson:async()=>({apiReplicas:2})});
  assert.equal(a.status,403);
  const b=await handleCluster({req,res:{},path,user:{...user,role:'super_admin'},pool:{},send,readJson:async()=>({apiReplicas:0})});
  assert.equal(b.status,400);
});

test('capacity planning is visible but super admin alone may change it',async()=>{
  const req={method:'PUT'},path='/api/admin/cluster/capacity';
  const user={id:'actor',role:'admin'};
  const denied=await handleCluster({req,res:{},path,user,pool:{},send,
    readJson:async()=>({targetCalls:500,perNodeCalls:100,headroomPercent:30,minRegions:2})});
  assert.equal(denied.status,403);
  const invalid=await handleCluster({req,res:{},path,user:{...user,role:'super_admin'},
    pool:{},send,readJson:async()=>({targetCalls:0,perNodeCalls:100,headroomPercent:30,minRegions:2})});
  assert.equal(invalid.status,400);
});
test('capacity preview counts only fresh healthy enabled switch nodes',async()=>{
  const now=new Date();
  const pool={query:async(sql)=>{
    if(sql.includes('FROM cluster_capacity_policy'))return {rows:[{target_calls:500,
      per_node_calls:100,headroom_percent:30,min_regions:2,revision:1}]};
    if(sql.includes('FROM deployment_nodes'))return {rows:[
      {region:'east',capacity:100,status:'healthy',enabled:1,last_seen_at:now},
      {region:'west',capacity:150,status:'healthy',enabled:1,last_seen_at:now},
      {region:'east',capacity:999,status:'degraded',enabled:1,last_seen_at:now}]};
    if(sql.includes('FROM cluster_capacity_audit'))return {rows:[]};
    throw Error('Unexpected query');
  }};
  const result=await handleCluster({req:{method:'GET'},res:{},
    path:'/api/admin/cluster/capacity',user:{role:'admin'},pool,send});
  assert.equal(result.status,200);
  assert.equal(result.body.requiredCapacity,650);
  assert.equal(result.body.requiredNodes,7);
  assert.equal(result.body.observedCapacity,250);
  assert.equal(result.body.observedRegions,2);
  assert.equal(result.body.shortfall,400);
  assert.equal(result.body.editable,false);
});
