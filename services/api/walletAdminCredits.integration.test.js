import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createDatabase} from './db.js';import {migrate} from './migrate.js';import {migratePstnBilling} from './pstnBilling.js';
import {handleWalletAdminCredits} from './walletAdminCredits.js';import {handleLocationHistory,recordLocationSnapshot} from './locationHistory.js';
test('MySQL manual credits and history preserve balances, audit and self scope',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),actor=randomUUID(),target=randomUUID(),requestId=randomUUID(),send=(_,status,body)=>({status,body});
 const admin={id:actor,tenant_id:tenant,role:'super_admin'},user={id:target,tenant_id:tenant,role:'user'};
 try{await migrate(pool);await migratePstnBilling(pool);await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[tenant,'Manual/history integration',tenant]);for(const id of [actor,target])await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,'Test',$3,'test','test','user','active')",[id,tenant,id+'@example.test']);
  const call=()=>handleWalletAdminCredits({req:{method:'POST'},path:'/api/admin/wallet-funding/credits',user:admin,pool,send,readJson:async()=>({userId:target,confirmedEmail:target+'@example.test',amountCents:600,reason:'Integration credit',requestId})});
  // Concurrent duplicate submissions must both resolve to a single ledger entry.
  const results=await Promise.all([call(),call()]);assert.ok(results.every(r=>r.status===200||r.status===201));assert.equal(Number((await pool.query('SELECT balance_cents FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2',[target,tenant])).rows[0].balance_cents),600);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM wallet_admin_credits WHERE tenant_id=$1',[tenant])).rows[0].n),1);
  await recordLocationSnapshot(pool,user,{latitude:32.8,longitude:-96.8,accuracy:20},{source:'manual_gps',sessionHash:'integration'});
  const report=await handleLocationHistory({req:{method:'GET',url:'/api/account/location-history'},path:'/api/account/location-history',user,pool,send});assert.equal(report.body.history.length,1);assert.equal(report.body.history[0].user_id,target);
  const empty=await handleLocationHistory({req:{method:'GET',url:'/api/account/location-history'},path:'/api/account/location-history',user:{...user,id:actor},pool,send});assert.equal(empty.body.history.length,0);
 }finally{for(const table of ['user_location_history','location_history_policy','wallet_admin_credits','wallet_accounts','security_events'])await pool.query('DELETE FROM '+table+' WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM users WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM tenants WHERE id=$1',[tenant]);await pool.end();}
});
