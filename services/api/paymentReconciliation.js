import {reconcileStorePayment} from './storeGateways.js';
export async function migratePaymentReconciliation(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS payment_reconciliation (
 attempt_id CHAR(36) PRIMARY KEY,next_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 attempts INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT 'pending',
 last_checked DATETIME(3) NULL,FOREIGN KEY(attempt_id) REFERENCES payment_attempts(id) ON DELETE CASCADE,
 INDEX payment_reconcile_due(status,next_at)) ENGINE=InnoDB`);
}
export async function reconcileNextPayment(pool,{fetchImpl=fetch}={}){
 const db=await pool.connect();let locked=false;
 try{
  locked=Number((await db.query("SELECT GET_LOCK('store_payment_reconcile',0) AS acquired")).rows[0]?.acquired)===1;
  if(!locked)return false;
  const a=(await db.query(`SELECT p.* FROM payment_attempts p LEFT JOIN payment_reconciliation r ON r.attempt_id=p.id
   WHERE p.provider IN ('paystack','flutterwave') AND p.status IN ('open','creating')
   AND p.created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)
   AND (r.attempt_id IS NULL OR (r.status='pending' AND r.next_at<=UTC_TIMESTAMP(3)))
   ORDER BY COALESCE(r.next_at,p.created_at),p.id LIMIT 1`)).rows[0];
  if(!a)return false;
  // Persist a retry time before network I/O so crashes do not spin on the same attempt.
  await db.query(`INSERT INTO payment_reconciliation(attempt_id,attempts,next_at,last_checked) VALUES($1,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE),UTC_TIMESTAMP(3))
   ON DUPLICATE KEY UPDATE attempts=attempts+1,next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE),last_checked=UTC_TIMESTAMP(3)`,[a.id]);
  const result=await reconcileStorePayment(pool,a,{fetchImpl});
  if(result.status===200)await db.query("UPDATE payment_reconciliation SET status='verified' WHERE attempt_id=$1",[a.id]);
  else if(new Date(a.created_at).getTime()<Date.now()-7*86400000)await db.query("UPDATE payment_reconciliation SET status='review_required' WHERE attempt_id=$1",[a.id]);
  return true;
 }finally{try{if(locked)await db.query("SELECT RELEASE_LOCK('store_payment_reconcile')");}finally{db.release();}}
}
export async function handlePaymentReconciliation({req,res,user,pool,send}){
 if(!['admin','super_admin'].includes(user?.role))return send(res,403,{error:'Administrator required'});
 if(req.method!=='GET')return send(res,405,{error:'GET required'});
 const r=await pool.query(`SELECT p.id,p.invoice_id,p.provider,p.status AS payment_status,r.status AS reconciliation_status,r.attempts,r.last_checked,r.next_at
 FROM payment_attempts p LEFT JOIN payment_reconciliation r ON r.attempt_id=p.id WHERE p.tenant_id=$1 AND p.provider IN ('paystack','flutterwave') ORDER BY p.created_at DESC LIMIT 100`,[user.tenant_id]);
 return send(res,200,{attempts:r.rows,note:'Server verifies pending payments automatically. Unresolved attempts older than seven days require merchant review; they are not retried as new charges.'});
}
export function startPaymentReconciliation(pool,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let stopped=false,timer;async function tick(){try{await reconcileNextPayment(pool);}catch(e){console.error('Payment reconciliation',e.code||e.name);}if(!stopped){timer=setTimer(tick,15000);timer.unref?.();}}void tick();return()=>{stopped=true;clearTimer(timer);};
}
