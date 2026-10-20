import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLocation,handleLocationHistory} from './locationHistory.js';
test('location saves require consent and finite bounded coordinates',()=>{
 for(const value of [{latitude:0,longitude:0,accuracyMeters:1},{consent:true,latitude:91,longitude:0,accuracyMeters:1},{consent:true,latitude:0,longitude:Infinity,accuracyMeters:1},{consent:true,latitude:0,longitude:0,accuracyMeters:-1}])assert.throws(()=>validateLocation(value));
 assert.deepEqual(validateLocation({consent:true,latitude:0,longitude:0,accuracyMeters:0}),[0,0,0]);
});
test('listing and clearing always use authenticated tenant and user',async()=>{
 for(const method of ['GET','DELETE']){const calls=[];let result;await handleLocationHistory({req:{method},user:{id:'owner',tenant_id:'tenant'},pool:{query:async(sql,args)=>{if(sql.includes('tenant_location_reports'))return {rows:[]};calls.push({sql,args});return {rows:[]};}},send:(_,status,data)=>result={status,data}});assert.equal(result.status,200);assert.deepEqual(calls[0].args.slice(0,2),['tenant','owner']);assert.match(calls[0].sql,/tenant_id=\$1 AND user_id=\$2/);}
});
test('save ignores submitted owner, serializes writes and trims old entries',async()=>{
 const calls=[];let result,released=false;const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT id FROM user_location')?Array.from({length:100},(_,i)=>({id:'row'+i})):[]};},release:()=>released=true};
 await handleLocationHistory({req:{method:'POST'},user:{id:'owner',tenant_id:'tenant'},pool:{query:async()=>({rows:[]}),connect:async()=>db},readJson:async()=>({consent:true,latitude:6,longitude:3,accuracyMeters:20,userId:'victim',tenantId:'other'}),send:(_,status,data)=>result={status,data}});
 assert.equal(result.status,201);assert.equal(released,true);assert.match(calls[1].sql,/FOR UPDATE/);assert.ok(calls.some(c=>c.sql.startsWith('DELETE')&&c.args[0]==='row99'));assert.deepEqual(calls.find(c=>c.sql.startsWith('INSERT')).args.slice(1),['tenant','owner',6,3,20]);assert.equal(calls.at(-1).sql,'COMMIT');
});
