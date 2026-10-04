import { isAdmin } from "./tenancy.js";
import { randomUUID } from "node:crypto";

export const BACKGROUND_PRESETS=["midnight","ocean","aurora","sunrise","slate"];
export const DEFAULT_BACKGROUND=Object.freeze({dayPreset:"ocean",nightPreset:"midnight",schedule:false,animate:false});
export function validateBackground(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      Object.keys(value).some(key=>!["dayPreset","nightPreset","schedule","animate"].includes(key)) ||
      !BACKGROUND_PRESETS.includes(value.dayPreset) || !BACKGROUND_PRESETS.includes(value.nightPreset) ||
      typeof value.schedule!=="boolean" || typeof value.animate!=="boolean")
    throw new TypeError("Choose valid presets, schedule, and animation settings");
  return {dayPreset:value.dayPreset,nightPreset:value.nightPreset,
    schedule:value.schedule,animate:value.animate};
}
export async function migrateBackground(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_backgrounds (
    tenant_id CHAR(36) PRIMARY KEY,config JSON NOT NULL,allow_user_override BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_backgrounds (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,config JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
}
function parseConfig(value) {
  try {return validateBackground(typeof value==="string"?JSON.parse(value):value);}
  catch {return DEFAULT_BACKGROUND;}
}
export async function handleBackground({req,res,path,user,pool,send,readJson}) {
  if (path==="/api/admin/background" && !isAdmin(user))
    return send(res,403,{error:"Administrator required"});
  if ((path==="/api/background" || path==="/api/admin/background") && req.method==="GET") {
    const [tenantResult,userResult]=await Promise.all([
      pool.query("SELECT config,allow_user_override AS allowUserOverride FROM tenant_backgrounds WHERE tenant_id=$1",[user.tenant_id]),
      pool.query("SELECT config FROM user_backgrounds WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id])
    ]);
    const tenant=tenantResult.rows[0],personal=userResult.rows[0];
    const canOverride=tenant?.allowUserOverride===undefined || Boolean(tenant.allowUserOverride) || isAdmin(user);
    const tenantConfig=parseConfig(tenant?.config||DEFAULT_BACKGROUND);
    const userConfig=personal?parseConfig(personal.config):null;
    return send(res,200,{tenant:tenantConfig,user:userConfig,effective:canOverride&&userConfig?userConfig:tenantConfig,
      allowUserOverride:tenant?.allowUserOverride===undefined?true:Boolean(tenant.allowUserOverride),canOverride,
      presets:BACKGROUND_PRESETS});
  }
  if (path==="/api/background" && req.method==="PUT") {
    const policy=await pool.query("SELECT allow_user_override FROM tenant_backgrounds WHERE tenant_id=$1",[user.tenant_id]);
    if (policy.rows[0] && !policy.rows[0].allow_user_override && !isAdmin(user))
      return send(res,403,{error:"Tenant background is locked by administrator"});
    let config;
    try {config=validateBackground(await readJson(req));}
    catch {return send(res,400,{error:"Invalid background settings"});}
    await pool.query("INSERT INTO user_backgrounds(user_id,tenant_id,config) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE config=VALUES(config)",
      [user.id,user.tenant_id,JSON.stringify(config)]);
    return send(res,200,{effective:config});
  }
  if (path==="/api/background" && req.method==="DELETE") {
    await pool.query("DELETE FROM user_backgrounds WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]);
    return send(res,200,{status:"reset"});
  }
  if (path==="/api/admin/background" && req.method==="PUT") {
    const data=await readJson(req);
    if (typeof data.allowUserOverride!=="boolean") return send(res,400,{error:"Override policy required"});
    let config;
    try {config=validateBackground(data.config);}
    catch {return send(res,400,{error:"Invalid background settings"});}
    await pool.query("INSERT INTO tenant_backgrounds(tenant_id,config,allow_user_override,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE config=VALUES(config),allow_user_override=VALUES(allow_user_override),updated_by=VALUES(updated_by)",
      [user.tenant_id,JSON.stringify(config),data.allowUserOverride,user.id]);
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'background_policy_changed')",
      [randomUUID(),user.tenant_id,user.id]);
    return send(res,200,{config,allowUserOverride:data.allowUserOverride});
  }
  return send(res,404,{error:"Background route unavailable"});
}
