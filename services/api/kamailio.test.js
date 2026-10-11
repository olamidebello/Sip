import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,validPlan,validateReport,handleKamailioAdmin} from './kamailio.js';
const nodeId='00000000-0000-4000-8000-000000000001';
const report=()=>({schemaVersion:1,nodeId,host:'sip-1',configHash:'a'.repeat(64),checkedAt:new Date().toISOString(),
  configValid:true,serviceActive:true,rpcReachable:true,features:catalog.modules.map(m=>({id:m.id,installed:true,runtimeLoaded:true,status:'configured',testId:''}))});
test('plan rejects unknown IDs, duplicates and enable without install',()=>{
  const b={nodeId,profile:'production',modules:[{id:'registrar',install:true,enable:true}]};
  assert.equal(validPlan(b),true);
  assert.equal(validPlan({...b,modules:[...b.modules,...b.modules]}),false);
  assert.equal(validPlan({...b,modules:[{id:'shell',install:true,enable:true}]}),false);
  assert.equal(validPlan({...b,modules:[{id:'registrar',install:false,enable:true}]}),false);
  assert.equal(validPlan({...b,profile:'../../arbitrary'}),false);
});
test('installed files alone cannot grant configured or tested status',()=>{
  const b=report();assert.equal(validateReport(b).features.length,catalog.modules.length);
  b.serviceActive=false;assert.throws(()=>validateReport(b),RangeError);
  const c=report();c.features[0].status='tested';assert.throws(()=>validateReport(c),RangeError);
  c.features[0].testId='call-acceptance-01';assert.equal(validateReport(c).features[0].status,'tested');
});
test('expired or incomplete module evidence is rejected',()=>{
  const b=report();b.checkedAt=new Date(Date.now()-90000000).toISOString();assert.throws(()=>validateReport(b),RangeError);
  const c=report();c.features.pop();assert.throws(()=>validateReport(c),RangeError);
});
test('ordinary administrators cannot submit fleet plans',async()=>{
  let code;await handleKamailioAdmin({req:{method:'POST'},res:{},path:'/api/admin/kamailio/plans',user:{role:'admin'},pool:{query:()=>assert.fail('No DB access expected')},send:(_,status)=>{code=status;}});
  assert.equal(code,403);
});
