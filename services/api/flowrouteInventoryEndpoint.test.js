import test from 'node:test';
import assert from 'node:assert/strict';
import {availableNumbers} from './providers.js';
test('Flowroute inventory uses documented Numbers v2 endpoint and preserves filters',async()=>{
 const original=globalThis.fetch;
 const prior=[process.env.FLOWROUTE_ACCESS_KEY,process.env.FLOWROUTE_SECRET_KEY];
 process.env.FLOWROUTE_ACCESS_KEY='test';process.env.FLOWROUTE_SECRET_KEY='test';
 try{
  globalThis.fetch=async(url)=>{
   const u=new URL(url);assert.equal(u.origin,'https://api.flowroute.com');assert.equal(u.pathname,'/v2/numbers/available');assert.equal(u.searchParams.get('starts_with'),'1650');assert.equal(u.searchParams.get('offset'),'20');
   return new Response(JSON.stringify({data:[]}));
  };
  assert.deepEqual(await availableNumbers('flowroute',{prefix:'1650',offset:20}),[]);
 }finally{
  globalThis.fetch=original;
  for(const [i,key] of ['FLOWROUTE_ACCESS_KEY','FLOWROUTE_SECRET_KEY'].entries())if(prior[i]===undefined)delete process.env[key];else process.env[key]=prior[i];
 }
});
