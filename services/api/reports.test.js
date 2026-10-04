import test from "node:test";
import assert from "node:assert/strict";
import { reportRange,reportCsv,handleReports } from "./reports.js";

test("report periods validate real UTC dates and bounded spans",()=>{
  assert.deepEqual(reportRange(new URLSearchParams("from=2026-10-01&to=2026-10-04")),
    {from:"2026-10-01",to:"2026-10-04",until:"2026-10-05"});
  for(const query of ["to=2026-02-30","from=2026-10-05&to=2026-10-04",
    "from=2025-01-01&to=2026-10-04","to=garbage"])
    assert.throws(()=>reportRange(new URLSearchParams(query)),RangeError);
});

test("report endpoint enforces admin and selected tenant for every query",async()=>{
  const calls=[];
  const pool={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
  let status,body;
  const send=(_res,s,b)=>{status=s;body=b;};
  const req={method:"GET",url:"/api/admin/reports?from=2026-10-01&to=2026-10-04"};
  await handleReports({req,res:{},user:{role:"user",tenant_id:"tenant-a"},pool,send});
  assert.equal(status,403);assert.equal(calls.length,0);
  await handleReports({req:{method:"GET",url:"/api/admin/reports.csv?to=2026-02-30"},res:{},user:{role:"admin",tenant_id:"tenant-a"},pool,send});
  assert.equal(status,400);assert.equal(calls.length,0);
  await handleReports({req,res:{},user:{role:"admin",tenant_id:"tenant-a"},pool,send});
  assert.equal(status,200);assert.equal(body.calls.total.calls,0);
  assert.equal(calls.length,10);
  assert.ok(calls.every(({sql,params})=>sql.includes("tenant_id") && params[0]==="tenant-a"));
  assert.ok(!calls.some(({sql})=>sql.includes("SELECT *")));
});

test("CSV escapes cells and has stable columns",()=>{
  const csv=reportCsv({calls:{daily:[{day:'=1+2"',calls:1,answered:1,missed:0,duration_seconds:3,billable_seconds:2}]}});
  assert.match(csv,/day.*billable_seconds/);
  assert.match(csv,/"'=1\+2"""/);
  assert.match(reportCsv({billing:{invoices:[{currency:"USD",status:"unpaid",invoices:2,amount_cents:500}]}},"invoices"),/"USD","unpaid","2","500"/);
});
