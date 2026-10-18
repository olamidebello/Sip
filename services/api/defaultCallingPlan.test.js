import test from 'node:test';
import assert from 'node:assert/strict';
import {trialRefund,defaultPlanId,ensureDefaultCallingPlan} from './defaultCallingPlan.js';
test('unanswered calls refund the complete allowance',()=>assert.equal(trialRefund(120,0,true),120));
test('answered duration consumes seconds and rounds up',()=>{
 assert.equal(trialRefund(120,35.2),84);assert.equal(trialRefund(84,84),0);
 assert.equal(trialRefund(120,125),0);assert.equal(trialRefund(120,0),119);
});
test('invalid accounting input fails',()=>{for(const v of [0,-1,3601])assert.throws(()=>trialRefund(v,1));});
test('plans are stable and isolated by tenant',()=>{assert.equal(defaultPlanId('a'),defaultPlanId('a'));assert.notEqual(defaultPlanId('a'),defaultPlanId('b'));});
test('enrollment preserves active plans and never replenishes an existing grant',async()=>{
 const calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{tenant_id:'tenant',allowance_seconds:600}]};}};
 await ensureDefaultCallingPlan(db,'user');
 assert.ok(calls.some(c=>/IF\(status='active',plan_id/.test(c.sql))); 
 assert.ok(calls.some(c=>/INSERT IGNORE INTO calling_trial_balances/.test(c.sql))); 
});

test('trial settlement returns unused seconds once and never charges money',async()=>{
 const {settlePstn}=await import('./pstnBilling.js');
 let remaining=0,settled=false,refunds=0;
 const now=Math.floor(Date.now()/1000);
 const db={release(){},async query(sql,args=[]){
  if(sql.startsWith('SELECT * FROM pstn_calls'))return {rows:[{call_key:'f'.repeat(64),user_id:'u',tenant_id:'t',trial_seconds:120,rate:'10.000000',first_interval:60,sub_interval:60,reserved_cents:0,max_seconds:120,status:settled?'settled':'reserved'}]};
  if(sql.startsWith('SELECT event,event_epoch'))return {rows:[{event:'start',event_epoch:now-45},{event:'end',event_epoch:now}]};
  if(sql.startsWith('UPDATE calling_trial_balances')){remaining+=args[0];refunds++;}
  if(sql.startsWith('SELECT balance_cents'))return {rows:[{balance_cents:0}]};
  if(sql.includes("SET status='settled'")){assert.equal(args[0],0);settled=true;}
  return {rows:[]};
 }};
 const data={callKey:'f'.repeat(64),event:'end',epoch:now};
 assert.equal((await settlePstn({connect:async()=>db},data))[1].chargedCents,0);
 await settlePstn({connect:async()=>db},data);
 assert.equal(remaining,75);assert.equal(refunds,1);
});
