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
    pool:{query:async()=>({rows:[]})},send:(_res,code,body)=>{result={code,body};}});
  assert.equal(result.code,403);
  let runnerResult;
  await handleServerFleetRunner({req:{headers:{authorization:'Bearer bad'}},path:'/api/integrations/deployment/nodes',
    pool:null,send:(_res,code,body)=>{runnerResult={code,body};}});
  assert.equal(runnerResult.code,401);
});
test('Operator setup rejects delegated deployment access and queues only for super-admin',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const send=(_res,code,body)=>({code,body});
 const base={req:{method:'POST'},path:`/api/admin/servers/${id}/jobs`,send,readJson:async()=>({action:'operator_setup'})};
 const delegated=await handleServerFleetAdmin({...base,user:{id:'admin',role:'admin'},pool:{query:async()=>({rows:[{access_level:'deploy'}]})}});
 assert.equal(delegated.code,403);
 const previous=process.env.DEPLOY_RUNNER_TOKEN;process.env.DEPLOY_RUNNER_TOKEN='t'.repeat(48);
 const writes=[];
 const db={release(){},query:async(sql,values)=>{if(sql.startsWith('SELECT id,role'))return {rows:[{id,role:'switch',enabled:true}]};if(sql.startsWith('SELECT id FROM deployment_jobs'))return {rows:[],rowCount:0};writes.push([sql,values]);return {rows:[],rowCount:1};}};
 try{
  const result=await handleServerFleetAdmin({...base,user:{id:'super',role:'super_admin'},pool:{connect:async()=>db}});
  assert.equal(result.code,202);assert.equal(result.body.status,'pending');
  assert.equal(writes.find(([sql])=>sql.startsWith('INSERT INTO deployment_jobs'))[1][2],'operator_setup');
 }finally{if(previous===undefined)delete process.env.DEPLOY_RUNNER_TOKEN;else process.env.DEPLOY_RUNNER_TOKEN=previous;}
});
