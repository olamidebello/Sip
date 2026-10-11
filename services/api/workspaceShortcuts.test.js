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
test('new navigation destinations can be saved without exposing privileged shortcuts',async()=>{
  const pool={query:async()=>({rows:[],rowCount:1})};
  const save=(role,targets,features={})=>handleWorkspaceShortcuts({req:{method:'PUT'},res:{},path:'/api/workspace/shortcuts',user:{id:'u1',tenant_id:'t1',role,features},pool,send,readJson:async()=>({targets})});
  assert.equal((await save('user',['activity-monitor','outbound-rates','product-store'],{billing:true})).code,200);
  assert.equal((await save('user',['provider-credentials-admin'])).code,400);
  assert.equal((await save('admin',['carrier-admin','passkey-policy-admin'])).code,200);
  assert.equal((await save('admin',['didww-admin'])).code,400);
  assert.equal((await save('super_admin',['provider-credentials-admin','didww-admin'])).code,200);
});
