import test from 'node:test';
import assert from 'node:assert/strict';
import {describeCall,handleLiveCalls} from './liveCalls.js';
const row={call_key:'key',display_name:'A',caller_id:'+12145550123',destination:'12145550124',provider:'flowroute',max_seconds:60,answered_epoch:100,age_seconds:10};
test('connected duration and overdue status',()=>{assert.equal(describeCall(row,110000).durationSeconds,10);assert.equal(describeCall(row,191000).state,'uncertain');});
test('reservation is connecting, never confirmed live',()=>{assert.equal(describeCall({...row,answered_epoch:null},110000).state,'connecting');assert.equal(describeCall({...row,answered_epoch:null,age_seconds:121},110000).state,'uncertain');});
test('ordinary users rejected without querying',async()=>{let queried=false;await handleLiveCalls({req:{method:'GET'},user:{role:'user'},pool:{query(){queried=true;}},send:(_r,c)=>assert.equal(c,403)});assert.equal(queried,false);});
test('tenant scoping, cap and no cache',async()=>{await handleLiveCalls({req:{method:'GET'},res:{setHeader:(k,v)=>assert.equal(v,'no-store')},user:{role:'super_admin',tenant_id:'tenant-a'},pool:{query:async(sql,args)=>{assert.match(sql,/c.tenant_id=\$1/);assert.deepEqual(args,['tenant-a']);return {rows:Array(501).fill(row)};}},send:(_r,c,b)=>{assert.equal(c,200);assert.equal(b.calls.length,500);assert.equal(b.truncated,true);}});});
test('writes rejected',async()=>{await handleLiveCalls({req:{method:'POST'},user:{role:'super_admin'},send:(_r,c)=>assert.equal(c,405)});});
