import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createDatabase} from './db.js';import {handleAccountRanges} from './accountRanges.js';
test('MySQL account allocation is concurrent, idempotent and tenant isolated',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),other=randomUUID(),actor=randomUUID(),first=randomUUID(),second=randomUUID(),foreign=randomUUID();const user={id:actor,tenant_id:tenant,role:'super_admin'},send=(_r,code,body)=>({code,body});
 const call=(method,path,body)=>handleAccountRanges({req:{method},path,user,pool,send,readJson:async()=>body});
 try{
  for(const id of [tenant,other])await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[id,'Range test',id]);
  for(const [id,t] of [[actor,tenant],[first,tenant],[second,tenant],[foreign,other]])await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,$3,$4,'test','test','user','active')",[id,t,'Range user',id+'@example.test']);
  assert.equal((await call('PUT','/api/admin/account-range',{start:100,end:101,enabled:true,revision:0})).code,200);
  const results=await Promise.all([first,second].map(userId=>call('POST','/api/admin/account-range/assign',{userId})));assert.deepEqual(results.map(r=>r.body.accountNumber).sort(),[100,101]);
  assert.equal((await call('POST','/api/admin/account-range/assign',{userId:foreign})).code,404);
  const again=await call('POST','/api/admin/account-range/assign',{userId:first});assert.equal(again.body.existing,true);assert.equal(again.body.accountNumber,results[0].body.accountNumber);
  const exhausted=await call('POST','/api/admin/account-range/assign',{userId:actor});assert.equal(exhausted.code,409);
  const state=await call('GET','/api/admin/account-range');assert.equal(state.body.config.next,102);assert.equal(state.body.config.revision,3);
  assert.equal((await call('PUT','/api/admin/account-range',{start:101,end:104,enabled:true,revision:3})).code,409);
  assert.equal((await call('PUT','/api/admin/account-range',{start:100,end:104,enabled:true,revision:1})).code,409);
 }finally{
  await pool.query('DELETE FROM user_account_numbers WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM tenant_account_ranges WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM security_events WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM users WHERE tenant_id IN ($1,$2)',[tenant,other]);await pool.query('DELETE FROM tenants WHERE id IN ($1,$2)',[tenant,other]);await pool.end();
 }
});
