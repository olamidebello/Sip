import {randomUUID} from 'node:crypto';
import {isAdmin} from './tenancy.js';

const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const prefix=/^[1-9][0-9]{0,14}$/;
const name=/^[\w .-]{1,80}$/;
const date=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && !Number.isNaN(Date.parse(value));
const stamp=value=>value.slice(0,-1).replace('T',' ');
const cents=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000;

export async function migrateOperatorControl(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS operator_tariffs (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,name VARCHAR(80) NOT NULL,
    mode VARCHAR(16) NOT NULL DEFAULT 'least_cost',enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY tenant_name(tenant_id,name),INDEX tenant_enabled(tenant_id,enabled),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(created_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS operator_tariff_rates (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,tariff_id CHAR(36) NOT NULL,
    provider VARCHAR(16) NOT NULL,prefix VARCHAR(15) NOT NULL,
    cost_cents INT UNSIGNED NOT NULL,price_cents INT UNSIGNED NOT NULL,
    priority SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    effective_at DATETIME(3) NOT NULL,expires_at DATETIME(3) NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,created_by CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX quote_lookup(tenant_id,tariff_id,enabled,prefix),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(tariff_id) REFERENCES operator_tariffs(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS operator_fraud_rules (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,prefix VARCHAR(15) NOT NULL,
    reason VARCHAR(200) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY tenant_prefix(tenant_id,prefix),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}

export function selectQuote({number,at,mode,rates,blocks,carriers}){
  const digits=String(number||'').replace(/^\+/,'');
  if(!prefix.test(digits)) throw new RangeError('Valid E.164 destination required');
  const blocked=blocks.filter(rule=>rule.enabled&&digits.startsWith(rule.prefix))
    .sort((a,b)=>b.prefix.length-a.prefix.length)[0];
  if(blocked)return {blocked:true,reason:blocked.reason,matchedPrefix:blocked.prefix,candidates:[]};
  const live=new Set(carriers.filter(row=>row.status==='active'&&row.routing_mode!=='disabled').map(row=>row.provider));
  const eligible=rates.filter(row=>row.enabled&&digits.startsWith(row.prefix)&&
    Date.parse(row.effective_at)<=at&&(!row.expires_at||Date.parse(row.expires_at)>at)&&live.has(row.provider));
  const longest=eligible.reduce((n,row)=>Math.max(n,row.prefix.length),0);
  const candidates=eligible.filter(row=>row.prefix.length===longest).sort((a,b)=>
    mode==='priority' ? Number(a.priority)-Number(b.priority)||Number(a.cost_cents)-Number(b.cost_cents) :
      Number(a.cost_cents)-Number(b.cost_cents)||Number(a.priority)-Number(b.priority));
  return {blocked:false,selected:candidates[0]||null,candidates,matchedPrefix:candidates[0]?.prefix||null,
    reason:candidates.length?'Preview only; live switch routing is separately configured':'No active carrier rate matches'};
}

export async function handleOperatorControl({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  const tenant=user.tenant_id;
  if(path==='/api/admin/operator'&&req.method==='GET'){
    const [tariffs,rates,blocks,carriers]=await Promise.all([
      pool.query('SELECT id,name,mode,enabled,created_at FROM operator_tariffs WHERE tenant_id=$1 ORDER BY name',[tenant]),
      pool.query('SELECT id,tariff_id,provider,prefix,cost_cents,price_cents,priority,effective_at,expires_at,enabled FROM operator_tariff_rates WHERE tenant_id=$1 ORDER BY prefix,priority LIMIT 1000',[tenant]),
      pool.query('SELECT id,prefix,reason,enabled FROM operator_fraud_rules WHERE tenant_id=$1 ORDER BY prefix',[tenant]),
      pool.query('SELECT provider,status,routing_mode FROM carrier_provider_profiles WHERE tenant_id=$1',[tenant])]);
    return send(res,200,{tariffs:tariffs.rows,rates:rates.rows,blocks:blocks.rows,carriers:carriers.rows,liveEnforcement:false});
  }
  if(path==='/api/admin/operator/tariffs'&&req.method==='POST'){
    const body=await readJson(req);
    if(!name.test(body.name||'')||!['least_cost','priority'].includes(body.mode))return send(res,400,{error:'Valid tariff name and routing mode required'});
    const newId=randomUUID();
    try{await pool.query('INSERT INTO operator_tariffs(id,tenant_id,name,mode,created_by) VALUES($1,$2,$3,$4,$5)',
      [newId,tenant,body.name.trim(),body.mode,user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Tariff name exists'});throw error;}
    return send(res,201,{id:newId});
  }
  const tariff=/^\/api\/admin\/operator\/tariffs\/([0-9a-f-]{36})$/.exec(path);
  if(tariff&&id.test(tariff[1])&&req.method==='PUT'){
    const {enabled}=await readJson(req);
    if(typeof enabled!=='boolean')return send(res,400,{error:'Boolean enabled required'});
    const result=await pool.query('UPDATE operator_tariffs SET enabled=$1 WHERE tenant_id=$2 AND id=$3',[enabled,tenant,tariff[1]]);
    return send(res,result.rowCount?200:404,result.rowCount?{enabled}:{error:'Tariff unavailable'});
  }
  if(path==='/api/admin/operator/rates'&&req.method==='POST'){
    const b=await readJson(req);
    if(!id.test(b.tariffId||'')||!prefix.test(b.prefix||'')||!cents(b.costCents)||!cents(b.priceCents)||
      b.priceCents<b.costCents||!Number.isSafeInteger(b.priority)||b.priority<1||b.priority>1000||
      !date(b.effectiveAt)||b.expiresAt!=null&&(!date(b.expiresAt)||Date.parse(b.expiresAt)<=Date.parse(b.effectiveAt)))
      return send(res,400,{error:'Valid tariff, prefix, margin, priority, and UTC effective window required'});
    const [tariffRow,carrier]=await Promise.all([
      pool.query('SELECT id FROM operator_tariffs WHERE id=$1 AND tenant_id=$2',[b.tariffId,tenant]),
      pool.query("SELECT provider FROM carrier_provider_profiles WHERE provider=$1 AND tenant_id=$2",[b.provider,tenant])]);
    if(!tariffRow.rowCount||!carrier.rowCount)return send(res,404,{error:'Tariff or carrier unavailable'});
    const newId=randomUUID();
    await pool.query('INSERT INTO operator_tariff_rates(id,tenant_id,tariff_id,provider,prefix,cost_cents,price_cents,priority,effective_at,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [newId,tenant,b.tariffId,b.provider,b.prefix,b.costCents,b.priceCents,b.priority,stamp(b.effectiveAt),b.expiresAt?stamp(b.expiresAt):null,user.id]);
    return send(res,201,{id:newId});
  }
  const rate=/^\/api\/admin\/operator\/rates\/([0-9a-f-]{36})$/.exec(path);
  if(rate&&id.test(rate[1])&&req.method==='DELETE'){
    const result=await pool.query('DELETE FROM operator_tariff_rates WHERE id=$1 AND tenant_id=$2',[rate[1],tenant]);
    return send(res,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Rate unavailable'});
  }
  if(path==='/api/admin/operator/blocks'&&req.method==='POST'){
    const b=await readJson(req);
    if(!prefix.test(b.prefix||'')||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>200)
      return send(res,400,{error:'Valid destination prefix and reason required'});
    const newId=randomUUID();
    try{await pool.query('INSERT INTO operator_fraud_rules(id,tenant_id,prefix,reason,created_by) VALUES($1,$2,$3,$4,$5)',
      [newId,tenant,b.prefix,b.reason.trim(),user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Destination block already exists'});throw error;}
    return send(res,201,{id:newId});
  }
  const block=/^\/api\/admin\/operator\/blocks\/([0-9a-f-]{36})$/.exec(path);
  if(block&&id.test(block[1])&&req.method==='DELETE'){
    const result=await pool.query('DELETE FROM operator_fraud_rules WHERE id=$1 AND tenant_id=$2',[block[1],tenant]);
    return send(res,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Block unavailable'});
  }
  if(path==='/api/admin/operator/quote'&&req.method==='POST'){
    const b=await readJson(req);
    if(!id.test(b.tariffId||'')||typeof b.number!=='string'||!/^\+[1-9]\d{7,14}$/.test(b.number))
      return send(res,400,{error:'Valid tariff and E.164 destination required'});
    const tariffRow=await pool.query('SELECT id,mode FROM operator_tariffs WHERE id=$1 AND tenant_id=$2 AND enabled=TRUE',[b.tariffId,tenant]);
    if(!tariffRow.rowCount)return send(res,404,{error:'Enabled tariff unavailable'});
    const [rates,blocks,carriers]=await Promise.all([
      pool.query('SELECT id,provider,prefix,cost_cents,price_cents,priority,effective_at,expires_at,enabled FROM operator_tariff_rates WHERE tenant_id=$1 AND tariff_id=$2 AND enabled=TRUE',[tenant,b.tariffId]),
      pool.query('SELECT prefix,reason,enabled FROM operator_fraud_rules WHERE tenant_id=$1 AND enabled=TRUE',[tenant]),
      pool.query('SELECT provider,status,routing_mode FROM carrier_provider_profiles WHERE tenant_id=$1',[tenant])]);
    const normalized=rates.rows.map(row=>({...row,effective_at:new Date(row.effective_at).toISOString(),expires_at:row.expires_at?new Date(row.expires_at).toISOString():null}));
    return send(res,200,{...selectQuote({number:b.number,at:Date.now(),mode:tariffRow.rows[0].mode,
      rates:normalized,blocks:blocks.rows,carriers:carriers.rows}),liveEnforcement:false});
  }
  return send(res,404,{error:'Operator route unavailable'});
}
