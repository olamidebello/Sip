import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileNextPayment,handlePaymentReconciliation} from './paymentReconciliation.js';
test('reconciliation worker serializes replicas and releases its connection',async()=>{
 let released=0;assert.equal(await reconcileNextPayment({connect:async()=>({query:async()=>({rows:[{acquired:0}]}),release(){released++;}})}),false);assert.equal(released,1);
});
test('reconciliation selects pending supported providers and persists retry before I/O',async()=>{
 const calls=[],query=async(sql,args)=>{calls.push({sql,args});if(sql.includes('GET_LOCK'))return {rows:[{acquired:1}]};if(sql.startsWith('SELECT p.*'))return {rows:[{id:'attempt',tenant_id:'tenant',provider:'paystack',created_at:new Date()}]};if(sql.includes('FROM store_gateways'))return {rows:[]};return {rows:[],rowCount:1};};
 assert.equal(await reconcileNextPayment({query,connect:async()=>({query,release(){}})}),true);
 const selected=calls.find(c=>c.sql.startsWith('SELECT p.*'));assert.match(selected.sql,/provider IN \('paystack','flutterwave'\)/);assert.match(selected.sql,/r.next_at<=UTC_TIMESTAMP/);assert.ok(calls.findIndex(c=>c.sql.startsWith('INSERT INTO payment_reconciliation'))<calls.findIndex(c=>c.sql.includes('FROM store_gateways')));assert.ok(calls.at(-1).sql.includes('RELEASE_LOCK'));
});
test('reconciliation history is tenant scoped and excludes merchant secrets',async()=>{
 let sql,args;const r=await handlePaymentReconciliation({req:{method:'GET'},user:{role:'admin',tenant_id:'own'},pool:{query:async(q,a)=>{sql=q;args=a;return {rows:[]};}},send:(_r,status,body)=>({status,body})});assert.equal(r.status,200);assert.deepEqual(args,['own']);assert.doesNotMatch(sql,/ciphertext|secret_key/);
});
