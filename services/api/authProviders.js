import { randomUUID } from "node:crypto";
import { defaultTenantId,isAdmin } from "./tenancy.js";

export async function migrateAuthProviders(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_auth_policy (
    tenant_id CHAR(36) PRIMARY KEY,local_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ldap_admin_managed BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
}

export async function handleAuthProviders({req,res,path,user,pool,send,readJson,connections,meetingSignaling}) {
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (path==="/api/admin/auth-providers" && req.method==="GET") {
    const [policy,ldap]=await Promise.all([
      pool.query("SELECT local_enabled AS localEnabled,ldap_admin_managed AS ldapAdminManaged FROM tenant_auth_policy WHERE tenant_id=$1",[user.tenant_id]),
      pool.query("SELECT enabled FROM tenant_ldap_settings WHERE tenant_id=$1",[user.tenant_id])
    ]);
    return send(res,200,{tenantId:user.tenant_id,localEnabled:policy.rows[0]?.localEnabled===undefined?true:Boolean(policy.rows[0].localEnabled),
      ldapAdminManaged:policy.rows[0]?.ldapAdminManaged===undefined?true:Boolean(policy.rows[0].ldapAdminManaged),
      ldapConfigured:Boolean(connections[user.tenant_id]),ldapEnabled:Boolean(ldap.rows[0]?.enabled),
      providers:["local","ldap"],superAdmin:user.role==="super_admin"});
  }
  if (path==="/api/admin/auth-providers" && req.method==="PUT") {
    if (user.role!=="super_admin") return send(res,403,{error:"Super admin required"});
    const {localEnabled,ldapAdminManaged}=await readJson(req);
    if (typeof localEnabled!=="boolean" || typeof ldapAdminManaged!=="boolean")
      return send(res,400,{error:"Both authentication policy switches are required"});
    if (!localEnabled) {
      if (user.tenant_id===defaultTenantId) return send(res,409,{error:"The original tenant must retain local super admin recovery"});
      const ldap=await pool.query("SELECT enabled FROM tenant_ldap_settings WHERE tenant_id=$1",[user.tenant_id]);
      const maps=await pool.query("SELECT COUNT(*) AS total FROM ldap_group_mappings WHERE tenant_id=$1",[user.tenant_id]);
      if (!connections[user.tenant_id] || !ldap.rows[0]?.enabled || Number(maps.rows[0]?.total||0)<1)
        return send(res,409,{error:"Configure and enable mapped LDAPS before disabling local sign-in"});
    }
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE",[user.tenant_id]);
      if (!localEnabled) {
        const ldap=await db.query("SELECT enabled FROM tenant_ldap_settings WHERE tenant_id=$1",[user.tenant_id]);
        const maps=await db.query("SELECT COUNT(*) AS total FROM ldap_group_mappings WHERE tenant_id=$1",[user.tenant_id]);
        if (!connections[user.tenant_id] || !ldap.rows[0]?.enabled || Number(maps.rows[0]?.total||0)<1) {
          await db.query("ROLLBACK");return send(res,409,{error:"Configure and enable mapped LDAPS before disabling local sign-in"});
        }
      }
      await db.query("INSERT INTO tenant_auth_policy(tenant_id,local_enabled,ldap_admin_managed,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE local_enabled=VALUES(local_enabled),ldap_admin_managed=VALUES(ldap_admin_managed),updated_by=VALUES(updated_by)",
        [user.tenant_id,localEnabled,ldapAdminManaged,user.id]);
      let revoked=[];
      if (!localEnabled) {
        const accounts=await db.query("SELECT id FROM users WHERE tenant_id=$1 AND auth_source='local' AND role<>'super_admin'",[user.tenant_id]);
        revoked=accounts.rows;
        await db.query("DELETE s FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.tenant_id=$1 AND u.auth_source='local' AND u.role<>'super_admin'",[user.tenant_id]);
      }
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'auth_provider_policy_changed')",
        [randomUUID(),user.tenant_id,user.id]);
      await db.query("COMMIT");
      for (const account of revoked) meetingSignaling?.closeUser?.(account.id);
      return send(res,200,{localEnabled,ldapAdminManaged});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  return send(res,404,{error:"Authentication provider route unavailable"});
}
