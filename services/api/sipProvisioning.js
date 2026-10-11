import { randomBytes } from 'node:crypto';
import { createSipAccount, provisionSipAccount, credentialKey, encrypt } from './sipMarketplace.js';
import { isAdmin } from './tenancy.js';

export async function migrateSipProvisioning(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS sip_provisioning_jobs (
    account_id CHAR(36) PRIMARY KEY, attempts INT NOT NULL DEFAULT 0,
    next_attempt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_result VARCHAR(64) NOT NULL DEFAULT 'pending',
    FOREIGN KEY(account_id) REFERENCES sip_accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

export function provisioningConfigured() {
  return !!credentialKey() && (process.env.SIP_PROVISION_MODE==='kamailio_local'||(/^https:\/\//.test(process.env.SIP_PROVISION_URL || '') && !!process.env.SIP_PROVISION_TOKEN));
}

// The session lock serializes account creation and retries across API replicas.
export async function reconcileSipAccounts(pool, origin) {
  const db=await pool.connect(); let locked=false;
  try {
    locked=Number((await db.query("SELECT GET_LOCK('olamide_sip_provisioning',0) AS acquired")).rows[0]?.acquired)===1;
    if(!locked) return;
    const domain=process.env.SIP_ACCOUNT_DOMAIN || new URL(origin).hostname;
    const users=(await db.query(`SELECT u.id FROM users u JOIN tenants t ON t.id=u.tenant_id
      LEFT JOIN sip_accounts a ON a.user_id=u.id WHERE u.status='active' AND t.status='active'
      AND a.id IS NULL ORDER BY u.id LIMIT 50`)).rows;
    for(const user of users) await createSipAccount(db,user.id,domain);
    if(process.env.SIP_PROVISION_MODE==='kamailio_local') await db.query(`UPDATE sip_accounts a
      JOIN users u ON u.id=a.user_id AND u.status='active' JOIN tenants t ON t.id=a.tenant_id AND t.status='active'
      LEFT JOIN olamide_sip_subscribers c ON c.account_id=a.id
      SET a.status='awaiting_switch' WHERE a.status='active' AND (c.account_id IS NULL OR c.username<>a.username OR c.domain<>a.domain)`);
    await db.query(`INSERT IGNORE INTO sip_provisioning_jobs(account_id)
      SELECT id FROM sip_accounts WHERE status='awaiting_switch'`);
    const pending=(await db.query(`SELECT a.id,a.user_id,a.secret_cipher,j.attempts FROM sip_accounts a
      JOIN sip_provisioning_jobs j ON j.account_id=a.id JOIN users u ON u.id=a.user_id
      JOIN tenants t ON t.id=u.tenant_id WHERE a.status='awaiting_switch' AND u.status='active'
      AND t.status='active' AND j.next_attempt<=NOW(3) ORDER BY j.next_attempt,a.id LIMIT 10`)).rows;
    for(const account of pending) {
      const key=credentialKey();
      if(key&&!account.secret_cipher) await db.query('UPDATE sip_accounts SET secret_cipher=$1 WHERE id=$2 AND secret_cipher IS NULL',
        [encrypt(randomBytes(32).toString('base64url'),key),account.id]);
      const configured=provisioningConfigured();
      const active=configured && await provisionSipAccount(db,account.user_id);
      const delay=Math.min(3600,30*2**Math.min(Number(account.attempts),7));
      await db.query(`UPDATE sip_provisioning_jobs SET attempts=attempts+1,
        next_attempt=TIMESTAMPADD(SECOND,$1,NOW(3)),last_result=$2 WHERE account_id=$3`,
        [delay,active?'active':configured?'retry_pending':'configuration_required',account.id]);
    }
  } finally {
    try { if(locked) await db.query("SELECT RELEASE_LOCK('olamide_sip_provisioning')"); }
    finally { db.release(); }
  }
}

export function startSipProvisioning(pool,origin) {
  let stopped=false,timer;
  async function tick() {
    try { await reconcileSipAccounts(pool,origin); }
    catch(error) { console.error('SIP reconciliation pending',error.code||error.name); }
    if(!stopped) { timer=setTimeout(tick,30000);timer.unref?.(); }
  }
  void tick();
  return ()=>{stopped=true;clearTimeout(timer);};
}

export async function handleSipProvisioning({req,res,path,user,pool,send}) {
  if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});
  if(path==='/api/admin/sip-provisioning'&&req.method==='GET') {
    const result=await pool.query(`SELECT a.id,a.username,a.domain,a.status,u.email,
      j.attempts,j.next_attempt,j.last_result FROM sip_accounts a JOIN users u ON u.id=a.user_id
      LEFT JOIN sip_provisioning_jobs j ON j.account_id=a.id WHERE a.tenant_id=$1
      ORDER BY a.created_at DESC LIMIT 500`,[user.tenant_id]);
    return send(res,200,{configured:provisioningConfigured(),mode:process.env.SIP_PROVISION_MODE==='kamailio_local'?'kamailio_local':'remote',accounts:result.rows});
  }
  if(path==='/api/admin/sip-provisioning/retry'&&req.method==='POST') {
    await pool.query(`UPDATE sip_provisioning_jobs j JOIN sip_accounts a ON a.id=j.account_id
      SET j.next_attempt=NOW(3),j.attempts=0 WHERE a.tenant_id=$1 AND a.status='awaiting_switch'`,[user.tenant_id]);
    return send(res,202,{status:'queued'});
  }
  return send(res,404,{error:'Not found'});
}
