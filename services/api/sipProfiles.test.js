import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSipPolicy,validateSipPolicy,handleSipProfiles} from './sipProfiles.js';
const id='00000000-0000-4000-8000-000000000002';
const user={id,tenant_id:id,role:'user'};
function harness(rows={}){
  const calls=[];
  const pool={query:async(sql,params=[])=>{calls.push({sql,params});return {rows:rows[sql.match(/FROM ([a-z_]+)/)?.[1]]||[],rowCount:(rows[sql.match(/FROM ([a-z_]+)/)?.[1]]||[]).length};}};
  let result;
  const send=(res,status,body)=>{result={status,body};return result;};
  return {pool,calls,send,get result(){return result;}};
}
test('tenant baseline, group grants, and explicit user denial',()=>{
  assert.deepEqual(resolveSipPolicy({},[],{}),{view:true,add:false,edit:false,delete:false});
  assert.deepEqual(resolveSipPolicy({view:false,add:false},[{view:true,add:true}],{add:false}),{view:true,add:false,edit:false,delete:false});
  assert.equal(validateSipPolicy({view:true,add:true,edit:false,delete:false},true),true);
  assert.equal(validateSipPolicy({view:true},true),false);
  assert.equal(validateSipPolicy({all:true}),false);
  assert.equal(validateSipPolicy({delete:'true'}),false);
});
test('default users cannot create profiles; denied requests make no write',async()=>{
  const h=harness();
  await handleSipProfiles({req:{method:'POST'},res:{},path:'/api/sip-profiles',user,pool:h.pool,send:h.send,readJson:async()=>({})});
  assert.equal(h.result.status,403);
  assert.equal(h.calls.some(call=>/^INSERT/.test(call.sql)),false);
});
test('admin cannot edit tenant SIP policy',async()=>{
  const h=harness();
  await handleSipProfiles({req:{method:'PUT'},res:{},path:'/api/admin/sip-profile-policy/tenant',user:{...user,role:'admin'},pool:h.pool,send:h.send,readJson:async()=>({}),url:new URL('https://example.com')});
  assert.equal(h.result.status,403);
});
test('super admin rejects user grant for another tenant',async()=>{
  const h=harness({tenants:[{id,name:'A'}]});
  await handleSipProfiles({req:{method:'PUT'},res:{},path:`/api/admin/sip-profile-policy/user/${id}`,user:{...user,role:'super_admin'},pool:h.pool,send:h.send,
    readJson:async()=>({tenantId:id,permissions:{view:true}}),url:new URL('https://example.com')});
  assert.equal(h.result.status,404);
  assert.equal(h.calls.some(call=>/^INSERT/.test(call.sql)),false);
});
