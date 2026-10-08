import test from 'node:test';
import assert from 'node:assert/strict';
import {validNode,runnerAuthorized,handleServerFleetAdmin,handleServerFleetRunner} from './serverFleet.js';

const node={name:'switch-2',host:'192.0.2.20',role:'switch',sshUser:'deploy',sshPort:22,region:'east',capacity:100};
test('fleet rejects unsafe host inventory and accepts reviewed IPv4',()=>{
  assert.equal(validNode(node),true);
  for(const host of ['127.0.0.1','169.254.169.254','100.100.100.200','localhost','192.0.2.20;true'])
    assert.equal(validNode({...node,host}),false,host);
  assert.equal(validNode({...node,sshPort:0}),false);
});
test('runner identity requires full secret',()=>{
  const secret='a'.repeat(48);
  assert.equal(runnerAuthorized('Bearer '+secret,secret),true);
  assert.equal(runnerAuthorized('Bearer '+secret.slice(0,-1)+'b',secret),false);
  assert.equal(runnerAuthorized('Bearer short','short'),false);
});
test('fleet rejects non-super-admin before database access',async()=>{
  let result;
  await handleServerFleetAdmin({req:{method:'GET'},path:'/api/admin/servers',user:{role:'admin'},
    pool:null,send:(_res,code,body)=>{result={code,body};}});
  assert.equal(result.code,403);
  let runnerResult;
  await handleServerFleetRunner({req:{headers:{authorization:'Bearer bad'}},path:'/api/integrations/deployment/nodes',
    pool:null,send:(_res,code,body)=>{runnerResult={code,body};}});
  assert.equal(runnerResult.code,401);
});
