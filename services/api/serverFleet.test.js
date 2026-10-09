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

test('runner Kamailio report validates service states and bound switch node',async()=>{
  const secret='z'.repeat(48);
  process.env.DEPLOY_RUNNER_TOKEN=secret;
  const statements=[];
  const pool={query:async(sql,args)=>{
    statements.push([sql,args]);
    if(sql.includes('SELECT id FROM deployment_nodes'))return {rows:[{id:'node'}],rowCount:1};
    if(sql.includes('INSERT INTO kamailio_node_checks'))return {rows:[],rowCount:1};
    throw Error('Unexpected query');
  }};
  const send=(_res,status,body)=>({status,body});
  const base={req:{method:'POST',headers:{authorization:'Bearer '+secret}},
    res:{},path:'/api/integrations/deployment/kamailio-check',pool,send};
  const valid={nodeId:'11111111-1111-4111-8111-111111111111',
    signalingStatus:'inactive',mediaStatus:'inactive',version:'5.6.3',latencyMs:10};
  const bad=await handleServerFleetRunner({...base,readJson:async()=>({...valid,signalingStatus:'magic'})});
  assert.equal(bad.status,400);
  assert.equal(statements.length,0);
  const good=await handleServerFleetRunner({...base,readJson:async()=>valid});
  assert.equal(good.status,200);
  assert.equal(statements.length,2);
  assert.equal(statements[1][1][2],'inactive');
});

test('Kamailio node configuration rejects unauthorized and invalid changes before writing',async()=>{
  const path='/api/admin/servers/11111111-1111-4111-8111-111111111111/kamailio-config';
  const send=(_res,status,body)=>({status,body});
  const pool={query:async()=>{throw Error('Unexpected query');},connect:async()=>{throw Error('Unexpected connection');}};
  const req={method:'PUT'};
  const denied=await handleServerFleetAdmin({req,res:{},path,user:{role:'admin'},pool,send,
    readJson:async()=>({})});
  assert.equal(denied.status,403);
  const invalid=await handleServerFleetAdmin({req,res:{},path,user:{role:'super_admin'},pool,send,
    readJson:async()=>({sipDomain:'bad/domain',maxConcurrentCalls:100,expectedRevision:0})});
  assert.equal(invalid.status,400);
});
