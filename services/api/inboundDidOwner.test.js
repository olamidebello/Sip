import test from 'node:test';
import assert from 'node:assert/strict';
import {inboundNumber,lookupInboundDidOwner,uniqueInboundSip} from './inboundDidOwner.js';
test('DID matching accepts only complete international digits with optional plus',()=>{
 assert.equal(inboundNumber('19452205026'),'+19452205026');assert.equal(inboundNumber('+19452205026'),'+19452205026');
 for(const n of ['9452205026*','01119452205026;','sip:19452205026@host','1234',null])assert.equal(inboundNumber(n),null);
});
test('current assignment query includes live rentals and exact tenant and number constraints',async()=>{
 let calls=0;const p={query:async(sql,args)=>{calls++;assert.match(sql,/FROM did_shop_orders/);assert.match(sql,/rental_until>UTC_TIMESTAMP/);assert.match(sql,/u.tenant_id=\$1/);assert.match(sql,/number_e164 IN \(\$2,SUBSTRING\(\$2,2\)\)/);assert.doesNotMatch(sql,/LIKE/);assert.deepEqual(args,['t','+19452205026']);return {rows:[{user_id:'owner',user_status:'active',tenant_status:'active'}]};}};
 assert.deepEqual(await lookupInboundDidOwner(p,'t','19452205026'),{user_id:'owner'});assert.equal(calls,1);
});
test('conflicting current owners reject rather than choosing the first',async()=>{
 assert.equal(await lookupInboundDidOwner({query:async()=>({rows:[{user_id:'a'},{user_id:'b'}]})},'t','+19452205026'),null);
});
test('inactive current assignment does not ring a historic quote owner',async()=>{
 let n=0;const p={query:async()=>({rows:++n===1?[]:[{}]})};assert.equal(await lookupInboundDidOwner(p,'t','+19452205026'),null);assert.equal(n,2);
});
test('unassigned legacy DID requires one active tenant quote owner',async()=>{
 for(const [legacy,want] of [[[],null],[[{user_id:'a'}],{user_id:'a'}],[[{user_id:'a'},{user_id:'b'}],null]]){
 let n=0;const p={query:async(sql,args)=>{n++;if(n===3){assert.match(sql,/u.tenant_id=\$1/);assert.match(sql,/q.status='fulfilled'/);}return {rows:n===3?legacy:[]};}};
 assert.deepEqual(await lookupInboundDidOwner(p,'t','+19452205026'),want);
 }
});
test('one valid active SIP account is required; multiple accounts are not guessed',()=>{
 const sip={username:'ol123',domain:'sip.example'};assert.deepEqual(uniqueInboundSip([sip]),sip);
 assert.equal(uniqueInboundSip([]),null);assert.equal(uniqueInboundSip([sip,{...sip,username:'ol456'}]),null);
 assert.equal(uniqueInboundSip([{username:'x;redirect',domain:'sip.example'}]),null);
});

test('disabled owner, disabled tenant, and expired rental inventory cannot fall back',async()=>{
 for(const row of [{user_id:'a',user_status:'disabled',tenant_status:'active'},{user_id:'a',user_status:'active',tenant_status:'disabled'}])assert.equal(await lookupInboundDidOwner({query:async()=>({rows:[row]})},'t','+19452205026'),null);
 let n=0;assert.equal(await lookupInboundDidOwner({query:async(sql)=>{n++;if(n===2){assert.match(sql,/FROM did_shop_orders/);assert.doesNotMatch(sql,/rental_until>/);}return {rows:n===2?[{}]:[]};}},'t','+19452205026'),null);assert.equal(n,2);
});
