import {randomUUID} from "node:crypto";
import {isAdmin} from "./tenancy.js";

const defaultPolicy={enabled:false,maxAccuracyMeters:100,zones:[]};
export function validateGeofencePolicy(input) {
  if (!input || typeof input!=="object" || Array.isArray(input) ||
      Object.keys(input).some(key=>!["enabled","maxAccuracyMeters","zones"].includes(key)) ||
      typeof input.enabled!=="boolean" || !Number.isFinite(input.maxAccuracyMeters) ||
      input.maxAccuracyMeters<1 || input.maxAccuracyMeters>10000 ||
      !Array.isArray(input.zones) || input.zones.length>20 ||
      input.zones.some(zone=>!zone || typeof zone!=="object" || Array.isArray(zone) ||
        Object.keys(zone).some(key=>!["latitude","longitude","radiusMeters"].includes(key)) ||
        !Number.isFinite(zone.latitude) || Math.abs(zone.latitude)>90 ||
        !Number.isFinite(zone.longitude) || Math.abs(zone.longitude)>180 ||
        !Number.isFinite(zone.radiusMeters) || zone.radiusMeters<1 || zone.radiusMeters>100000))
    throw new Error("Valid geofence settings and up to 20 zones required");
  if (input.enabled && input.zones.length===0) throw new Error("Add an allowed zone before enabling geofencing");
  return {enabled:input.enabled,maxAccuracyMeters:input.maxAccuracyMeters,
    zones:input.zones.map(({latitude,longitude,radiusMeters})=>({latitude,longitude,radiusMeters}))};
}
export async function migrateGeofencePolicy(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_geofence_policy (
    tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,updated_by CHAR(36) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
}
export async function getGeofencePolicy(pool,tenantId) {
  const result=await pool.query("SELECT policy FROM tenant_geofence_policy WHERE tenant_id=$1",[tenantId]);
  const value=result.rows[0]?.policy;
  return value ? typeof value==="string"?JSON.parse(value):value : {...defaultPolicy};
}
export async function handleGeofencePolicy({req,res,path,user,pool,send,readJson}) {
  if (path==="/api/geofence" && req.method==="GET")
    return send(res,200,await getGeofencePolicy(pool,user.tenant_id));
  if (path==="/api/admin/geofence" && req.method==="GET") {
    if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
    return send(res,200,await getGeofencePolicy(pool,user.tenant_id));
  }
  if (path==="/api/admin/geofence" && req.method==="PUT") {
    if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
    let policy;
    try {policy=validateGeofencePolicy(await readJson(req));}
    catch(error) {return send(res,400,{error:error.message});}
    await pool.query("INSERT INTO tenant_geofence_policy(tenant_id,policy,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE policy=VALUES(policy),updated_by=VALUES(updated_by)",
      [user.tenant_id,JSON.stringify(policy),user.id]);
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'geofence_policy_changed')",[randomUUID(),user.tenant_id,user.id]);
    return send(res,200,policy);
  }
  return send(res,404,{error:"Geofence route unavailable"});
}
