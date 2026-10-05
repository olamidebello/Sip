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
  assert.equal(calls.length,5);
  assert(calls.every(({params})=>params.every(value=>value===user.id || value===user.tenant_id)));
});
