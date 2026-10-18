import test from 'node:test';
import assert from 'node:assert/strict';
import {managedIdentity,validateProfile,handleSuperAdminControl} from './superAdminControl.js';
const tenant='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const send=(_,code,body)=>({code,body});
test('non-super-admin callers are denied before database access',async()=>{
 const r=await handleSuperAdminControl({user:{role:'admin'},send});assert.equal(r.code,403);
});
test('caller identity is tenant scoped and explicit denial blocks file fallback',async()=>{
 let args;const db={query:async(sql,a)=>{args=a;return {rows:[{authorized:0,number_e164:'+12147489556'}]};}};
 await assert.rejects(()=>managedIdentity(db,tenant,id),/disabled/);assert.deepEqual(args,[id,tenant]);
 db.query=async()=>({rows:[]});assert.equal(await managedIdentity(db,tenant,id),null);
 db.query=async()=>({rows:[{authorized:1,number_e164:'+12147489556'}]});assert.deepEqual(await managedIdentity(db,tenant,id),{callerId:'+12147489556',provider:'flowroute'});
});
test('profile requires real complete input and rejects extra privileged fields',()=>{
 const b={displayName:'User',phone:'+12147489556',address1:'1 Main',address2:'',city:'Dallas',region:'TX',postalCode:'75001',country:'US'};
 assert.equal(validateProfile(b),b);assert.throws(()=>validateProfile({...b,address1:''}));assert.throws(()=>validateProfile({...b,role:'super_admin'}));
});
test('cross-tenant profile mutation rolls back with no updates',async()=>{
 const calls=[];const db={release(){},query:async(sql,a)=>{calls.push([sql,a]);return {rows:[]};}};
 const b={displayName:'User',phone:'+12147489556',address1:'1 Main',address2:'',city:'Dallas',region:'TX',postalCode:'75001',country:'US'};
 const r=await handleSuperAdminControl({req:{method:'PUT'},path:'/api/admin/platform-control/users/'+id+'/profile',user:{role:'super_admin',tenant_id:tenant},pool:{connect:async()=>db},readJson:async()=>b,send});
 assert.equal(r.code,404);assert.ok(calls.some(([sql])=>sql==='ROLLBACK'));assert.ok(!calls.some(([sql])=>sql.startsWith('UPDATE')));
 assert.deepEqual(calls[1][1],[id,tenant]);
});
test('allowance cannot be edited while calls are unsettled',async()=>{
 const writes=[];const db={release(){},query:async(sql)=>{writes.push(sql);if(sql.startsWith('SELECT id,status'))return {rows:[{id,status:'active'}]};if(sql.includes('FROM pstn_calls'))return {rows:[{}],rowCount:1};return {rows:[]};}};
 const r=await handleSuperAdminControl({req:{method:'PUT'},path:'/api/admin/platform-control/users/'+id+'/allowance',user:{role:'super_admin',tenant_id:tenant},pool:{connect:async()=>db},readJson:async()=>({remainingSeconds:600,reason:'Adjustment'}),send});
 assert.equal(r.code,409);assert.ok(!writes.some(s=>s.startsWith('INSERT INTO calling_trial')));
});
