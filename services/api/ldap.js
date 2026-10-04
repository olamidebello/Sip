import { randomBytes,randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "./security.js";
import { isAdmin } from "./tenancy.js";

const uuid=/^[0-9a-f-]{36}$/i;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function escapeLdapFilter(value) {
  return String(value).replace(/[\\*()\x00]/g,char=>"\\"+char.charCodeAt(0).toString(16).padStart(2,"0"));
}
export function normalizeDn(value) {
  if (typeof value!=="string" || value.length<3 || value.length>512 || /[\x00-\x1f\x7f]/.test(value) || !value.includes("="))
    throw new TypeError("Valid LDAP group DN required");
  return value.trim().toLowerCase();
}
export function loadLdapConnections(raw) {
  const data=JSON.parse(raw||"{}");
  if (!data || typeof data!=="object" || Array.isArray(data)) throw new Error("LDAP_TENANTS_JSON must be an object");
  for(const [tenant,config] of Object.entries(data)) {
    const url=URL.canParse(config?.url||"")?new URL(config.url):null;
    if (!uuid.test(tenant) || url?.protocol!=="ldaps:" || url.username || url.password ||
        !["","/"].includes(url.pathname) || url.search || url.hash || typeof config.baseDn!=="string" ||
        !config.baseDn.includes("=") || typeof config.bindDn!=="string" || !config.bindDn.includes("=") ||
        typeof config.bindPassword!=="string" || !config.bindPassword ||
        (config.caFile!==undefined && (typeof config.caFile!=="string" || !config.caFile.startsWith("/"))))
      throw new Error("LDAP_TENANTS_JSON requires tenant UUID and secure LDAPS connection settings");
  }
  return data;
}
export async function authenticateDirectory({config,email,password,clientFactory}) {
  if (typeof email!=="string" || !emailPattern.test(email) || email.length>254 ||
      typeof password!=="string" || !password || password.length>1024)
    return null;
  const {Client}=clientFactory?{Client:clientFactory}:await import("ldapts");
  const tlsOptions={minVersion:"TLSv1.2"};
  if (config.caFile) tlsOptions.ca=[await readFile(config.caFile)];
  const client=new Client({url:config.url,timeout:5000,connectTimeout:5000,tlsOptions,autoRebind:false});
  try {
    await client.bind(config.bindDn,config.bindPassword);
    const {searchEntries}=await client.search(config.baseDn,{
      scope:"sub",filter:`(mail=${escapeLdapFilter(email.toLowerCase())})`,
      sizeLimit:2,timeLimit:5,attributes:["mail","displayName","cn","memberOf"]
    });
    if (searchEntries.length!==1) return null;
    const entry=searchEntries[0];
    const mail=Array.isArray(entry.mail)?entry.mail[0]:entry.mail;
    if (typeof entry.dn!=="string" || typeof mail!=="string" || mail.toLowerCase()!==email.toLowerCase()) return null;
    await client.bind(entry.dn,password);
    const names=entry.memberOf??entry.memberof??[];
    const groups=(Array.isArray(names)?names:[names]).flatMap(value=>{
      try {return typeof value==="string"?[normalizeDn(value)]:[];} catch {return [];}
    });
    const name=entry.displayName||entry.cn||mail;
    return {dn:entry.dn,email:mail.toLowerCase(),
      name:String(Array.isArray(name)?name[0]:name).trim().slice(0,100)||mail,groups};
  } finally {try {await client.unbind();} catch {/* connection already closed */}}
}

export async function migrateLdap(pool) {
  for(const [name,definition] of [["auth_source","VARCHAR(16) NOT NULL DEFAULT 'local'"],["ldap_dn","VARCHAR(1024) NULL"]]) {
    const found=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name=$1",[name]);
    if (!found.rowCount) await pool.query(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_ldap_settings (
    tenant_id CHAR(36) PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ldap_group_mappings (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,group_dn VARCHAR(512) NOT NULL,
    group_id CHAR(36) NOT NULL,FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(group_id) REFERENCES user_groups(id),
    UNIQUE KEY ldap_mapping_unique (tenant_id,group_dn,group_id),
    INDEX ldap_mapping_tenant (tenant_id)
  ) ENGINE=InnoDB`);
}

export async function loginWithLdap({pool,connections,slug,email,password,authenticate=authenticateDirectory}) {
  if (typeof slug!=="string" || !/^[a-z][a-z0-9-]{1,63}$/.test(slug) ||
      typeof email!=="string" || !emailPattern.test(email) || email.length>254 ||
      typeof password!=="string" || !password || password.length>1024) return null;
  const tenant=(await pool.query("SELECT t.id FROM tenants t JOIN tenant_ldap_settings s ON s.tenant_id=t.id AND s.enabled=TRUE WHERE t.slug=$1 AND t.status='active'",[slug])).rows[0];
  if (!tenant || !connections[tenant.id]) return null;
  const identity=await authenticate({config:connections[tenant.id],email:email.toLowerCase(),password});
  if (!identity || identity.email!==email.toLowerCase()) return null;
  const mappings=await pool.query("SELECT m.group_dn,m.group_id FROM ldap_group_mappings m JOIN user_groups g ON g.id=m.group_id AND g.tenant_id=m.tenant_id WHERE m.tenant_id=$1",[tenant.id]);
  const member=new Set(identity.groups);
  const groupIds=[...new Set(mappings.rows.filter(row=>member.has(normalizeDn(row.group_dn))).map(row=>row.group_id))];
  if (!groupIds.length) return null;
  const db=await pool.connect();
  try {
    await db.query("BEGIN");
    const existing=(await db.query("SELECT id,tenant_id,auth_source,ldap_dn,status,role FROM users WHERE email=$1 FOR UPDATE",[identity.email])).rows[0];
    if (existing && (existing.tenant_id!==tenant.id || existing.auth_source!=="ldap" ||
        existing.ldap_dn!==identity.dn || existing.status!=="active")) {
      await db.query("ROLLBACK");return null;
    }
    const id=existing?.id||randomUUID();
    if (!existing) {
      const {salt,hash}=await hashPassword(randomBytes(48).toString("hex"));
      await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,auth_source,ldap_dn) VALUES($1,$2,$3,$4,$5,$6,'user','ldap',$7)",
        [id,tenant.id,identity.name,identity.email,salt,hash,identity.dn]);
    }
    await db.query("DELETE FROM user_group_members WHERE user_id=$1",[id]);
    for(const groupId of groupIds)
      await db.query("INSERT INTO user_group_members(user_id,group_id) VALUES($1,$2)",[id,groupId]);
    await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'ldap_login')",
      [randomUUID(),tenant.id,id,id]);
    await db.query("COMMIT");
    return {id,tenant_id:tenant.id,display_name:identity.name,email:identity.email,role:existing?.role||"user"};
  } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
}

export async function handleLdapAdmin({req,res,path,user,pool,send,readJson,connections,meetingSignaling}) {
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  const tenant=user.tenant_id;
  if (req.method!=="GET" && user.role!=="super_admin") {
    const policy=await pool.query("SELECT ldap_admin_managed FROM tenant_auth_policy WHERE tenant_id=$1",[tenant]);
    if (policy.rows[0] && !policy.rows[0].ldap_admin_managed)
      return send(res,403,{error:"Super admin controls directory authentication for this tenant"});
  }
  if (path==="/api/admin/ldap" && req.method==="GET") {
    const [settings,mappings,groups]=await Promise.all([
      pool.query("SELECT enabled FROM tenant_ldap_settings WHERE tenant_id=$1",[tenant]),
      pool.query("SELECT m.id,m.group_dn,m.group_id,g.name AS app_group FROM ldap_group_mappings m JOIN user_groups g ON g.id=m.group_id AND g.tenant_id=m.tenant_id WHERE m.tenant_id=$1 ORDER BY m.group_dn LIMIT 200",[tenant]),
      pool.query("SELECT id,name FROM user_groups WHERE tenant_id=$1 ORDER BY name LIMIT 200",[tenant])
    ]);
    return send(res,200,{configured:Boolean(connections[tenant]),enabled:Boolean(settings.rows[0]?.enabled),
      groups:groups.rows,mappings:mappings.rows});
  }
  if (path==="/api/admin/ldap" && req.method==="PUT") {
    const {enabled}=await readJson(req);
    if (typeof enabled!=="boolean") return send(res,400,{error:"Enabled must be true or false"});
    if (enabled && !connections[tenant]) return send(res,409,{error:"Server LDAPS connection is not configured"});
    if (!enabled) {
      const policy=await pool.query("SELECT local_enabled FROM tenant_auth_policy WHERE tenant_id=$1",[tenant]);
      if (policy.rows[0] && !policy.rows[0].local_enabled)
        return send(res,409,{error:"Enable local sign-in before disabling LDAP"});
    }
    const db=await pool.connect();
    let revoked=[];
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE",[tenant]);
      if (!enabled) {
        const policy=await db.query("SELECT local_enabled FROM tenant_auth_policy WHERE tenant_id=$1",[tenant]);
        if (policy.rows[0] && !policy.rows[0].local_enabled) {
          await db.query("ROLLBACK");return send(res,409,{error:"Enable local sign-in before disabling LDAP"});
        }
      }
      await db.query("INSERT INTO tenant_ldap_settings(tenant_id,enabled) VALUES($1,$2) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)",[tenant,enabled]);
      if (!enabled) {
        revoked=(await db.query("SELECT id FROM users WHERE tenant_id=$1 AND auth_source='ldap'",[tenant])).rows;
        await db.query("DELETE s FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.tenant_id=$1 AND u.auth_source='ldap'",[tenant]);
      }
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)",
        [randomUUID(),tenant,user.id,enabled?"ldap_enabled":"ldap_disabled"]);
      await db.query("COMMIT");
      for(const account of revoked) meetingSignaling?.closeUser?.(account.id);
      return send(res,200,{enabled});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  if (path==="/api/admin/ldap/mappings" && req.method==="POST") {
    const {groupDn,groupId}=await readJson(req);
    let dn;
    try {dn=normalizeDn(groupDn);} catch {return send(res,400,{error:"Valid LDAP group DN required"});}
    if (!uuid.test(groupId||"")) return send(res,400,{error:"Valid app group required"});
    const group=await pool.query("SELECT id FROM user_groups WHERE id=$1 AND tenant_id=$2",[groupId,tenant]);
    if (!group.rowCount) return send(res,404,{error:"App group unavailable"});
    const id=randomUUID();
    try {await pool.query("INSERT INTO ldap_group_mappings(id,tenant_id,group_dn,group_id) VALUES($1,$2,$3,$4)",[id,tenant,dn,groupId]);}
    catch(error) {if(error.code==="ER_DUP_ENTRY") return send(res,409,{error:"Mapping exists"});throw error;}
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'ldap_mapping_added')",[randomUUID(),tenant,user.id,id]);
    return send(res,201,{id,groupDn:dn,groupId});
  }
  const remove=/^\/api\/admin\/ldap\/mappings\/([0-9a-f-]{36})$/i.exec(path);
  if (remove && req.method==="DELETE") {
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE",[tenant]);
      const policy=await db.query("SELECT local_enabled FROM tenant_auth_policy WHERE tenant_id=$1",[tenant]);
      if (policy.rows[0] && !policy.rows[0].local_enabled) {
        const count=await db.query("SELECT COUNT(*) AS total FROM ldap_group_mappings WHERE tenant_id=$1",[tenant]);
        if (Number(count.rows[0]?.total)<=1) {
          await db.query("ROLLBACK");return send(res,409,{error:"Enable local sign-in before removing the last LDAP mapping"});
        }
      }
      const result=await db.query("DELETE FROM ldap_group_mappings WHERE id=$1 AND tenant_id=$2",[remove[1],tenant]);
      if (!result.rowCount) {await db.query("ROLLBACK");return send(res,404,{error:"Mapping unavailable"});}
      const revoked=await db.query("SELECT id FROM users WHERE tenant_id=$1 AND auth_source='ldap'",[tenant]);
      await db.query("DELETE s FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.tenant_id=$1 AND u.auth_source='ldap'",[tenant]);
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'ldap_mapping_removed')",[randomUUID(),tenant,user.id,remove[1]]);
      await db.query("COMMIT");
      for(const account of revoked.rows) meetingSignaling?.closeUser?.(account.id);
      return send(res,200,{status:"removed"});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  return send(res,404,{error:"LDAP route unavailable"});
}
