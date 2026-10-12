import test from 'node:test';import assert from 'node:assert/strict';
import {validateMoneyRequest,handleMoneyRequests} from './moneyRequests.js';
import {handleWallet} from './wallet.js';
const sender='00000000-0000-4000-8000-000000000001',recipient='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
const send=(_,status,body)=>({status,body}),user={id:sender,tenant_id:'tenant-a',features:{billing:true}};
test('requests reject fractional cents, oversized notes, self/unknown payer and malformed identifiers',async()=>{
 assert.throws(()=>validateMoneyRequest({payerEmail:'b@example.com',amountCents:1.1,idempotencyKey:id}));
 assert.throws(()=>validateMoneyRequest({payerEmail:'b@example.com',amountCents:100,idempotencyKey:id,note:'x'.repeat(201)}));
 const result=await handleMoneyRequests({req:{method:'POST'},path:'/api/wallet/requests',user,send,readJson:async()=>({payerEmail:'b@example.com',amountCents:100,idempotencyKey:id}),pool:{query:async(sql,args)=>{assert.equal(args[1],'tenant-a');return {rows:[{id:sender}]};}}});assert.equal(result.status,404);
});
test('only the owning requester can cancel and only the intended payer can decline',async()=>{
 for(const action of ['cancel','decline']){
  const result=await handleMoneyRequests({req:{method:'PUT'},path:'/api/wallet/requests/'+id,user,send,readJson:async()=>({action}),pool:{query:async(sql,args)=>{assert.match(sql,/tenant_id=\$3/);assert.match(sql,action==='cancel'?/requester_id=\$4/:/payer_id=\$4/);assert.match(sql,/status='pending'/);assert.deepEqual(args.slice(1),[id,'tenant-a',sender]);return {rowCount:0};}}});assert.equal(result.status,409);
 }
});
test('mismatched request cannot debit wallet and always releases its transaction',async()=>{
 const statements=[];let released=false;
 const db={release(){released=true;},query:async(sql,args)=>{statements.push(sql);if(sql.startsWith('SELECT balance_cents'))return {rows:[{balance_cents:1000}]};if(sql.startsWith('SELECT requester_id'))return {rows:[{requester_id:recipient,payer_id:sender,amount_cents:500,status:'pending'}]};return {rows:[],rowCount:0};}};
 const result=await handleWallet({req:{method:'POST'},path:'/api/wallet/transfers',user,send,readJson:async()=>({recipientEmail:'b@example.com',amountCents:100,idempotencyKey:id,requestId:id}),pool:{query:async()=>({rows:[{id:recipient}],rowCount:1}),connect:async()=>db}});
 assert.equal(result.status,409);assert.equal(statements.includes('ROLLBACK'),true);assert.equal(statements.some(s=>s.startsWith('UPDATE wallet_accounts')),false);assert.equal(released,true);
});
test('request settlement and double-entry transfer commit in one transaction',async()=>{
 const statements=[];const db={release(){},query:async(sql,args)=>{statements.push({sql,args});if(sql.startsWith('SELECT balance_cents'))return {rows:[{balance_cents:1000}]};if(sql.startsWith('SELECT requester_id'))return {rows:[{requester_id:recipient,payer_id:sender,amount_cents:100,status:'pending'}]};return {rows:[],rowCount:sql.startsWith("SELECT")?0:1};}};
 const result=await handleWallet({req:{method:'POST'},path:'/api/wallet/transfers',user,send,readJson:async()=>({recipientEmail:'b@example.com',amountCents:100,idempotencyKey:id,requestId:id}),pool:{query:async()=>({rows:[{id:recipient}],rowCount:1}),connect:async()=>db}});
 assert.equal(result.status,201);assert.equal(statements.filter(s=>s.sql.startsWith('INSERT INTO wallet_entries')).length,2);
 const settled=statements.findIndex(s=>s.sql.startsWith('UPDATE wallet_requests'));assert.ok(settled>0);assert.equal(statements.at(-1).sql,'COMMIT');assert.equal(statements[settled].args[1],id);
});
