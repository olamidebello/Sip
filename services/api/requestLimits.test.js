import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestLimiter,createProxyClientResolver,requestLimitRule} from './requestLimits.js';
test('contact/activity traffic cannot consume SIP budget or another user budget',()=>{
 const limiter=createRequestLimiter();const rule=(path,userId)=>requestLimitRule({path,userId,client:'proxy'});
 for(let i=0;i<120;i++){const r=rule('/api/contacts/address-book','a');assert.equal(limiter.check(r.key,r.maximum).allowed,true);}
 for(const user of ['a','b']){const r=rule('/api/sip-account/session',user);assert.equal(limiter.check(r.key,r.maximum).allowed,true);}
 const r=rule('/api/contacts/address-book','a');assert.equal(limiter.check(r.key,r.maximum).allowed,false);
});
test('unknown users remain limited by client identity and Retry-After expires correctly',()=>{
 let time=0;const limiter=createRequestLimiter({now:()=>time});const r=requestLimitRule({path:'/api/login',client:'client'});for(let i=0;i<20;i++)assert.equal(limiter.check(r.key,r.maximum).allowed,true);
 assert.deepEqual(limiter.check(r.key,r.maximum),{allowed:false,retryAfter:60});time=60000;assert.equal(limiter.check(r.key,r.maximum).allowed,true);
});
test('forwarded identity is accepted only from the resolved Caddy peer and uses the last hop',async()=>{
 const resolve=createProxyClientResolver({resolve:async()=>[{address:'172.18.0.4'}]});
 const req=(remote,forwarded)=>({socket:{remoteAddress:remote},headers:{'x-forwarded-for':forwarded}});
 assert.equal(await resolve(req('172.18.0.4','fake, 203.0.113.9')),'203.0.113.9');
 assert.equal(await resolve(req('203.0.113.2','203.0.113.9')),'203.0.113.2');
 assert.equal(await resolve(req('::ffff:172.18.0.4','bad')),'172.18.0.4');
});
test('unverified cookie values do not create separate anonymous budgets',()=>{
 const a=requestLimitRule({path:'/api/sip-account/session',client:'one-client'}),b=requestLimitRule({path:'/api/contacts/import',client:'one-client'});assert.equal(a.key,b.key);assert.equal(a.maximum,20);
});
