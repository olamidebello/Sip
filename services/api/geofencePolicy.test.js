import test from "node:test";
import assert from "node:assert/strict";
import {validateGeofencePolicy,handleGeofencePolicy} from "./geofencePolicy.js";

test("enabled calling area requires bounded coordinates and a zone",()=>{
  assert.throws(()=>validateGeofencePolicy({enabled:true,maxAccuracyMeters:100,zones:[]}));
  assert.throws(()=>validateGeofencePolicy({enabled:true,maxAccuracyMeters:100,zones:[{latitude:91,longitude:0,radiusMeters:100}]}));
  assert.deepEqual(validateGeofencePolicy({enabled:true,maxAccuracyMeters:50,zones:[{latitude:6.5,longitude:3.4,radiusMeters:200}]}).zones,
    [{latitude:6.5,longitude:3.4,radiusMeters:200}]);
});
test("ordinary user cannot change a tenant geofence",async()=>{
  let read=false;
  const result=await handleGeofencePolicy({req:{method:"PUT"},res:{},path:"/api/admin/geofence",
    user:{role:"user",tenant_id:"t"},pool:{},readJson:async()=>{read=true;},
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,403);assert.equal(read,false);
});
