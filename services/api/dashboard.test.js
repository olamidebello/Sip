import test from "node:test";
import assert from "node:assert/strict";
import {validateTiles,handleDashboard} from "./dashboard.js";

test("dashboard accepts ordered known tiles and rejects duplicates or unknown tiles",()=>{
  assert.deepEqual(validateTiles(["billing","dialer"]),["billing","dialer"]);
  for(const tiles of [[],["dialer","dialer"],["unknown"],"dialer"])
    assert.throws(()=>validateTiles(tiles));
});
test("summary scopes each query to the signed-in user or tenant",async()=>{
  const calls=[],user={id:"u1",tenant_id:"t1",role:"admin",features:{messaging:true,billing:true,meetings:true}};
  let body;
  await handleDashboard({req:{method:"GET"},res:{},path:"/api/dashboard/summary",user,
    pool:{query:async(sql,params)=>{calls.push({sql,params});return {rows:[{total:2}]};}},
    send:(_res,_code,value)=>{body=value;}});
  assert.equal(body.summary.tenantUsers,2);
  assert.equal(calls.length,6);
  assert(calls.every(({params})=>params.every(value=>value===user.id || value===user.tenant_id)));
});

test('named dashboards list only the current tenant and owner',async()=>{
  const calls=[];let body;
  const user={id:'u1',tenant_id:'t1',role:'user',features:{}};
  await handleDashboard({req:{method:'GET'},res:{},path:'/api/dashboard/views',user,
    pool:{query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}},
    send:(_res,_status,value)=>{body=value;}});
  assert.equal(body.currentUserId,'u1');
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].params,['t1','u1']);
  assert.deepEqual(calls[1].params,['u1','t1']);
});
