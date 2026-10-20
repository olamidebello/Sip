import {randomUUID} from 'node:crypto';
import {storePolicy} from './marketplaceControl.js';
export async function migrateWalletPurchases(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_purchases (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 invoice_id CHAR(36) NOT NULL UNIQUE,amount_cents BIGINT NOT NULL,balance_after_cents BIGINT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(invoice_id) REFERENCES invoices(id),FOREIGN KEY(user_id) REFERENCES users(id),
 CHECK(amount_cents>0),CHECK(balance_after_cents>=0),INDEX wallet_purchase_user(tenant_id,user_id,created_at)
 ) ENGINE=InnoDB`);
}
export async function payInvoiceFromWallet(pool,user,invoiceId){
 const policy=await storePolicy(pool,user.tenant_id);
 if(policy&&(!policy.authorized||!policy.enabled))return {status:403,error:'Store disabled'};
 const db=await pool.connect();
 try{
  await db.query('START TRANSACTION');
  const invoice=(await db.query('SELECT i.id,i.status,i.amount_cents,i.currency FROM invoices i JOIN users u ON u.id=i.user_id WHERE i.id=$1 AND i.user_id=$2 AND u.tenant_id=$3 FOR UPDATE',[invoiceId,user.id,user.tenant_id])).rows[0];
  const reject=async(error,status=409)=>{await db.query('ROLLBACK');return {status,error};};
  if(!invoice)return await reject('Invoice unavailable',404);
  const previous=(await db.query('SELECT id,amount_cents,balance_after_cents FROM wallet_purchases WHERE invoice_id=$1 AND user_id=$2 AND tenant_id=$3',[invoiceId,user.id,user.tenant_id])).rows[0];
  if(previous){await db.query('COMMIT');return {status:200,paid:true,duplicate:true,purchaseId:previous.id};}
  const amount=Number(invoice.amount_cents);
  if(invoice.status!=='unpaid'||invoice.currency!=='USD'||!Number.isSafeInteger(amount)||amount<1)return await reject('Unpaid USD invoice required');
  const active=(await db.query("SELECT id FROM payment_attempts WHERE invoice_id=$1 AND tenant_id=$2 AND status IN ('creating','open','paid','expired') LIMIT 1 FOR UPDATE",[invoiceId,user.tenant_id])).rows[0];
  if(active)return await reject('Reconcile the existing online payment before paying with balance');
  const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id])).rows[0];
  const balance=Number(wallet?.balance_cents||0);
  if(wallet?.currency!=='USD'||!Number.isSafeInteger(balance)||balance<amount)return await reject('Insufficient available USD balance');
  const id=randomUUID(),after=balance-amount;
  await db.query('UPDATE wallet_accounts SET balance_cents=$1 WHERE user_id=$2 AND tenant_id=$3',[after,user.id,user.tenant_id]);
  await db.query('INSERT INTO wallet_purchases(id,tenant_id,user_id,invoice_id,amount_cents,balance_after_cents) VALUES($1,$2,$3,$4,$5,$6)',[id,user.tenant_id,user.id,invoiceId,amount,after]);
  await db.query("UPDATE invoices SET status='paid' WHERE id=$1 AND user_id=$2 AND status='unpaid'",[invoiceId,user.id]);
  await db.query('COMMIT');return {status:200,paid:true,purchaseId:id,balanceCents:after};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function handleWalletPurchase({req,res,user,pool,send,readJson}){
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 const body=await readJson(req);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.invoiceId||''))return send(res,400,{error:'Valid invoice ID required'});
 const result=await payInvoiceFromWallet(pool,user,body.invoiceId);return send(res,result.status,result);
}
