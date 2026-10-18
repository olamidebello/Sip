import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCallingPlan,validateCallingPlan,topUpTrialGrants,trialRefund} from './defaultCallingPlan.js';
test('ten minute calls can refund unused time',()=>assert.equal(trialRefund(600,121),479));
test('plan limits reject invalid minutes and accept ten',()=>{
 const b={name:'Starter',description:'Free',active:true,minutes:10};assert.equal(validateCallingPlan(b).seconds,600);
 for(const minutes of [0,61,1.5,'10'])assert.throws(()=>validateCallingPlan({...b,minutes}));
});
test('non-super administrators cannot manage plan',async()=>{
 const r=await handleCallingPlan({path:'/api/admin/calling-plan',user:{role:'admin'},pool:{connect(){throw Error('must not connect');}},send:(_,code,body)=>({code,body})});assert.equal(r.code,403);
});
test('stale plan revisions roll back without changing grants',async()=>{
 const writes=[];const db={release(){},query:async(sql)=>{writes.push(sql);return {rows:[{revision:2}]};}};
 const r=await handleCallingPlan({req:{method:'PUT'},path:'/api/admin/calling-plan',user:{role:'super_admin',id:'u',tenant_id:'t'},pool:{connect:async()=>db},readJson:async()=>({name:'Trial',description:'',active:true,minutes:10,expectedRevision:1}),send:(_,code)=>code});
 assert.equal(r,409);assert.ok(writes.includes('ROLLBACK'));assert.ok(!writes.some(s=>s.startsWith('UPDATE')));
});
test('top-up uses an atomic difference and never resets usage',async()=>{
 let remaining=50,granted=120;
 const db={query:async(sql,args)=>{assert.match(sql,/GREATEST\(\$1-granted_seconds,0\)/);remaining+=Math.max(0,args[0]-granted);granted=Math.max(granted,args[0]);}};
 await topUpTrialGrants(db,'tenant',600);assert.equal(remaining,530);
 await topUpTrialGrants(db,'tenant',600);assert.equal(remaining,530);
 await topUpTrialGrants(db,'tenant',120);assert.equal(remaining,530);
});
