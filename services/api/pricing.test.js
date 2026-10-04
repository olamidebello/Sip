import test from "node:test";
import assert from "node:assert/strict";
import { validRule,sellingCents,handlePricing } from "./pricing.js";

test("pricing supports percentage increase and decrease, fixed adjustment, manual price",()=>{
  assert.equal(sellingCents(125,"percent",3000),163);
  assert.equal(sellingCents(125,"percent",-1000),113);
  assert.equal(sellingCents(125,"fixed",50),175);
  assert.equal(sellingCents(125,"fixed",-200),0);
  assert.equal(sellingCents(125,"manual",499),499);
  assert.equal(validRule({mode:"percent",setupValue:-10001,monthlyValue:0}),false);
  assert.throws(()=>sellingCents(10000000,"percent",3000),RangeError);
});

test("tenant rule writes require admin and validated values",async()=>{
  let calls=0;
  const pool={query:async(sql,params)=>{calls++;assert.equal(params[sql.includes("security_events")?1:0],"tenant-a");return {rows:[],rowCount:1};}};
  const req={method:"PUT"},path="/api/admin/pricing/flowroute";
  const send=(_res,status,body)=>({status,body});
  const readJson=async()=>({mode:"fixed",setupValue:-50,monthlyValue:100});
  assert.equal((await handlePricing({req,res:{},path,user:{role:"user",tenant_id:"tenant-a"},pool,send,readJson})).status,403);
  assert.equal(calls,0);
  const result=await handlePricing({req,res:{},path,user:{role:"admin",id:"actor",tenant_id:"tenant-a"},pool,send,readJson});
  assert.equal(result.status,200);assert.equal(calls,2);
});
