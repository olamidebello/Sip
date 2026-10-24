import {tokenHash} from './security.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateSessionPolicy(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS user_session_policy (
    user_id CHAR(36) PRIMARY KEY, max_sessions INT NOT NULL DEFAULT 1,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK(max_sessions BETWEEN 1 AND 20)
  ) ENGINE=InnoDB`);
  const column=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='sessions' AND column_name='created_at'");
  if(!column.rowCount)await pool.query('ALTER TABLE sessions ADD COLUMN created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ADD INDEX sessions_user_created(user_id,created_at)');
}
export function validateSessionLimit(value){
  if(!Number.isInteger(value)||value<1||value>20)throw new Error('Maximum sessions must be an integer from 1 to 20');
  return value;
}
async function trim(db,userId,limit,newHash=null){
  await db.query('DELETE FROM sessions WHERE user_id=$1 AND expires_at<=UTC_TIMESTAMP(3)',[userId]);
  const result=await db.query('SELECT token_hash FROM sessions WHERE user_id=$1 ORDER BY (token_hash=$2) DESC,created_at DESC,token_hash DESC FOR UPDATE',[userId,newHash||'']);
  const revoked=result.rows.slice(limit).map(row=>row.token_hash);
  for(const hash of revoked)await db.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash=$2',[userId,hash]);
  return revoked;
}
// Serialize all logins and limit changes per user, including across API replicas.
export async function createLimitedSession(pool,{userId,token,seconds=604800,authMethod='password'}){
  if(![3600,604800].includes(seconds)||!['password','passkey','justisolve'].includes(authMethod))throw new Error('Invalid session configuration');
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const user=await db.query("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[userId]);
    if(!user.rowCount)throw new Error('Account unavailable');
    const policy=await db.query('SELECT max_sessions FROM user_session_policy WHERE user_id=$1',[userId]);
    const limit=validateSessionLimit(Number(policy.rows[0]?.max_sessions??1));
    const hash=tokenHash(token);
    await db.query('INSERT INTO sessions(token_hash,user_id,expires_at,auth_method) VALUES($1,$2,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL $3 SECOND),$4)',[hash,userId,seconds,authMethod]);
    const revoked=await trim(db,userId,limit,hash);
    await db.query('COMMIT');return revoked;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function handleSessionPolicy({req,res,path,user,pool,send,readJson,closeSessions}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super admin required'});
  if(path==='/api/admin/user-sessions'&&req.method==='GET'){
    const users=await pool.query(`SELECT u.id,u.display_name,u.email,u.role,COALESCE(p.max_sessions,1) AS max_sessions,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>UTC_TIMESTAMP(3)) AS active_sessions
      FROM users u LEFT JOIN user_session_policy p ON p.user_id=u.id WHERE u.tenant_id=$1 ORDER BY u.display_name,u.id LIMIT 500`,[user.tenant_id]);
    return send(res,200,{defaultMaxSessions:1,users:users.rows});
  }
  const match=/^\/api\/admin\/user-sessions\/([^/]+)$/.exec(path);
  if(!match||!uuid.test(match[1])||req.method!=='PUT')return send(res,404,{error:'Session policy route unavailable'});
  let limit;try{limit=validateSessionLimit((await readJson(req)).maxSessions);}catch(error){return send(res,400,{error:error.message});}
  const db=await pool.connect();let revoked;
  try{
    await db.query('BEGIN');
    const target=await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[match[1],user.tenant_id]);
    if(!target.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'User unavailable in selected tenant'});}
    await db.query('INSERT INTO user_session_policy(user_id,max_sessions) VALUES($1,$2) ON DUPLICATE KEY UPDATE max_sessions=$3',[match[1],limit,limit]);
    revoked=await trim(db,match[1],limit);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  closeSessions?.(revoked);
  return send(res,200,{userId:match[1],maxSessions:limit,revokedSessions:revoked.length});
}
