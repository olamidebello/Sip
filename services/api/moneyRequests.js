import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateMoneyRequests(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_requests (
  id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,requester_id CHAR(36) NOT NULL,payer_id CHAR(36) NOT NULL,
  amount_cents BIGINT NOT NULL,note VARCHAR(200) NOT NULL DEFAULT '',status VARCHAR(16) NOT NULL DEFAULT 'pending',
  idempotency_key CHAR(36) NOT NULL,transfer_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY(requester_id) REFERENCES users(id),FOREIGN KEY(payer_id) REFERENCES users(id),
  FOREIGN KEY(transfer_id) REFERENCES wallet_transfers(id),
  UNIQUE KEY wallet_request_key(requester_id,idempotency_key),INDEX wallet_request_tenant(tenant_id,payer_id,status),
  CONSTRAINT chk_wallet_request_positive CHECK(amount_cents>0)) ENGINE=InnoDB`);
}
export function validateMoneyRequest(body){
 const email=String(body?.payerEmail||'').trim().toLowerCase(),note=String(body?.note||'').trim();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254||!Number.isSafeInteger(body?.amountCents)||body.amountCents<1||body.amountCents>100000000||!uuid.test(body?.idempotencyKey||'')||note.length>200)throw new Error('Valid payer email, USD amount, note, and request ID required');
 return {email,note,amountCents:body.amountCents,key:body.idempotencyKey};
}
export async function handleMoneyRequests({req,res,path,user,pool,send,readJson}){
 if(path==='/api/wallet/requests'&&req.method==='GET'){
  const rows=await pool.query(`SELECT r.*,a.email AS requester_email,b.email AS payer_email FROM wallet_requests r JOIN users a ON a.id=r.requester_id JOIN users b ON b.id=r.payer_id WHERE r.tenant_id=$1 AND (r.requester_id=$2 OR r.payer_id=$2) ORDER BY r.created_at DESC LIMIT 100`,[user.tenant_id,user.id]);
  return send(res,200,{requests:rows.rows});
 }
 if(path==='/api/wallet/requests'&&req.method==='POST'){
  let body;try{body=validateMoneyRequest(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
  const payer=(await pool.query("SELECT id FROM users WHERE email=$1 AND tenant_id=$2 AND status='active'",[body.email,user.tenant_id])).rows[0];
  if(!payer||payer.id===user.id)return send(res,404,{error:'Payer unavailable in this workspace'});
  const id=randomUUID();
  await pool.query('INSERT IGNORE INTO wallet_requests(id,tenant_id,requester_id,payer_id,amount_cents,note,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,user.tenant_id,user.id,payer.id,body.amountCents,body.note,body.key]);
  const row=(await pool.query('SELECT id,payer_id,amount_cents,note,status FROM wallet_requests WHERE requester_id=$1 AND tenant_id=$2 AND idempotency_key=$3',[user.id,user.tenant_id,body.key])).rows[0];
  if(!row||row.payer_id!==payer.id||Number(row.amount_cents)!==body.amountCents||row.note!==body.note)return send(res,409,{error:'Request ID already used for another request'});
  return send(res,row.id===id?201:200,{id:row.id,status:row.status});
 }
 const match=/^\/api\/wallet\/requests\/([0-9a-f-]{36})$/.exec(path);
 if(match&&uuid.test(match[1])&&req.method==='PUT'){
  const body=await readJson(req),action=body.action;
  if(!['cancel','decline'].includes(action))return send(res,400,{error:'Choose cancel or decline'});
  const column=action==='cancel'?'requester_id':'payer_id';
  const result=await pool.query(`UPDATE wallet_requests SET status=$1 WHERE id=$2 AND tenant_id=$3 AND ${column}=$4 AND status='pending'`,[action==='cancel'?'cancelled':'declined',match[1],user.tenant_id,user.id]);
  return result.rowCount?send(res,200,{status:action==='cancel'?'cancelled':'declined'}):send(res,409,{error:'Request unavailable or already resolved'});
 }
 return send(res,404,{error:'Money request route unavailable'});
}
