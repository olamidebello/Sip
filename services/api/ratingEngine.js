// Monetary amounts are integer USD cents. A rate is cents per started minute.
import {randomUUID} from 'node:crypto';
import {isAdmin} from './tenancy.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function rateCall({billableSeconds,priceCents,costCents}){
  if(!Number.isSafeInteger(billableSeconds)||billableSeconds<0||billableSeconds>2592000||
    !Number.isSafeInteger(priceCents)||priceCents<0||priceCents>1000000||
    !Number.isSafeInteger(costCents)||costCents<0||costCents>1000000)
    throw new RangeError('Invalid rating inputs');
  const units=Math.ceil(billableSeconds/60);
  const chargeCents=units*priceCents,costTotalCents=units*costCents;
  if(!Number.isSafeInteger(chargeCents)||!Number.isSafeInteger(costTotalCents))throw new RangeError('Rating overflow');
  return {units,chargeCents,costTotalCents,marginCents:chargeCents-costTotalCents};
}

export async function migrateRatingEngine(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS rated_call_records (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,cdr_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,rate_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    price_cents INT UNSIGNED NOT NULL,cost_cents INT UNSIGNED NOT NULL,
    billable_seconds INT UNSIGNED NOT NULL,units INT UNSIGNED NOT NULL,
    charge_cents BIGINT UNSIGNED NOT NULL,cost_total_cents BIGINT UNSIGNED NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(cdr_id) REFERENCES cdr_records(id),
    FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(rate_id) REFERENCES operator_tariff_rates(id),
    UNIQUE KEY rated_leg(tenant_id,cdr_id),INDEX rated_provider_period(tenant_id,provider,created_at)
  ) ENGINE=InnoDB`);
}

export async function handleRating({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  const tenant=user.tenant_id;
  if(path==='/api/admin/rating'&&req.method==='GET'){
    const result=await pool.query(`SELECT r.id,r.cdr_id,r.user_id,r.provider,r.price_cents,r.cost_cents,r.units,
      r.charge_cents,r.cost_total_cents,r.status,r.created_at FROM rated_call_records r
      WHERE r.tenant_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,[tenant]);
    return send(res,200,{records:result.rows,note:'Draft ratings are reviewed snapshots. They do not debit balances or invoice customers.'});
  }
  if(path==='/api/admin/rating'&&req.method==='POST'){
    const b=await readJson(req);
    if(!uuid.test(b.cdrId||'')||!uuid.test(b.userId||'')||!uuid.test(b.rateId||''))
      return send(res,400,{error:'CDR, user and rate IDs required'});
    const [cdr,userRow,rate]=await Promise.all([
      pool.query("SELECT id,callee_e164,billable_seconds,started_at FROM cdr_records WHERE id=$1 AND tenant_id=$2 AND direction='outbound' AND disposition='answered'",[b.cdrId,tenant]),
      pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2",[b.userId,tenant]),
      pool.query(`SELECT id,provider,prefix,price_cents,cost_cents,effective_at,expires_at
        FROM operator_tariff_rates WHERE id=$1 AND tenant_id=$2`,[b.rateId,tenant])]);
    if(!cdr.rowCount||!userRow.rowCount||!rate.rowCount)return send(res,404,{error:'Tenant CDR, user or rate unavailable'});
    const call=cdr.rows[0],tariff=rate.rows[0],at=new Date(call.started_at).getTime();
    if(!call.callee_e164.slice(1).startsWith(tariff.prefix)||new Date(tariff.effective_at).getTime()>at||
      tariff.expires_at&&new Date(tariff.expires_at).getTime()<=at)
      return send(res,409,{error:'Rate does not match the CDR destination or call time'});
    const result=rateCall({billableSeconds:Number(call.billable_seconds),priceCents:Number(tariff.price_cents),costCents:Number(tariff.cost_cents)});
    const id=randomUUID();
    try{await pool.query(`INSERT INTO rated_call_records(id,tenant_id,cdr_id,user_id,rate_id,provider,price_cents,cost_cents,billable_seconds,units,charge_cents,cost_total_cents)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,tenant,b.cdrId,b.userId,b.rateId,tariff.provider,
      Number(tariff.price_cents),Number(tariff.cost_cents),Number(call.billable_seconds),result.units,result.chargeCents,result.costTotalCents]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'CDR already rated'});throw error;}
    return send(res,201,{id,status:'draft',...result});
  }
  return send(res,405,{error:'Unsupported rating action'});
}
