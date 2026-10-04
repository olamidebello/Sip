import test from "node:test";
import assert from "node:assert/strict";
import {allowed,catalogPolicy,routeCapability,handleCatalogControl} from "./catalogControl.js";

test("super admin controls override tenant purchase and admin restrictions",()=>{
  const policy={planRequests:false,didRequests:false,adminPlans:false,adminPricing:false,adminInventory:false,adminUsers:false};
  assert.equal(allowed(policy,{role:"super_admin"},"didRequests"),true);
  assert.equal(allowed(policy,{role:"admin"},"adminInventory"),false);
  assert.equal(allowed(policy,{role:"user"},"planRequests"),false);
  assert.equal(routeCapability("/api/numbers/request","POST"),"didRequests");
  assert.equal(routeCapability("/api/admin/plans/00000000-0000-4000-8000-000000000001","PUT"),"adminPlans");
  assert.equal(routeCapability("/api/admin/users/00000000-0000-4000-8000-000000000001/groups","PUT"),"adminUsers");
  assert.equal(routeCapability("/api/admin/plans","GET"),null);
});
test("catalog policy queries only selected tenant and defaults to enabled",async()=>{
  let tenant;
  const policy=await catalogPolicy({query:async(_sql,params)=>{tenant=params[0];return {rows:[],rowCount:0};}},"tenant-b");
  assert.equal(tenant,"tenant-b");assert.equal(policy.planRequests,true);
});
test("tenant admin cannot write purchase policy",async()=>{
  let read=false;
  const result=await handleCatalogControl({req:{method:"PUT"},res:{},path:"/api/admin/catalog-policy",
    user:{role:"admin",tenant_id:"t"},pool:{},readJson:async()=>{read=true;},send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,403);assert.equal(read,false);
});
