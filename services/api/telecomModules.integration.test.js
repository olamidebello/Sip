import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createDatabase} from './db.js';import {migrate} from './migrate.js';import {migratePstnBilling} from './pstnBilling.js';import {handleTelecomPolicies,loadTelecomPolicies} from './telecomPolicies.js';import {handleTelecomRefills} from './telecomRefills.js';import {countryReport} from './telecomAnalytics.js';import {enqueueDueReport} from './telecomReports.js';
test('MySQL policies, country analytics and concurrent refills use the installed schema',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),other=randomUUID(),actor=randomUUID(),recipient=randomUUID(),user={id:actor,tenant_id:tenant,role:'super_admin'},send=(_r,status,body)=>({status,body});
 try{
  await migrate(pool);await migratePstnBilling(pool);
  for(const id of [tenant,other])await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[id,'Telecom test',id]);
  for(const id of [actor,recipient])await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,'Telecom test',$3,'test','test','super_admin','active')",[id,tenant,id+'@example.test']);
  await pool.query("INSERT INTO wallet_accounts(user_id,tenant_id,currency,balance_cents) VALUES($1,$2,'USD',0)",[recipient,tenant]);
  const save=(kind,data)=>handleTelecomPolicies({req:{method:'POST'},path:'/api/admin/telecom/policies/'+kind,user,pool,send,readJson:async()=>({enabled:true,data})});
  assert.equal((await save('normalization',{prefix:'00',replacement:''})).status,201);
  assert.equal((await save('international-credit',{userId:recipient,homePrefix:'1',limitCents:1000})).status,201);
  assert.equal((await save('country-prefixes',{prefix:'234',country:'Nigeria'})).status,201);
  assert.equal((await loadTelecomPolicies(pool,tenant)).length,3);assert.equal((await loadTelecomPolicies(pool,other)).length,0);
  const report=await countryReport(pool,tenant,{from:'2026-01-01',until:'2027-01-01'});assert.deepEqual(report.rows,[]);
  const requestId=randomUUID(),body={requestId,userId:recipient,amountCents:1000,reference:'Verified test funding'},call=()=>handleTelecomRefills({req:{method:'POST'},path:'/api/admin/telecom/refills',user,pool,send,readJson:async()=>body});
  const replies=await Promise.all([call(),call()]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,201]);
  assert.equal(Number((await pool.query('SELECT balance_cents FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2',[recipient,tenant])).rows[0].balance_cents),1000);
  // Validate scheduler SQL without creating a due job or sending mail.
  await enqueueDueReport(pool);
 }finally{
  await pool.query('DELETE FROM telecom_refills WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM telecom_policies WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM security_events WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM wallet_accounts WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM users WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM tenants WHERE id IN ($1,$2)',[tenant,other]);await pool.end();
 }
});
