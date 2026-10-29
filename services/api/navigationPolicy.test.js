import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNavigationPolicy,resolveNavigation,handleNavigationPolicy} from './navigationPolicy.js';
test('SMS defaults visible while explicit user and group restrictions win',()=>{assert.equal(resolveNavigation()['external-sms'],true);assert.equal(resolveNavigation([{'external-sms':false}])['external-sms'],false);assert.equal(resolveNavigation([] ,{'external-sms':false})['external-sms'],false);});
test('Money, Social and calling rates start visible; other extra navigation starts hidden, merges group restrictions and explicit user overrides',()=>{
 assert.equal(resolveNavigation()['outbound-rates'],true);
 assert.equal(resolveNavigation([{'outbound-rates':false}])['outbound-rates'],false);
 assert.equal(resolveNavigation([] ,{'outbound-rates':false})['outbound-rates'],false);
 assert.equal(resolveNavigation().money,true);assert.ok(Object.entries(resolveNavigation()).filter(([key])=>!['money','social','outbound-rates','external-sms'].includes(key)).every(([,value])=>value===false));
 assert.equal(resolveNavigation([{money:true},{money:false}]).money,false);
 assert.equal(resolveNavigation([{money:true},{money:false}],{money:true}).money,true);
 assert.equal(resolveNavigation(['{"meetings":true}'],{meetings:false}).meetings,false);
});
test('navigation input cannot grant admin pages or accept invalid permissions',()=>{
 for(const value of [null,[],{admin:true},{money:1},{money:null},{'__proto__':null,unknown:true}])assert.throws(()=>validateNavigationPolicy(value));
 assert.deepEqual(validateNavigationPolicy({money:true,billing:false}),{money:true,billing:false});
});
test('ordinary users cannot mutate navigation policy',async()=>{
 let result;await handleNavigationPolicy({req:{method:'PUT'},path:'/api/admin/navigation/users/id',user:{role:'user'},send:(_,status,data)=>result={status,data}});assert.equal(result.status,403);
});
