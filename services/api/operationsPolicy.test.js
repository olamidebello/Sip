import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOperationsPolicy,resolveWss} from './operationsPolicy.js';

test('balancer rejects invalid policy before database access',async()=>{
  const result=await handleOperationsPolicy({req:{method:'PUT'},res:{},
    path:'/api/admin/operations/balancer',user:{role:'super_admin'},
    pool:{connect:async()=>{throw Error('Unexpected connection');}},
    readJson:async()=>({enabled:true,strategy:'unknown',allowGlobalFallback:true,expectedRevision:0}),
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,400);
});
test('balancer requires super admin and ignores disabled targets',async()=>{
  const denied=await handleOperationsPolicy({req:{method:'GET'},res:{},
    path:'/api/admin/operations',user:{role:'admin'},pool:{query:async()=>{throw Error('Unexpected query');}},
    send:(_res,status,body)=>({status,body})});
  assert.equal(denied.status,403);
  const seen=[];
  const pool={query:async(sql,args)=>{seen.push([sql,args]);
    if(sql.includes('FROM wss_balancer_policy'))return {rows:[{enabled:0,strategy:'sticky',allow_global_fallback:1}]};
    throw Error('Disabled balancer must not read target inventory');
  }};
  assert.equal(await resolveWss(pool,'account','east'),null);
  assert.equal(seen.length,1);
});
test('WSS discovery respects region fallback and weighted selection',async()=>{
  const calls=[];
  const pool={query:async(sql,args)=>{
    calls.push(args);
    if(sql.includes('FROM wss_balancer_policy'))return {rows:[{enabled:1,strategy:'sticky',allow_global_fallback:0}]};
    return {rows:[{name:'east-one',region:'east',wss_url:'wss://east.example.com/',weight:1}]};
  }};
  assert.deepEqual(await resolveWss(pool,'account','east'),
    {name:'east-one',region:'east',wssUrl:'wss://east.example.com/'});
  assert.deepEqual(calls[1],['east',false]);
});
