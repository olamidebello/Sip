import {isAdmin} from './tenancy.js';
export async function migratePasskeyPolicy(pool){
  const column=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='sessions' AND column_name='auth_method'");
  if(!column.rowCount)await pool.query("ALTER TABLE sessions ADD COLUMN auth_method VARCHAR(12) NOT NULL DEFAULT 'password'");
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_passkey_policy(tenant_id CHAR(36) PRIMARY KEY,mode VARCHAR(12) NOT NULL,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS group_passkey_policy(group_id CHAR(36) PRIMARY KEY,mode VARCHAR(12) NOT NULL,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(group_id) REFERENCES user_groups(id) ON DELETE CASCADE,FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_passkey_policy(user_id CHAR(36) PRIMARY KEY,mode VARCHAR(12) NOT NULL,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function effectivePasskeyMode(pool,user){
  if(user.auth_source&&user.auth_source!=='local')return 'optional';
  const [individual,groups,tenant]=await Promise.all([
    pool.query('SELECT mode FROM user_passkey_policy WHERE user_id=$1',[user.id]),
    pool.query('SELECT p.mode FROM group_passkey_policy p JOIN user_group_members m ON m.group_id=p.group_id JOIN user_groups g ON g.id=m.group_id WHERE m.user_id=$1 AND g.tenant_id=$2',[user.id,user.tenant_id]),
    pool.query('SELECT mode FROM tenant_passkey_policy WHERE tenant_id=$1',[user.tenant_id])]);
  const own=individual.rows[0]?.mode;if(own&&own!=='inherit')return own;
  if(groups.rows.some(row=>row.mode==='required'))return 'required';
  return tenant.rows[0]?.mode||'optional';
}
export async function passkeyGate(pool,user){
  if(user.auth_source!=='local'||user.auth_method==='passkey'||await effectivePasskeyMode(pool,user)!=='required')return null;
  const keys=await pool.query('SELECT 1 FROM passkeys WHERE user_id=$1 LIMIT 1',[user.id]);
  return keys.rowCount?'signin':'enroll';
}
export async function handlePasskeyPolicy({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator permission required'});
  if(path==='/api/admin/passkey-policy'&&req.method==='GET'){
    const [tenant,groups,users]=await Promise.all([
      pool.query('SELECT mode FROM tenant_passkey_policy WHERE tenant_id=$1',[user.tenant_id]),
      pool.query('SELECT g.id,g.name,p.mode FROM user_groups g LEFT JOIN group_passkey_policy p ON p.group_id=g.id WHERE g.tenant_id=$1 ORDER BY g.name LIMIT 200',[user.tenant_id]),
      pool.query("SELECT u.id,u.email,p.mode FROM users u LEFT JOIN user_passkey_policy p ON p.user_id=u.id WHERE u.tenant_id=$1 AND u.status='active' AND u.auth_source='local' ORDER BY u.email LIMIT 500",[user.tenant_id])]);
    return send(res,200,{tenantMode:tenant.rows[0]?.mode||'optional',groups:groups.rows,users:users.rows});
  }
  if(path==='/api/admin/passkey-policy'&&req.method==='PUT'){
    const {mode}=await readJson(req);if(!['optional','required'].includes(mode))return send(res,400,{error:'Valid mode required'});
    await pool.query('INSERT INTO tenant_passkey_policy(tenant_id,mode,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE mode=$4,updated_by=$5',[user.tenant_id,mode,user.id,mode,user.id]);return send(res,200,{mode});
  }
  const m=/^\/api\/admin\/passkey-policy\/(groups|users)\/([0-9a-f-]{36})$/.exec(path);
  if(m&&req.method==='PUT'){
    const {mode}=await readJson(req);if(!['inherit','optional','required'].includes(mode))return send(res,400,{error:'Valid mode required'});
    const group=m[1]==='groups',table=group?'group_passkey_policy':'user_passkey_policy',column=group?'group_id':'user_id';
    const found=group?await pool.query('SELECT id FROM user_groups WHERE id=$1 AND tenant_id=$2',[m[2],user.tenant_id]):
      await pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND auth_source='local'",[m[2],user.tenant_id]);
    if(!found.rowCount)return send(res,404,{error:'Target unavailable'});
    await pool.query(`INSERT INTO ${table}(${column},mode,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE mode=$4,updated_by=$5`,[m[2],mode,user.id,mode,user.id]);return send(res,200,{mode});
  }
  return send(res,404,{error:'Policy route unavailable'});
}
