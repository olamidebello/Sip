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
