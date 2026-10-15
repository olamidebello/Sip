import test from 'node:test';import assert from 'node:assert/strict';
import {validatePolicy,policyKey,normalizeDestination,selectPolicyRate,assertCallingWindow,internationalAllowance,handleTelecomPolicies,selectShadowRate} from './telecomPolicies.js';
const userId='00000000-0000-4000-8000-000000000001',rate={prefix:'234',rate:'0.020000',first:60,step:60};
const rule=(kind,data,enabled=true)=>({id:kind,kind,data,enabled});
test('validates every live policy field and rejects malformed rates, prefixes, budgets and time windows',()=>{
 assert.equal(validatePolicy('personal-rates',{...rate,userId}).rate,'0.020000');
 for(const [kind,data] of [['normalization',{prefix:'00',replacement:'+'}],['personal-rates',{...rate,userId:'foreign'}],['shadow-rates',{...rate,rate:'NaN'}],['callerid-rates',{...rate,callerId:'bad'}],['international-credit',{userId,homePrefix:'1',limitCents:-1}],['time-windows',{prefix:'1',days:'0,0',startMinute:0,endMinute:1440}]])assert.throws(()=>validatePolicy(kind,data));
 assert.equal(policyKey('international-credit',{userId}),userId);
});
test('normalization uses one longest-prefix rule, never chains rules or accepts non-E164 results',()=>{
 const rules=[rule('normalization',{prefix:'0',replacement:'234'}),rule('normalization',{prefix:'00',replacement:''})];
 assert.equal(normalizeDestination('002341234567890',rules),'2341234567890');assert.equal(normalizeDestination('08012345678',rules),'2348012345678');assert.throws(()=>normalizeDestination('abc',rules));
});
test('account and caller ID overrides have deterministic longest-prefix priority and disabled rules do not match',()=>{
 const rules=[rule('callerid-rates',{...rate,callerId:'15551234567'}),rule('personal-rates',{...rate,userId}),rule('personal-rates',{...rate,prefix:'2348',userId,rate:'1'},false)];
 assert.equal(selectPolicyRate(rules,{userId,callerId:'+15551234567',destination:'2348012345678'}).kind,'personal-rates');
 assert.equal(selectPolicyRate(rules,{userId:'other',callerId:'+15551234567',destination:'2348012345678'}).kind,'callerid-rates');
 assert.equal(selectPolicyRate(rules,{userId:'other',callerId:'+15557654321',destination:'2348012345678'}),null);
 assert.equal(selectShadowRate([rule('shadow-rates',rate)],'2348012345678').data.rate,'0.020000');
});
test('UTC calling windows enforce weekday and exclusive end boundaries',()=>{
 const rules=[rule('time-windows',{prefix:'234',days:'4',startMinute:60,endMinute:120})];
 assert.doesNotThrow(()=>assertCallingWindow(rules,'2348012345678',new Date('2026-10-15T01:00:00Z')));
 for(const time of ['2026-10-15T00:59:00Z','2026-10-15T02:00:00Z','2026-10-16T01:00:00Z'])assert.throws(()=>assertCallingWindow(rules,'2348012345678',new Date(time)));
});
test('international limits include active reservations and current-month settled charges, leaving home calls unrestricted',async()=>{
 const rules=[rule('international-credit',{userId,homePrefix:'1',limitCents:1000})],calls=[];
 const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{cents:'850'}]};}};
 assert.equal(await internationalAllowance(db,rules,{tenantId:'tenant',userId,destination:'2348012345678'}),150);
 assert.match(calls[0].sql,/status<>'settled' OR settled_at/);assert.deepEqual(calls[0].args,['tenant',userId,'1']);
 assert.equal(await internationalAllowance(db,rules,{tenantId:'tenant',userId,destination:'15551234567'}),Infinity);assert.equal(calls.length,1);
});
test('API rejects non-super-admins and foreign user policies before creating rules',async()=>{
 const send=(_r,status,body)=>({status,body});
 assert.equal((await handleTelecomPolicies({user:{role:'admin'},send})).status,403);
 const calls=[],db={query:async(sql)=>{calls.push(sql);return {rows:[],rowCount:0};},release(){}};
 const result=await handleTelecomPolicies({req:{method:'POST'},path:'/api/admin/telecom/policies/personal-rates',user:{id:userId,tenant_id:'tenant',role:'super_admin'},pool:{connect:async()=>db},readJson:async()=>({data:{...rate,userId},enabled:true}),send});
 assert.equal(result.status,404);assert.ok(!calls.some(q=>q.startsWith('INSERT')));assert.ok(calls.includes('ROLLBACK'));
});
