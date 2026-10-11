import { randomUUID } from 'node:crypto';
import { isAdmin } from './tenancy.js';
import {reconcileCarrier} from './carrierReconciliation.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day=/^\d{4}-\d{2}-\d{2}$/;
export function validPeriod(from,to){
  const valid=value=>day.test(value||'') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  return valid(from)&&valid(to)&&from<=to && (Date.parse(to)-Date.parse(from))<=366*86400000;
}

export async function migrateSettlements(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_settlements (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, provider VARCHAR(16) NOT NULL,
    external_reference VARCHAR(100) NOT NULL, period_from DATE NOT NULL, period_to DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD', expected_cents BIGINT UNSIGNED NOT NULL,
    carrier_cents BIGINT UNSIGNED NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'draft',
    note VARCHAR(1000) NOT NULL DEFAULT '', created_by CHAR(36) NOT NULL,
    reviewed_by CHAR(36) NULL, reviewed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(created_by) REFERENCES users(id),
    UNIQUE KEY settlement_reference(tenant_id,provider,external_reference),
    INDEX settlement_list(tenant_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_settlement_disputes (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, settlement_id CHAR(36) NOT NULL,
    reason VARCHAR(1000) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'open',
    resolution VARCHAR(1000) NULL, opened_by CHAR(36) NOT NULL, resolved_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), resolved_at DATETIME(3) NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(settlement_id) REFERENCES carrier_settlements(id),
    INDEX dispute_list(tenant_id,settlement_id,created_at)
  ) ENGINE=InnoDB`);
}

export async function handleSettlements({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  const tenant=user.tenant_id;
  if(path==='/api/admin/settlements' && req.method==='GET'){
    const [items,disputes]=await Promise.all([
      pool.query('SELECT id,provider,external_reference,period_from,period_to,currency,expected_cents,carrier_cents,status,note,created_at,reviewed_at FROM carrier_settlements WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200',[tenant]),
      pool.query('SELECT id,settlement_id,reason,status,resolution,created_at,resolved_at FROM carrier_settlement_disputes WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200',[tenant])]);
    return send(res,200,{settlements:items.rows,disputes:disputes.rows,note:'Statements are manually entered for reconciliation. Approval records review only; it does not pay a carrier or charge customers.'});
  }
  if(path==='/api/admin/settlements' && req.method==='POST'){
    const input=await readJson(req);
    if(!/^[a-z][a-z0-9-]{1,15}$/.test(input.provider||'') || !/^[\w .:/-]{1,100}$/.test(input.externalReference||'') ||
      !validPeriod(input.periodFrom,input.periodTo)|| !Number.isSafeInteger(input.expectedCents)||input.expectedCents<0||
      !Number.isSafeInteger(input.carrierCents)||input.carrierCents<0||typeof input.note!=='string'||input.note.length>1000)
      return send(res,400,{error:'Valid carrier, reference, period, amounts in USD cents and note required'});
    const carrier=await pool.query('SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2',[tenant,input.provider]);
    if(!carrier.rowCount)return send(res,404,{error:'Tenant carrier profile unavailable'});
    const id=randomUUID();
    try{await pool.query("INSERT INTO carrier_settlements(id,tenant_id,provider,external_reference,period_from,period_to,expected_cents,carrier_cents,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id,tenant,input.provider,input.externalReference,input.periodFrom,input.periodTo,input.expectedCents,input.carrierCents,input.note,user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Carrier statement reference already exists'});throw error;}
    return send(res,201,{id,status:'draft'});
  }
  const match=/^\/api\/admin\/settlements\/([0-9a-f-]{36})(?:\/(submit|approve|dispute|resolve))?$/.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Settlement unavailable'});
  if(req.method!=='POST')return send(res,405,{error:'POST required'});
  const [,id,action]=match;
  if(!action)return send(res,404,{error:'Action unavailable'});
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await db.query('SELECT status,provider,period_from,period_to,expected_cents,carrier_cents,created_by FROM carrier_settlements WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,tenant]);
    if(!result.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Tenant settlement unavailable'});}
    const item=result.rows[0];
    let reconciliation=null;
    if(action==='approve'){
      const rated=await db.query(`SELECT COUNT(*) AS calls,COALESCE(SUM(r.cost_total_cents),0) AS cents
        FROM rated_call_records r JOIN cdr_records c ON c.id=r.cdr_id AND c.tenant_id=r.tenant_id
        WHERE r.tenant_id=$1 AND r.provider=$2 AND c.started_at>= $3 AND c.started_at<DATE_ADD($4,INTERVAL 1 DAY)`,
        [tenant,item.provider,item.period_from,item.period_to]);
      const row=rated.rows[0];
      if(Number(row?.calls||0)>0)reconciliation=reconcileCarrier({expectedCents:Number(item.expected_cents),
        carrierCents:Number(item.carrier_cents),ratedCostCents:Number(row.cents)});
    }
    let next;
    if(action==='submit'&&item.status==='draft')next='in_review';
    else if(action==='approve'&&item.status==='in_review'&&user.role==='super_admin'&&item.created_by!==user.id&&
      reconciliation?.matched)next='approved';
    else if(action==='dispute'&&item.status==='in_review')next='disputed';
    else if(action==='resolve'&&item.status==='disputed'&&user.role==='super_admin')next='in_review';
    else {await db.query('ROLLBACK');return send(res,409,{error:'Action unavailable: independent review and matching rated CDR cost are required'});}
    const input=['dispute','resolve'].includes(action)?await readJson(req):{};
    if(action==='dispute'&& (typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)){
      await db.query('ROLLBACK');return send(res,400,{error:'Dispute reason required (max 1000 characters)'});
    }
    if(action==='resolve'&& (typeof input.resolution!=='string'||!input.resolution.trim()||input.resolution.length>1000)){
      await db.query('ROLLBACK');return send(res,400,{error:'Resolution required (max 1000 characters)'});
    }
    if(action==='resolve'){
      const open=await db.query("SELECT id FROM carrier_settlement_disputes WHERE tenant_id=$1 AND settlement_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[tenant,id]);
      if(!open.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'No open dispute'});}
      await db.query("UPDATE carrier_settlement_disputes SET status='resolved',resolution=$1,resolved_by=$2,resolved_at=UTC_TIMESTAMP(3) WHERE id=$3 AND tenant_id=$4",[input.resolution.trim(),user.id,open.rows[0].id,tenant]);
    }
    if(action==='dispute')await db.query('INSERT INTO carrier_settlement_disputes(id,tenant_id,settlement_id,reason,opened_by) VALUES($1,$2,$3,$4,$5)',[randomUUID(),tenant,id,input.reason.trim(),user.id]);
    await db.query('UPDATE carrier_settlements SET status=$1,reviewed_by=$2,reviewed_at=UTC_TIMESTAMP(3) WHERE id=$3 AND tenant_id=$4',[next,user.id,id,tenant]);
    await db.query('COMMIT');
    return send(res,200,{id,status:next});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
