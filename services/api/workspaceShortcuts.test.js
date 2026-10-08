import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWorkspaceShortcuts} from './workspaceShortcuts.js';
const send=(_res,code,body)=>({code,body});
test('quick links are scoped to user and tenant and reject hidden admin targets',async()=>{
  const calls=[],user={id:'u1',tenant_id:'t1',role:'user',features:{}};
  const pool={query:async(sql,params)=>{calls.push({sql,params});return sql.includes('fleet_access_grants')?{rows:[]}:{rows:[{targets:'["dashboard","admin"]',last_target:'admin'}]};}};
  const read=await handleWorkspaceShortcuts({req:{method:'GET'},res:{},path:'/api/workspace/shortcuts',user,pool,send});
  assert.deepEqual(read.body.targets,['dashboard']);assert.equal(read.body.lastTarget,null);
  assert.deepEqual(calls.at(-1).params,['u1','t1']);
  const write=await handleWorkspaceShortcuts({req:{method:'PUT'},res:{},path:'/api/workspace/shortcuts',user,pool,send,
    readJson:async()=>({targets:['admin']})});
  assert.equal(write.code,400);
});
