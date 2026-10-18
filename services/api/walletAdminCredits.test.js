import test from 'node:test';
import assert from 'node:assert/strict';
import {handleWalletAdminCredits,validateAdminCredit} from './walletAdminCredits.js';
const tenant='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',target='00000000-0000-4000-8000-000000000003',requestId='00000000-0000-4000-8000-000000000004';
const user={id:actor,tenant_id:tenant,role:'super_admin'},body={userId:target,confirmedEmail:'target@example.test',amountCents:600,reason:'Service credit',requestId};
const send=(_,status,body)=>({status,body});
function database(){const state={balance:125,credits:[],events:0,updates:0};let saved;const sqls=[];const db={release(){},query:async(sql,p=[])=>{sqls.push({sql,p});const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
 if(sql==='START TRANSACTION'){saved=structuredClone(state);return result();}if(sql==='COMMIT')return result();if(sql==='ROLLBACK'){Object.assign(state,saved);return result();}
 if(sql.startsWith('SELECT id,email FROM users'))return result([{id:target,email:'target@example.test'}]);
 if(sql.startsWith('SELECT CAST(id AS CHAR)'))return result(state.credits);
 if(sql.startsWith('SELECT balance_cents'))return result([{currency:'USD',balance_cents:state.balance}]);
 if(sql.startsWith('INSERT IGNORE INTO wallet_accounts'))return result([],1);
 if(sql.startsWith('INSERT INTO wallet_admin_credits')){state.credits.push({id:'1',user_id:p[2],amount_cents:p[4],reason:p[5],balance_after_cents:p[7]});return result([],1);}
 if(sql.startsWith('UPDATE wallet_accounts')){state.balance+=p[0];state.updates++;return result([],1);}
 if(sql.startsWith('INSERT INTO security_events')){state.events++;return result([],1);}throw Error(sql);
 }};return {state,db,sqls,pool:{connect:async()=>db}};}
const call=(d,b=body,who=user)=>handleWalletAdminCredits({req:{method:'POST'},path:'/api/admin/wallet-funding/credits',user:who,pool:d.pool,send,readJson:async()=>b});
test('manual credit requires super administrator and positive integer USD cents',async()=>{for(const role of ['user','admin'])assert.equal((await call({},body,{...user,role})).status,403);for(const amountCents of [-1,0,1.5,1000001])assert.throws(()=>validateAdminCredit({...body,amountCents}));assert.throws(()=>validateAdminCredit({...body,reason:' '}));});
test('manual credit, audit and balance commit together; exact retry returns original credit',async()=>{const d=database();const first=await call(d);assert.equal(first.status,201);assert.equal(first.body.balanceAfterCents,725);assert.equal(d.state.events,1);assert.equal(d.state.balance,725);assert.equal((await call(d)).body.duplicate,true);assert.equal(d.state.balance,725);assert.equal(d.state.updates,1);assert.equal(d.state.credits.length,1);assert.equal((await call(d,{...body,amountCents:700})).status,409);assert.equal(d.state.balance,725);});
test('wrong email and cross-tenant target cannot receive a credit',async()=>{const d=database();assert.equal((await call(d,{...body,confirmedEmail:'wrong@example.test'})).status,409);assert.equal(d.state.updates,0);const original=d.db.query;d.db.query=async(sql,p)=>sql.startsWith('SELECT id,email FROM users')?{rows:[]}:original(sql,p);assert.equal((await call(d)).status,409);assert.equal(d.state.credits.length,0);assert.deepEqual(d.sqls.find(x=>x.sql.startsWith('SELECT id,email')).p,[target,tenant]);});
test('failed wallet write rolls back the credit ledger and audit',async()=>{const d=database(),query=d.db.query;d.db.query=async(sql,p)=>{if(sql.startsWith('UPDATE wallet_accounts'))throw Error('database unavailable');return query(sql,p);};await assert.rejects(call(d));assert.equal(d.state.balance,125);assert.equal(d.state.credits.length,0);assert.equal(d.state.events,0);});
test('manual credit history and user search are tenant-scoped',async()=>{const calls=[],pool={query:async(sql,p)=>{calls.push({sql,p});return {rows:[]};}};for(const path of ['/api/admin/wallet-funding/users','/api/admin/wallet-funding/credits'])assert.equal((await handleWalletAdminCredits({req:{method:'GET',url:path},path,user,pool,send})).status,200);assert.ok(calls.every(c=>c.p[0]===tenant));assert.match(calls[0].sql,/u.tenant_id=\$1/);assert.match(calls[1].sql,/c.tenant_id=\$1/);});
