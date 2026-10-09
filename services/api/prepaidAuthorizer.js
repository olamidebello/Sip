import {randomUUID} from 'node:crypto';
import {postJournal} from './billingLedger.js';
import {timingSafeEqual} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migratePrepaidAuthorizer(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS prepaid_accounts (
    tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
    available_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,reserved_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY(tenant_id,user_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS prepaid_calls (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
    source VARCHAR(80) NOT NULL,leg_id VARCHAR(80) NOT NULL,
    rate_id CHAR(36) NOT NULL,price_cents INT UNSIGNED NOT NULL,
    reserved_cents BIGINT UNSIGNED NOT NULL,authorized_seconds INT UNSIGNED NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'active',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    closed_at DATETIME(3) NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(rate_id) REFERENCES operator_tariff_rates(id),
    UNIQUE KEY prepaid_leg(tenant_id,source,leg_id),INDEX prepaid_user(tenant_id,user_id,status)
  ) ENGINE=InnoDB`);
}

// Reserve a bounded call window before routing. The switch must send BYE at
// maxSeconds; the end event settles actual answered duration and refunds unused
// minutes. No unbounded balance-based session is ever authorized.
export async function reserveMinute(pool,{tenant,user,source,legId,rateId,priceCents,maxMinutes=10}){
  if(!uuid.test(tenant)||!uuid.test(user)||!uuid.test(rateId)||
    !/^[a-zA-Z0-9_.:+-]{1,80}$/.test(source)||!/^[a-zA-Z0-9_.:+-]{1,80}$/.test(legId)||
    !Number.isSafeInteger(priceCents)||priceCents<1||priceCents>1000000||
    !Number.isSafeInteger(maxMinutes)||maxMinutes<1||maxMinutes>60)
    throw new RangeError('Invalid prepaid request');
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const account=await db.query('SELECT available_cents,reserved_cents FROM prepaid_accounts WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',[tenant,user]);
    const prior=await db.query('SELECT id,status,rate_id,price_cents,authorized_seconds FROM prepaid_calls WHERE tenant_id=$1 AND source=$2 AND leg_id=$3 FOR UPDATE',[tenant,source,legId]);
    if(prior.rowCount){
      await db.query('ROLLBACK');
      const row=prior.rows[0];
      if(row.status!=='active'||row.rate_id!==rateId||Number(row.price_cents)!==priceCents) return {authorized:false,reason:'Call ID conflict'};
      return {authorized:true,duplicate:true,callId:row.id,maxSeconds:Number(row.authorized_seconds)};
    }
    const available=Number(account.rows[0]?.available_cents);
    if(!account.rowCount||!Number.isSafeInteger(available)||available<priceCents){await db.query('ROLLBACK');return {authorized:false,reason:'Insufficient prepaid funds'};}
    const minutes=Math.min(maxMinutes,Math.floor(available/priceCents));
    const reserved=minutes*priceCents,seconds=minutes*60;
    if(!Number.isSafeInteger(reserved))throw new RangeError('Reservation overflow');
    const id=randomUUID();
    await db.query('UPDATE prepaid_accounts SET available_cents=available_cents-$1,reserved_cents=reserved_cents+$1 WHERE tenant_id=$2 AND user_id=$3',[reserved,tenant,user]);
    await db.query('INSERT INTO prepaid_calls(id,tenant_id,user_id,source,leg_id,rate_id,price_cents,reserved_cents,authorized_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id,tenant,user,source,legId,rateId,priceCents,reserved,seconds]);
    await db.query('COMMIT');return {authorized:true,callId:id,maxSeconds:seconds};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function extendMinute(pool,{tenant,callId,expectedSeconds}){
  if(!uuid.test(tenant)||!uuid.test(callId)||!Number.isSafeInteger(expectedSeconds)||expectedSeconds<60)
    throw new RangeError('Invalid extension');
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const call=await db.query('SELECT user_id,price_cents,authorized_seconds,status FROM prepaid_calls WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,callId]);
    if(!call.rowCount||call.rows[0].status!=='active'){await db.query('ROLLBACK');return {authorized:false,reason:'Call unavailable'};}
    const row=call.rows[0],seconds=Number(row.authorized_seconds);
    if(expectedSeconds<seconds){await db.query('ROLLBACK');return {authorized:true,duplicate:true,maxSeconds:seconds};}
    if(expectedSeconds!==seconds||seconds>=2592000){await db.query('ROLLBACK');return {authorized:false,reason:'Invalid reservation sequence'};}
    const account=await db.query('SELECT available_cents FROM prepaid_accounts WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',[tenant,row.user_id]);
    const cents=Number(row.price_cents);
    if(!account.rowCount||Number(account.rows[0].available_cents)<cents){await db.query('ROLLBACK');return {authorized:false,reason:'Insufficient prepaid funds',maxSeconds:seconds};}
    await db.query('UPDATE prepaid_accounts SET available_cents=available_cents-$1,reserved_cents=reserved_cents+$1 WHERE tenant_id=$2 AND user_id=$3',[cents,tenant,row.user_id]);
    await db.query('UPDATE prepaid_calls SET reserved_cents=reserved_cents+$1,authorized_seconds=authorized_seconds+60 WHERE tenant_id=$2 AND id=$3',[cents,tenant,callId]);
    await db.query('COMMIT');return {authorized:true,maxSeconds:seconds+60};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function closePrepaidCall(pool,{tenant,user,callId,billableSeconds}){
  if(!uuid.test(tenant)||!uuid.test(user)||!uuid.test(callId)||!Number.isSafeInteger(billableSeconds)||billableSeconds<0)
    throw new RangeError('Invalid close request');
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const found=await db.query('SELECT user_id,price_cents,reserved_cents,authorized_seconds,status FROM prepaid_calls WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,callId]);
    if(!found.rowCount){await db.query('ROLLBACK');return {closed:false,reason:'Call unavailable'};}
    const call=found.rows[0];
    if(call.user_id!==user){await db.query('ROLLBACK');return {closed:false,reason:'Call owner mismatch'};}
    if(call.status==='closed'){await db.query('ROLLBACK');return {closed:true,duplicate:true};}
    if(billableSeconds>Number(call.authorized_seconds)){await db.query('ROLLBACK');return {closed:false,reason:'Duration exceeds authorization'};}
    const charge=Math.ceil(billableSeconds/60)*Number(call.price_cents),held=Number(call.reserved_cents);
    if(!Number.isSafeInteger(charge)||!Number.isSafeInteger(held)||charge>held)throw new RangeError('Invalid reservation balance');
    await db.query('SELECT available_cents,reserved_cents FROM prepaid_accounts WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',[tenant,call.user_id]);
    await db.query('UPDATE prepaid_accounts SET available_cents=available_cents+$1,reserved_cents=reserved_cents-$2 WHERE tenant_id=$3 AND user_id=$4',[held-charge,held,tenant,call.user_id]);
    if(charge)await postJournal(db,{tenant,sourceType:'prepaid_call',sourceId:callId,debit:'prepaid_liability',credit:'revenue',amountCents:charge});
    await db.query("UPDATE prepaid_calls SET status='closed',closed_at=UTC_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2",[tenant,callId]);
    await db.query('COMMIT');return {closed:true,chargeCents:charge,refundedCents:held-charge};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function handlePrepaid({req,res,pool,send,readJson}){
  if(process.env.LIVE_PREPAID_ENABLED!=='true'||process.env.LIVE_PREPAID_SWITCH_VERIFIED!=='true')
    return send(res,503,{error:'Prepaid authorization or switch cutoff is not commissioned'});
  const key=process.env.KAMAILIO_ROUTE_TOKEN||'',supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
  const a=Buffer.from(key),b=Buffer.from(supplied);
  if(a.length<32||a.length!==b.length||!timingSafeEqual(a,b))return send(res,401,{error:'Unauthorized'});
  if(req.method!=='POST')return send(res,405,{error:'POST required'});
  let body;try{body=await readJson(req);}catch{return send(res,400,{error:'Invalid request'});}
  if(!uuid.test(body?.tenantId||'')||!uuid.test(body?.userId||''))return send(res,400,{error:'Tenant and user required'});
  try{
    if(body.action==='start'){
      if(!uuid.test(body.rateId||'')|| !/^\+[1-9]\d{7,14}$/.test(body.destination||'')||
        !/^[a-z0-9][a-z0-9.-]{1,253}$/.test(body.domain||'')||!/^[a-z0-9]{2,64}$/.test(body.caller||''))
        return send(res,400,{error:'Rate, destination and SIP identity required'});
      const found=await pool.query(`SELECT r.id,r.price_cents,r.prefix FROM operator_tariff_rates r
        JOIN operator_tariffs t ON t.id=r.tariff_id AND t.tenant_id=r.tenant_id AND t.enabled=TRUE
        JOIN switch_tenants st ON st.tenant_id=r.tenant_id AND st.tariff_id=r.tariff_id AND st.domain=$4 AND st.enabled=TRUE
        JOIN sip_accounts s ON s.tenant_id=st.tenant_id AND s.domain=st.domain AND s.username=$5
          AND s.user_id=$2 AND s.status='active'
        JOIN users u ON u.id=s.user_id AND u.tenant_id=r.tenant_id AND u.status='active'
        JOIN carrier_provider_profiles c ON c.tenant_id=r.tenant_id AND c.provider=r.provider AND c.status='active'
        WHERE r.id=$3 AND r.tenant_id=$1 AND r.enabled=TRUE AND r.effective_at<=UTC_TIMESTAMP(3)
        AND (r.expires_at IS NULL OR r.expires_at>UTC_TIMESTAMP(3))`,
        [body.tenantId,body.userId,body.rateId,body.domain,body.caller]);
      if(!found.rowCount||!body.destination.slice(1).startsWith(found.rows[0].prefix))
        return send(res,404,{error:'Eligible tenant rate or SIP account unavailable'});
      const policy=await pool.query('SELECT enabled,max_call_minutes FROM billing_tenant_policy WHERE tenant_id=$1',[body.tenantId]);
      if(!policy.rowCount||!policy.rows[0].enabled)
        return send(res,409,{error:'Tenant prepaid authorization is disabled'});
      const result=await reserveMinute(pool,{tenant:body.tenantId,user:body.userId,source:body.source,legId:body.legId,
        rateId:body.rateId,priceCents:Number(found.rows[0].price_cents),maxMinutes:Number(policy.rows[0].max_call_minutes)});
      return send(res,result.authorized?200:402,result);
    }
    if(body.action==='extend'){
      return send(res,409,{error:'Live extension requires verified switch timeout renewal; use the preauthorized window'});
    }
    if(body.action==='end'){
      const result=await closePrepaidCall(pool,{tenant:body.tenantId,user:body.userId,callId:body.callId,billableSeconds:body.billableSeconds});
      return send(res,result.closed?200:409,result);
    }
  }catch(error){if(error instanceof RangeError)return send(res,400,{error:error.message});throw error;}
  return send(res,400,{error:'Unknown prepaid action'});
}
