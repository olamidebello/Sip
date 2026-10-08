import { randomUUID } from "node:crypto";
import { isAdmin } from "./tenancy.js";
import { hashPassword,verifyPassword } from "./security.js";

export async function migrateAccess(pool) {
  const column=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='status'");
  if (!column.rowCount) await pool.query("ALTER TABLE users ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active', ADD INDEX users_tenant_status (tenant_id,status)");
  for (const [column,ddl] of [
    ['username','ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL UNIQUE'],
    ['must_change_password','ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE']
  ]) {
    const found=await pool.query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=\'users\' AND column_name=$1',[column]);
    if(!found.rowCount) await pool.query(ddl);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS security_events (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
    target_id CHAR(36) NULL,action VARCHAR(40) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX security_events_tenant_created (tenant_id,created_at)
  ) ENGINE=InnoDB`);
}

export async function handleAccess({req,res,path,user,pool,send,readJson,sessionHash,meetingSignaling}) {
  if (path==="/api/account/password" && req.method==="POST") {
    if (user.auth_source==="ldap") return send(res,403,{error:"Change your directory password with your LDAP administrator"});
    const {currentPassword,newPassword}=await readJson(req);
    if (typeof currentPassword!=="string" || typeof newPassword!=="string" ||
        newPassword.length<12 || newPassword.length>1024 || currentPassword.length>1024)
      return send(res,400,{error:"Current password and new password of 12–1024 characters required"});
    const account=(await pool.query("SELECT password_salt,password_hash FROM users WHERE id=$1 AND status='active'",[user.id])).rows[0];
    if (!account || !await verifyPassword(currentPassword,account.password_salt,account.password_hash))
      return send(res,403,{error:"Current password incorrect"});
    const {salt,hash}=await hashPassword(newPassword);
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("UPDATE users SET password_salt=$1,password_hash=$2,must_change_password=FALSE WHERE id=$3 AND password_hash=$4",[salt,hash,user.id,account.password_hash]);
      const changed=await db.query("SELECT password_hash FROM users WHERE id=$1",[user.id]);
      if (changed.rows[0]?.password_hash!==hash) {await db.query("ROLLBACK");return send(res,409,{error:"Password changed concurrently, retry"});}
      await db.query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2",[user.id,sessionHash]);
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'password_changed')",[randomUUID(),user.tenant_id,user.id,user.id]);
      await db.query("COMMIT");
      meetingSignaling?.closeUser?.(user.id);
      return send(res,200,{status:"Password changed; other sessions revoked"});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (path==="/api/admin/security/events" && req.method==="GET") {
    const result=await pool.query("SELECT actor_id,target_id,action,created_at FROM security_events WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",[user.tenant_id]);
    return send(res,200,{events:result.rows});
  }
  const group=/^\/api\/admin\/groups\/([0-9a-f-]{36})\/delete$/i.exec(path);
  if (group && req.method==="POST") {
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      const selected=(await db.query("SELECT id,name FROM user_groups WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[group[1],user.tenant_id])).rows[0];
      if (!selected) {await db.query("ROLLBACK");return send(res,404,{error:"Group unavailable"});}
      const members=await db.query("SELECT COUNT(*) AS total FROM user_group_members WHERE group_id=$1",[group[1]]);
      if (selected.name==="Standard" || Number(members.rows[0].total)>0) {
        await db.query("ROLLBACK");return send(res,409,{error:"Standard or nonempty group cannot be deleted"});
      }
      await db.query("DELETE FROM user_groups WHERE id=$1 AND tenant_id=$2",[group[1],user.tenant_id]);
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'group_deleted')",[randomUUID(),user.tenant_id,user.id,group[1]]);
      await db.query("COMMIT");return send(res,200,{status:"deleted"});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  const target=/^\/api\/admin\/users\/([0-9a-f-]{36})\/security$/i.exec(path);
  if (target && req.method==="POST") {
    const {action}=await readJson(req);
    if (!["suspend","activate","revoke_sessions","promote","demote"].includes(action))
      return send(res,400,{error:"Invalid security action"});
    if (target[1]===user.id && action!=="revoke_sessions")
      return send(res,409,{error:"Use another administrator for changes to your account"});
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE",[user.tenant_id]);
      const account=(await db.query("SELECT id,role,status FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[target[1],user.tenant_id])).rows[0];
      if (!account) {await db.query("ROLLBACK");return send(res,404,{error:"User unavailable"});}
      if (account.role==='admin' && user.role!=='super_admin' && action!=='revoke_sessions')
        {await db.query('ROLLBACK');return send(res,403,{error:'Super administrator required to manage administrators'});}
      if (action==='promote' && user.role!=='super_admin')
        {await db.query('ROLLBACK');return send(res,403,{error:'Super administrator required to appoint administrators'});}
      if (account.role==="super_admin" && target[1]!==user.id) {await db.query("ROLLBACK");return send(res,403,{error:"Super admin account protected"});}
      if ((action==="suspend" || action==="demote") && account.role==="admin") {
        const active=await db.query("SELECT COUNT(*) AS total FROM users WHERE tenant_id=$1 AND role='admin' AND status='active'",[user.tenant_id]);
        if (Number(active.rows[0].total)<=1) {await db.query("ROLLBACK");return send(res,409,{error:"Cannot remove last active tenant administrator"});}
      }
      if (action==="suspend" || action==="activate")
        await db.query("UPDATE users SET status=$1 WHERE id=$2",[action==="suspend"?"suspended":"active",account.id]);
      if (action==="promote" || action==="demote")
        await db.query("UPDATE users SET role=$1 WHERE id=$2",[action==="promote"?"admin":"user",account.id]);
      if (action!=="activate") await db.query("DELETE FROM sessions WHERE user_id=$1",[account.id]);
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(),user.tenant_id,user.id,account.id,action]);
      await db.query("COMMIT");
      if (action!=="activate") meetingSignaling?.closeUser?.(account.id);
      return send(res,200,{action,status:action==="suspend"?"suspended":action==="activate"?"active":account.status});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  return send(res,404,{error:"Security route unavailable"});
}
