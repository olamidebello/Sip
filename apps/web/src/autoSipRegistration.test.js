import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoSipRegistration} from './autoSipRegistration.js';
function fixture(session){let job,connected=false;const calls=[],statuses=[];const auto=createAutoSipRegistration({session,connect:async(account,valid)=>{if(valid()){connected=true;calls.push(account.username);}},disconnect:async()=>{connected=false;calls.push('disconnect');},connected:()=>connected,onStatus:s=>statuses.push(s),setTimer:(callback,delay)=>{job={callback,delay};return 1;},clearTimer:()=>{job=null;}});return {auto,calls,statuses,run:()=>job.callback(),delay:()=>job?.delay,drop:()=>{connected=false;auto.dropped();}};}
test('automatic login connects once and restores after network loss',async()=>{
 const f=fixture(async()=>({status:'active',username:'my-account'}));f.auto.start('user');await f.run();assert.deepEqual(f.calls,['my-account']);assert.equal(f.delay(),60000);await f.run();assert.equal(f.calls.length,1);f.drop();await f.run();assert.deepEqual(f.calls,['my-account','my-account']);await f.auto.stop();assert.equal(f.delay(),undefined);
});
test('pending provisioning retries without trying to register',async()=>{
 const f=fixture(async()=>({status:'pending',note:'Activation pending'}));f.auto.start('user');await f.run();assert.equal(f.delay(),30000);assert.equal(f.calls.length,0);
});
test('revoked application sessions disconnect SIP and stop retries',async()=>{
 const f=fixture(async()=>{throw Object.assign(Error('Sign in required'),{status:401});});f.auto.start('user');await f.run();assert.deepEqual(f.calls,['disconnect']);assert.equal(f.delay(),undefined);
});
test('logout invalidates an in-flight credential response',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.auto.start('user');const run=f.run();await f.auto.stop();resolve({status:'active',username:'stale'});await run;assert.deepEqual(f.calls,['disconnect']);
});
test('HTTP 429 pauses reconnect and repeated wake events cannot bypass Retry-After',async()=>{
 let requests=0;const f=fixture(async()=>{requests++;throw Object.assign(Error('Too many requests'),{status:429,retryAfter:90});});f.auto.start('user');await f.run();assert.equal(f.delay(),90000);f.auto.wake();await f.run();assert.equal(requests,1);assert.ok(f.delay()>89000);assert.match(f.statuses.at(-1),/paused by rate limit/);await f.auto.stop();
});

test('switch 503 retry delay prevents repeated wake attempts',async()=>{let requests=0;const f=fixture(async()=>{requests++;throw Object.assign(Error('Switch unavailable'),{sipCode:503,retryAfter:120});});f.auto.start('u');await f.run();assert.equal(f.delay(),120000);f.auto.wake();await f.run();assert.equal(requests,1);await f.auto.stop();});
