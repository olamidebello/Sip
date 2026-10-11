import {randomUUID} from 'node:crypto';

export async function migrateBillingControl(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_tenant_policy (
    tenant_id CHAR(36) PRIMARY KEY,max_call_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,updated_by CHAR(36) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_policy_events (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
    action VARCHAR(32) NOT NULL,max_call_minutes SMALLINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id),
    INDEX billing_policy_audit(tenant_id,created_at)
  ) ENGINE=InnoDB`);
}

export async function handleBillingControl({req,res,user,pool,send,readJson}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  const tenant=user.tenant_id;
  if(req.method==='GET'){
    const [policy,accounts,calls,rates,events]=await Promise.all([
      pool.query('SELECT enabled,max_call_minutes,updated_at FROM billing_tenant_policy WHERE tenant_id=$1',[tenant]),
      pool.query('SELECT COUNT(*) AS total FROM prepaid_accounts WHERE tenant_id=$1',[tenant]),
      pool.query("SELECT COUNT(*) AS total FROM prepaid_calls WHERE tenant_id=$1 AND status='active'",[tenant]),
      pool.query('SELECT COUNT(*) AS total FROM operator_tariff_rates WHERE tenant_id=$1 AND enabled=TRUE',[tenant]),
      pool.query('SELECT action,max_call_minutes,created_at FROM billing_policy_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30',[tenant])]);
    const globalEnabled=process.env.LIVE_PREPAID_ENABLED==='true'&&process.env.LIVE_PREPAID_SWITCH_VERIFIED==='true';
    return send(res,200,{policy:policy.rows[0]||{enabled:false,max_call_minutes:10},
      globalEnabled,prepaidAccounts:Number(accounts.rows[0]?.total||0),activeReservations:Number(calls.rows[0]?.total||0),
      activeRates:Number(rates.rows[0]?.total||0),events:events.rows,
      deployable:false,note:'Host activation requires a reviewed Kamailio cutover with a hard dialog timeout, end callbacks, funding reconciliation, and real call tests. This panel only controls the tenant policy.'});
  }
  if(req.method==='PUT'){
    const input=await readJson(req);
    if(!Number.isSafeInteger(input.maxCallMinutes)||input.maxCallMinutes<1||input.maxCallMinutes>60||typeof input.enabled!=='boolean')
      return send(res,400,{error:'Choose a 1–60 minute call window and an enabled flag'});
    if(input.enabled&&(process.env.LIVE_PREPAID_ENABLED!=='true'||process.env.LIVE_PREPAID_SWITCH_VERIFIED!=='true'))
      return send(res,409,{error:'Host prepaid authorization and switch enforcement must both be verified first'});
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query(`INSERT INTO billing_tenant_policy(tenant_id,max_call_minutes,enabled,updated_by)
        VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE max_call_minutes=VALUES(max_call_minutes),
        enabled=VALUES(enabled),updated_by=VALUES(updated_by)`,[tenant,input.maxCallMinutes,input.enabled,user.id]);
      await db.query('INSERT INTO billing_policy_events(id,tenant_id,actor_id,action,max_call_minutes) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(),tenant,user.id,input.enabled?'enabled':'disabled',input.maxCallMinutes]);
      await db.query('COMMIT');return send(res,200,{enabled:input.enabled,maxCallMinutes:input.maxCallMinutes});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  return send(res,405,{error:'GET or PUT required'});
}
