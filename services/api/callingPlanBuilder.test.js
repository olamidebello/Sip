import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePlan,validatePlanUsage,quoteCallingPlan,createCallingPlan,creditCallingPlan,handleCallingPlans} from './callingPlanBuilder.js';
const user={id:'user',tenant_id:'tenant',features:{billing:true}};
const input={destinations:[{country:'NG',dailyMinutes:10}]};
const quoteId='11111111-1111-4111-8111-111111111111',requestKey='22222222-2222-4222-8222-222222222222';
const rate={prefix:'234',destination:'Nigeria',cost_usd_per_minute:'0.100000',price_usd_per_minute:'99.000000',first_interval:60,sub_interval:6,deck_id:'deck'};
function ratesDb(rows=[rate]){return {async query(sql){assert.match(sql,/d.tenant_id=\$1/);return {rows};}};}
test('daily minutes produce a precise summed 30-day selling-rate budget',()=>{
 const r=calculatePlan([{dailyMinutes:10,sellingRate:'0.130000'},{dailyMinutes:20,sellingRate:'0.015001'}]);
 assert.equal(r.monthlyMinutes,900);assert.equal(r.totalCents,4801);assert.equal(r.destinations[1].monthlyCents,901);
});
test('zero, negative, fractional and excessive minutes and duplicates are rejected',()=>{
 for(const minutes of [0,-1,1.5,1441,NaN])assert.throws(()=>validatePlanUsage({destinations:[{country:'NG',dailyMinutes:minutes}]}));
 assert.throws(()=>validatePlanUsage({destinations:[...input.destinations,...input.destinations]}),/duplicate/);
 assert.throws(()=>validatePlanUsage({destinations:[{country:'NG',dailyMinutes:1000},{country:'GH',dailyMinutes:500}]}),/1440/);
 assert.throws(()=>validatePlanUsage({destinations:[{country:'XX',dailyMinutes:10}]}));
});
test('shared calling codes require a complete example number',()=>{
 assert.throws(()=>validatePlanUsage({destinations:[{country:'US',dailyMinutes:10}]}),/shares/);
 assert.equal(validatePlanUsage({destinations:[{country:'US',dailyMinutes:10,sampleNumber:'+12105551234'}]})[0].callingCode,'1');
 assert.throws(()=>validatePlanUsage({destinations:[{country:'NG',dailyMinutes:10,sampleNumber:'+12105551234'}]}),/country calling code/);
});
test('Flowroute estimate uses live cost-plus selling rate, not stale client/display price',async()=>{
 const result=await quoteCallingPlan(ratesDb(),user,input);
 assert.equal(result.quote.totalCents,3900);assert.equal(result.quote.destinations[0].sellingRate,'0.130000');
 assert.equal(JSON.stringify(result.quote).includes('cost_usd'),false);
});
test('country estimate uses highest current listed rate, sample uses longest prefix',async()=>{
 const rows=[{...rate,prefix:'23480',cost_usd_per_minute:'0.200000'},rate];
 assert.equal((await quoteCallingPlan(ratesDb(rows),user,input)).quote.totalCents,7800);
 assert.equal((await quoteCallingPlan(ratesDb(rows),user,{destinations:[{country:'NG',dailyMinutes:10,sampleNumber:'+2348012345678'}]})).quote.destinations[0].prefix,'23480');
 await assert.rejects(quoteCallingPlan(ratesDb([]),user,input),/No current/);
});
async function purchaseDb({balance=1000,changedRate=false,expired=false,previous=null,failAt=''}={}){
 const quoted=await quoteCallingPlan(ratesDb(),user,input),calls=[];
 const saved={id:quoteId,usage_json:JSON.stringify(quoted.usage),rate_hash:quoted.rateHash,expires_at:new Date(Date.now()+(expired?-1000:600000))};
 const db={release(){},async query(sql,args){calls.push([sql,args]);if(failAt&&sql.startsWith(failAt))throw Error('Injected failure');
  if(sql.startsWith('SELECT * FROM calling_plan_quotes'))return {rows:[saved]};
  if(sql.startsWith('SELECT id,quote_id'))return {rows:previous?[previous]:[]};
  if(sql.includes('FROM carrier_rate_rows'))return {rows:[{...rate,cost_usd_per_minute:changedRate?'0.200000':rate.cost_usd_per_minute}]};
  if(sql.startsWith('SELECT balance_cents'))return {rows:[{currency:'USD',balance_cents:balance}]};
  return {rows:[],rowCount:1};
 }};
 return {calls,query:db.query,connect:async()=>db};
}
const buy={quoteId,requestKey,expectedTotalCents:3900,expectedFundingCents:2900,acceptTerms:true};
test('create produces only shortfall invoice and never credits unverified funding',async()=>{
 const db=await purchaseDb();const p=await createCallingPlan(db,user,buy);
 assert.equal(p.fundingCents,2900);assert.equal(p.status,'awaiting_payment');assert(p.invoiceId);
 assert(!db.calls.some(([s])=>s.startsWith('UPDATE wallet_accounts')));
 assert.equal(db.calls.at(-1)[0],'COMMIT');
});
test('existing balance activates budget without charging wallet or creating invoice',async()=>{
 const db=await purchaseDb({balance:4000});const p=await createCallingPlan(db,user,{...buy,expectedFundingCents:0});
 assert.equal(p.status,'active');assert.equal(p.invoiceId,null);
 assert(!db.calls.some(([s])=>/INSERT INTO invoices|UPDATE wallet_accounts/.test(s)));
});
test('stale rates, expiry, changed balance and tampered totals stop before invoicing',async()=>{
 for(const [options,body]of [[{changedRate:true},buy],[{expired:true},buy],[{balance:500},buy],[{}, {...buy,expectedTotalCents:1}]]){
  const db=await purchaseDb(options);await assert.rejects(createCallingPlan(db,user,body));
  assert(!db.calls.some(([s])=>s.startsWith('INSERT INTO invoices')));assert.equal(db.calls.at(-1)[0],'ROLLBACK');
 }
});
test('purchase retry returns same plan; request ID cannot target another quote',async()=>{
 const previous={id:'plan',quote_id:quoteId,invoice_id:'invoice',funding_cents:2900,status:'awaiting_payment'};
 const db=await purchaseDb({previous,expired:true});assert.equal((await createCallingPlan(db,user,buy)).invoiceId,'invoice');
 assert(!db.calls.some(([s])=>s.startsWith('INSERT INTO invoices')));
 const conflict=await purchaseDb({previous:{...previous,quote_id:requestKey}});await assert.rejects(createCallingPlan(conflict,user,buy),/another quote/);
});
test('invoice and plan writes roll back together on failure',async()=>{
 const db=await purchaseDb({failAt:'INSERT INTO custom_calling_plans'});await assert.rejects(createCallingPlan(db,user,buy),/Injected/);assert.equal(db.calls.at(-1)[0],'ROLLBACK');
});
function fundingDb({paid=true,evidence=true,walletPayment=false,prior=false,amount=2900,fail=false}={}){
 const calls=[],plan={id:'plan',invoice_id:'invoice',tenant_id:'tenant',user_id:'user',funding_cents:2900,status:'awaiting_payment'};
 let committed=false;const db={release(){},async query(sql,args){calls.push([sql,args]);
  if(sql.startsWith('SELECT invoice_id'))return {rows:[{invoice_id:'invoice'}]};
  if(sql.startsWith('SELECT id,user_id,status'))return {rows:[{id:'invoice',user_id:'user',status:paid?'paid':'unpaid',currency:'USD',amount_cents:amount}]};
  if(sql.startsWith('SELECT * FROM custom_calling_plans'))return {rows:[{...plan,status:committed?'active':plan.status}]};
  if(sql.includes('FROM payment_attempts'))return {rows:evidence?[{id:'verified'}]:[]};
  if(sql.includes('FROM wallet_purchases'))return {rows:walletPayment?[{id:'circular'}]:[]};
  if(sql.includes('FROM calling_plan_funding'))return {rows:prior?[{plan_id:'plan'}]:[]};
  if(sql.startsWith('SELECT balance_cents'))return {rows:[{currency:'USD',balance_cents:1000}]};
  if(sql.startsWith('INSERT INTO calling_plan_funding')&&fail)throw Error('Ledger failure');
  if(sql==='COMMIT')committed=true;
  return {rows:[],rowCount:1};
 }};return {calls,connect:async()=>db};
}
test('verified external payment credits exact shortfall once and starts 30 days',async()=>{
 const db=fundingDb();assert.equal(await creditCallingPlan(db,'plan'),true);assert.equal(await creditCallingPlan(db,'plan'),false);
 const updates=db.calls.filter(([s])=>s.startsWith('UPDATE wallet_accounts'));assert.equal(updates.length,1);assert.equal(updates[0][1][0],3900);
 assert(db.calls.some(([s])=>s.includes('INTERVAL 30 DAY')));
});
test('unpaid, missing proof, wallet payments, duplicate ledger and mismatched amount never credit',async()=>{
 for(const options of [{paid:false},{evidence:false},{walletPayment:true},{prior:true},{amount:1}]){
  const db=fundingDb(options);assert.equal(await creditCallingPlan(db,'plan'),false);assert(!db.calls.some(([s])=>s.startsWith('UPDATE wallet_accounts')));
 }
});
test('funding ledger failure rolls wallet credit back',async()=>{const db=fundingDb({fail:true});await assert.rejects(creditCallingPlan(db,'plan'),/Ledger/);assert.equal(db.calls.at(-1)[0],'ROLLBACK');assert(!db.calls.some(([s])=>s==='COMMIT'));});
test('billing feature gate rejects before database access',async()=>{let status;await handleCallingPlans({user:{},req:{},res:{},send:(_r,s)=>status=s});assert.equal(status,403);});
