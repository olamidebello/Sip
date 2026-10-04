import {randomUUID} from "node:crypto";
import {isAdmin} from "./tenancy.js";

export const defaults=Object.freeze({planRequests:true,didRequests:true,adminPlans:true,
  adminPricing:true,adminInventory:true,adminUsers:true});
const fields={planRequests:"plan_requests",didRequests:"did_requests",adminPlans:"admin_plans",
  adminPricing:"admin_pricing",adminInventory:"admin_inventory",adminUsers:"admin_users"};

export async function migrateCatalogControl(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_catalog_policy (
    tenant_id CHAR(36) PRIMARY KEY,plan_requests BOOLEAN NOT NULL DEFAULT TRUE,
    did_requests BOOLEAN NOT NULL DEFAULT TRUE,admin_plans BOOLEAN NOT NULL DEFAULT TRUE,
    admin_pricing BOOLEAN NOT NULL DEFAULT TRUE,admin_inventory BOOLEAN NOT NULL DEFAULT TRUE,
    admin_users BOOLEAN NOT NULL DEFAULT TRUE,updated_by CHAR(36) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
  const column=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='did_quotes' AND column_name='invoice_id'");
  if (!column.rowCount) await pool.query("ALTER TABLE did_quotes ADD COLUMN invoice_id CHAR(36) NULL, ADD INDEX did_quotes_invoice_idx(invoice_id)");
}
export async function catalogPolicy(pool,tenant) {
  const result=await pool.query("SELECT plan_requests,did_requests,admin_plans,admin_pricing,admin_inventory,admin_users FROM tenant_catalog_policy WHERE tenant_id=$1",[tenant]);
  if (!result.rowCount) return {...defaults};
  return Object.fromEntries(Object.entries(fields).map(([key,column])=>[key,Boolean(result.rows[0][column])]));
}
export function allowed(policy,user,capability) {
  return user.role==="super_admin" || policy[capability]===true;
}
export function routeCapability(path,method) {
  if (path==="/api/billing/select-plan" && method==="POST") return "planRequests";
  if ((path==="/api/inhouse/reserve" || path==="/api/numbers/request") && method==="POST") return "didRequests";
  if (path.startsWith("/api/admin/plans") && method!=="GET") return "adminPlans";
  if ((path.startsWith("/api/admin/pricing/") && method==="PUT") || (path==="/api/admin/markup" && method==="POST")) return "adminPricing";
  if (path.startsWith("/api/admin/inhouse/") && method!=="GET") return "adminInventory";
  if (method!=="GET" && (path.startsWith("/api/admin/users/") || path.startsWith("/api/admin/groups/") || path==="/api/admin/tenant-users" || path==="/api/admin/groups")) return "adminUsers";
  return null;
}
export async function handleCatalogControl({req,res,path,user,pool,send,readJson}) {
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (path==="/api/admin/catalog-policy" && req.method==="GET")
    return send(res,200,{tenantId:user.tenant_id,policy:await catalogPolicy(pool,user.tenant_id),editable:user.role==="super_admin"});
  if (path==="/api/admin/catalog-policy" && req.method==="PUT") {
    if (user.role!=="super_admin") return send(res,403,{error:"Super admin required"});
    const input=await readJson(req);
    if (!input || Object.keys(input).length!==Object.keys(fields).length ||
        Object.keys(fields).some(key=>typeof input[key]!=="boolean") || Object.keys(input).some(key=>!(key in fields)))
      return send(res,400,{error:"All six boolean policy controls are required"});
    await pool.query(`INSERT INTO tenant_catalog_policy(tenant_id,plan_requests,did_requests,admin_plans,admin_pricing,admin_inventory,admin_users,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON DUPLICATE KEY UPDATE plan_requests=VALUES(plan_requests),did_requests=VALUES(did_requests),
      admin_plans=VALUES(admin_plans),admin_pricing=VALUES(admin_pricing),admin_inventory=VALUES(admin_inventory),admin_users=VALUES(admin_users),updated_by=VALUES(updated_by)`,
      [user.tenant_id,...Object.keys(fields).map(key=>input[key]),user.id]);
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'catalog_policy_changed')",[randomUUID(),user.tenant_id,user.id]);
    return send(res,200,{tenantId:user.tenant_id,policy:input});
  }
  return send(res,404,{error:"Catalog policy route unavailable"});
}
