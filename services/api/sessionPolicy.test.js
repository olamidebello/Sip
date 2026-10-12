import test from 'node:test';
import assert from 'node:assert/strict';
import {createLimitedSession,validateSessionLimit,handleSessionPolicy} from './sessionPolicy.js';
import {tokenHash} from './security.js';
test('default session limit retains new login and deletes previous sessions atomically',async()=>{
  const calls=[];const token='new-token',hash=tokenHash(token);let released=0;
  const db={query:async(sql,params)=>{calls.push({sql,params});if(sql.startsWith('SELECT id FROM users'))return {rowCount:1,rows:[{id:'user'}]};if(sql.startsWith('SELECT max_sessions'))return {rowCount:0,rows:[]};if(sql.startsWith('SELECT token_hash'))return {rows:[{token_hash:hash},{token_hash:'old-a'},{token_hash:'old-b'}]};return {rowCount:1,rows:[]};},release(){released++;}};
  const revoked=await createLimitedSession({connect:async()=>db},{userId:'user',token});
  assert.deepEqual(revoked,['old-a','old-b']);assert.equal(calls[1].sql.includes('FOR UPDATE'),true);assert.equal(calls.at(-1).sql,'COMMIT');assert.equal(released,1);
  assert.equal(calls.filter(c=>c.sql.startsWith('DELETE FROM sessions WHERE user_id=$1 AND token_hash')).length,2);
});
test('custom limit preserves newest allowed sessions and invalid limits fail',async()=>{
  const calls=[];const db={query:async(sql,params)=>{calls.push({sql,params});if(sql.startsWith('SELECT id FROM users'))return {rowCount:1,rows:[{}]};if(sql.startsWith('SELECT max_sessions'))return {rows:[{max_sessions:2}]};if(sql.startsWith('SELECT token_hash'))return {rows:[{token_hash:'new'},{token_hash:'recent'},{token_hash:'old'}]};return {rows:[],rowCount:1};},release(){}};
  assert.deepEqual(await createLimitedSession({connect:async()=>db},{userId:'u',token:'token',authMethod:'passkey'}),['old']);
  for(const bad of [0,21,1.5,'2',null])assert.throws(()=>validateSessionLimit(bad));
});
test('tenant admins cannot change session policy; super admin cannot edit another tenant',async()=>{
  const base={req:{method:'PUT'},res:{},path:'/api/admin/user-sessions/00000000-0000-4000-8000-000000000001',send:(_res,status,body)=>({status,body}),readJson:async()=>({maxSessions:2})};
  assert.equal((await handleSessionPolicy({...base,user:{role:'admin'},pool:{}})).status,403);
  let writes=0;const db={query:async sql=>{if(sql.startsWith('INSERT'))writes++;return {rows:[],rowCount:0};},release(){}};
  assert.equal((await handleSessionPolicy({...base,user:{role:'super_admin',tenant_id:'other'},pool:{connect:async()=>db}})).status,404);assert.equal(writes,0);
});
