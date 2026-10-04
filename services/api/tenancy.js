import { randomUUID } from "node:crypto";
import { hashPassword } from "./security.js";

export const defaultTenantId = "00000000-0000-4000-8000-000000000000";
export const isAdmin = (user) => user?.role === "admin" || user?.role === "super_admin";
const uuid = /^[0-9a-f-]{36}$/i;

export async function migrateTenancy(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenants (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, slug VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'active', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_tenant_status CHECK (status IN ('active','suspended'))
  ) ENGINE=InnoDB`);
  await pool.query("INSERT IGNORE INTO tenants(id,name,slug) VALUES($1,'Olamide','olamide')",[defaultTenantId]);
  for (const table of ["users","user_groups","plans","meeting_rooms","mobile_apps"]) {
    const existing = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=$1 AND column_name='tenant_id'",[table]);
    if (!existing.rowCount) await pool.query(`ALTER TABLE ${table} ADD COLUMN tenant_id CHAR(36) NOT NULL DEFAULT '${defaultTenantId}', ADD INDEX ${table}_tenant_idx (tenant_id)`);
  }
  // An old global group name constraint would prevent two tenants using the same name.
  const legacyIndex = await pool.query("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='user_groups' AND index_name='name'");
  if (legacyIndex.rowCount) await pool.query("ALTER TABLE user_groups DROP INDEX name");
  const composite = await pool.query("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='user_groups' AND index_name='tenant_group_name'");
  if (!composite.rowCount) await pool.query("ALTER TABLE user_groups ADD UNIQUE KEY tenant_group_name(tenant_id,name)");
  const sessionContext = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='sessions' AND column_name='selected_tenant_id'");
  if (!sessionContext.rowCount) await pool.query("ALTER TABLE sessions ADD COLUMN selected_tenant_id CHAR(36) NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id CHAR(36) NOT NULL, setting_key VARCHAR(64) NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(tenant_id,setting_key), FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  await pool.query("INSERT IGNORE INTO tenant_settings(tenant_id,setting_key,value) SELECT $1,setting_key,value FROM app_settings WHERE setting_key IN ('sip_wss_url','did_markup_bps')",[defaultTenantId]);
}

export async function handleTenants({req,res,path,user,pool,readJson,send,meetingSignaling,sessionHash}) {
  if (path === "/api/admin/tenants" && req.method === "GET") {
    if (user.role !== "super_admin") return send(res,403,{error:"Super admin required"});
    const result = await pool.query("SELECT id,name,slug,status,created_at FROM tenants ORDER BY created_at DESC LIMIT 200");
    return send(res,200,{tenants:result.rows});
  }
  if (path === "/api/admin/tenants" && req.method === "POST") {
    if (user.role !== "super_admin") return send(res,403,{error:"Super admin required"});
    const {name,slug} = await readJson(req);
    if (typeof name !== "string" || !name.trim() || name.length > 100 ||
        typeof slug !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(slug))
      return send(res,400,{error:"Valid tenant name and slug required"});
    const id = randomUUID();
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)",[id,name.trim(),slug]);
      await db.query("INSERT INTO user_groups(id,tenant_id,name,features) VALUES($1,$2,'Standard',$3)",
        [randomUUID(),id,JSON.stringify({meetings:true,screen_share:true,remote_assist:false,messaging:true,billing:true,call_center:false})]);
      await db.query("COMMIT");
      return send(res,201,{id,name:name.trim(),slug,status:"active"});
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{error:"Tenant slug exists"});
      throw error;
    } finally {db.release();}
  }
  const switchMatch = /^\/api\/admin\/tenants\/([0-9a-f-]{36})\/switch$/i.exec(path);
  if (switchMatch && req.method === "POST") {
    if (user.role !== "super_admin") return send(res,403,{error:"Super admin required"});
    if (!uuid.test(switchMatch[1])) return send(res,400,{error:"Invalid tenant"});
    const tenant = await pool.query("SELECT id FROM tenants WHERE id=$1 AND status='active'",[switchMatch[1]]);
    if (!tenant.rowCount) return send(res,404,{error:"Active tenant unavailable"});
    await pool.query("UPDATE sessions SET selected_tenant_id=$1 WHERE token_hash=$2 AND user_id=$3",
      [switchMatch[1],sessionHash,user.id]);
    return send(res,200,{tenantId:switchMatch[1]});
  }
  const tenantMatch = /^\/api\/admin\/tenants\/([0-9a-f-]{36})\/status$/i.exec(path);
  if (tenantMatch && req.method === "PUT") {
    if (user.role !== "super_admin") return send(res,403,{error:"Super admin required"});
    if (!uuid.test(tenantMatch[1]) || tenantMatch[1] === defaultTenantId)
      return send(res,400,{error:"Invalid tenant"});
    const {status} = await readJson(req);
    if (!["active","suspended"].includes(status)) return send(res,400,{error:"Invalid status"});
    const updated = await pool.query("UPDATE tenants SET status=$1 WHERE id=$2",[status,tenantMatch[1]]);
    if (updated.rowCount && status === "suspended") meetingSignaling?.closeTenant(tenantMatch[1]);
    return send(res,updated.rowCount ? 200 : 404,updated.rowCount ? {status} : {error:"Tenant unavailable"});
  }
  if (path === "/api/admin/tenant-users" && req.method === "POST") {
    if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
    const {tenantId,name,email,password,role} = await readJson(req);
    const targetTenant = user.role === "super_admin" ? tenantId : user.tenant_id;
    if (!uuid.test(targetTenant || "") || (user.role !== "super_admin" && tenantId && tenantId !== user.tenant_id) ||
        typeof name !== "string" || name.trim().length < 2 || name.length > 100 ||
        typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254 ||
        typeof password !== "string" || password.length < 12 || password.length > 1024 ||
        !["user","admin"].includes(role)) return send(res,400,{error:"Valid tenant, user and role required"});
    const tenant = await pool.query("SELECT id FROM tenants WHERE id=$1 AND status='active'",[targetTenant]);
    if (!tenant.rowCount) return send(res,404,{error:"Active tenant unavailable"});
    const {salt,hash} = await hashPassword(password);
    const id = randomUUID(), db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id,targetTenant,name.trim(),email.toLowerCase().trim(),salt,hash,role]);
      const group = await db.query("SELECT id FROM user_groups WHERE tenant_id=$1 AND name='Standard'",[targetTenant]);
      if (group.rowCount) await db.query("INSERT INTO user_group_members(user_id,group_id) VALUES($1,$2)",[id,group.rows[0].id]);
      await db.query("COMMIT");
      return send(res,201,{id,tenantId:targetTenant,role});
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{error:"Email already registered"});
      throw error;
    } finally {db.release();}
  }
  return send(res,404,{error:"Tenant route unavailable"});
}
