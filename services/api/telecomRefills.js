import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateTelecomRefills(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS telecom_refills(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,amount_cents BIGINT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,balance_after_cents BIGINT UNSIGNED NOT NULL,reference VARCHAR(200) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX refill_tenant(tenant_id,created_at),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export function validateRefill(b){if(!b||!uuid.test(b.requestId||'')||!uuid.test(b.userId||'')||!Number.isSafeInteger(b.amountCents)||b.amountCents<1||b.amountCents>100000000||typeof b.reference!=='string'||!b.reference.trim()||b.reference.length>200)throw Error('Request ID, workspace user, positive amount (up to 100000000 cents) and funding reference required');return b;}
export async function handleTelecomRefills({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(path!=='/api/admin/telecom/refills')return send(res,404,{error:'Unknown refill resource'});
 if(req.method==='GET')return send(res,200,{rows:(await pool.query('SELECT id,user_id,actor_id,amount_cents,currency,balance_after_cents,reference,created_at FROM telecom_refills WHERE tenant_id=$1 ORDER BY created_at DESC,id LIMIT 200',[user.tenant_id])).rows,note:'Recorded administrator funding adjustments. These records do not verify an external payment or bank settlement.'});
 if(req.method!=='POST')return send(res,405,{error:'Use GET or POST; refills are immutable'});
 let b;try{b=validateRefill(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const member=(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[b.userId,user.tenant_id])).rows[0];
  if(!member){await db.query('ROLLBACK');return send(res,404,{error:'Active workspace user required'});}
  const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[b.userId,user.tenant_id])).rows[0];
  if(!wallet||wallet.currency!=='USD'){await db.query('ROLLBACK');return send(res,409,{error:'An existing USD wallet is required'});}
  const existing=(await db.query('SELECT tenant_id,user_id,amount_cents,reference,balance_after_cents FROM telecom_refills WHERE id=$1 FOR UPDATE',[b.requestId])).rows[0];
  if(existing){await db.query('ROLLBACK');if(existing.tenant_id!==user.tenant_id||existing.user_id!==b.userId||Number(existing.amount_cents)!==b.amountCents||existing.reference!==b.reference.trim())return send(res,409,{error:'Request ID already used with different details'});return send(res,200,{recorded:true,existing:true,balanceAfterCents:Number(existing.balance_after_cents)});}
  const after=Number(wallet.balance_cents)+b.amountCents;if(!Number.isSafeInteger(after)||after>1000000000000){await db.query('ROLLBACK');return send(res,409,{error:'Wallet balance limit reached'});}
  await db.query('INSERT INTO telecom_refills(id,tenant_id,user_id,actor_id,amount_cents,currency,balance_after_cents,reference) VALUES($1,$2,$3,$4,$5,\'USD\',$6,$7)',[b.requestId,user.tenant_id,b.userId,user.id,b.amountCents,after,b.reference.trim()]);
  await db.query('UPDATE wallet_accounts SET balance_cents=$1 WHERE user_id=$2 AND tenant_id=$3',[after,b.userId,user.tenant_id]);
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,b.userId,'wallet_manual_refill']);
  await db.query('COMMIT');return send(res,201,{recorded:true,balanceAfterCents:after});
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Concurrent request; retry with the same request ID'});throw e;}finally{db.release();}
}
