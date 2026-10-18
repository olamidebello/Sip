import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateWalletAdminCredits(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_admin_credits (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,request_id CHAR(36) NOT NULL,
 tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
 amount_cents INT NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'USD',reason VARCHAR(250) NOT NULL,
 balance_before_cents BIGINT NOT NULL,balance_after_cents BIGINT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY wallet_admin_request(tenant_id,actor_id,request_id),
 FOREIGN KEY(user_id,tenant_id) REFERENCES wallet_accounts(user_id,tenant_id),
 FOREIGN KEY(actor_id) REFERENCES users(id),CHECK(amount_cents>0 AND amount_cents<=1000000),
 INDEX wallet_admin_history(tenant_id,user_id,id)) ENGINE=InnoDB`);
}
export function validateAdminCredit(b){
 if(!b||!uuid.test(b.userId||'')||!uuid.test(b.requestId||'')||!Number.isSafeInteger(b.amountCents)||b.amountCents<1||b.amountCents>1000000||typeof b.reason!=='string'||!b.reason.trim()||b.reason.trim().length>250||typeof b.confirmedEmail!=='string'||b.confirmedEmail.length>254)throw Error('Choose a user, confirm their email, enter $0.01–$10,000 and a reason');
 return {...b,reason:b.reason.trim(),confirmedEmail:b.confirmedEmail.trim().toLowerCase()};
}
export async function handleWalletAdminCredits({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const url=new URL(req.url||path,'http://localhost');
 if(path==='/api/admin/wallet-funding/users'&&req.method==='GET'){
  const q=(url.searchParams.get('q')||'').trim();if(q.length>100)return send(res,400,{error:'Search must be at most 100 characters'});
  const result=await pool.query("SELECT u.id,u.email,u.display_name,COALESCE(w.balance_cents,0) AS balance_cents FROM users u LEFT JOIN wallet_accounts w ON w.user_id=u.id AND w.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND u.status='active' AND (u.email LIKE $2 OR u.display_name LIKE $2) ORDER BY u.email LIMIT 50",[user.tenant_id,'%'+q+'%']);
  return send(res,200,{users:result.rows.map(r=>({id:r.id,email:r.email,name:r.display_name,availableBalanceCents:Number(r.balance_cents)})),limit:50});
 }
 if(path==='/api/admin/wallet-funding/credits'&&req.method==='GET'){
  const before=url.searchParams.get('before')||'18446744073709551615',target=url.searchParams.get('userId');
  if(!/^\d{1,20}$/.test(before)||BigInt(before)>18446744073709551615n||target&&!uuid.test(target))return send(res,400,{error:'Invalid credit report filter'});
  const args=[user.tenant_id,before];if(target)args.push(target);
  const rows=(await pool.query('SELECT CAST(c.id AS CHAR) AS id,c.request_id,c.user_id,u.email,a.email AS actor_email,c.amount_cents,c.currency,c.reason,c.balance_before_cents,c.balance_after_cents,c.created_at FROM wallet_admin_credits c JOIN users u ON u.id=c.user_id JOIN users a ON a.id=c.actor_id WHERE c.tenant_id=$1 AND c.id<$2'+(target?' AND c.user_id=$3':'')+' ORDER BY c.id DESC LIMIT 50',args)).rows;
  return send(res,200,{credits:rows,nextBefore:rows.length===50?rows.at(-1).id:null});
 }
 if(path!=='/api/admin/wallet-funding/credits'||req.method!=='POST')return send(res,405,{error:'Method unavailable'});
 let b;try{b=validateAdminCredit(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const target=(await db.query("SELECT id,email FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE",[b.userId,user.tenant_id])).rows[0];
  if(!target||target.email.toLowerCase()!==b.confirmedEmail){await db.query('ROLLBACK');return send(res,409,{error:'Active user or confirmed email does not match this workspace'});}
  const existing=(await db.query('SELECT CAST(id AS CHAR) AS id,user_id,amount_cents,reason,balance_after_cents FROM wallet_admin_credits WHERE tenant_id=$1 AND actor_id=$2 AND request_id=$3 FOR UPDATE',[user.tenant_id,user.id,b.requestId])).rows[0];
  if(existing){await db.query('ROLLBACK');if(existing.user_id!==b.userId||Number(existing.amount_cents)!==b.amountCents||existing.reason!==b.reason)return send(res,409,{error:'Request ID already belongs to a different credit'});return send(res,200,{credited:true,duplicate:true,id:existing.id,amountCents:Number(existing.amount_cents),balanceAfterCents:Number(existing.balance_after_cents)});}
  await db.query("INSERT IGNORE INTO wallet_accounts(user_id,tenant_id,currency,balance_cents) VALUES($1,$2,'USD',0)",[b.userId,user.tenant_id]);
  const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[b.userId,user.tenant_id])).rows[0];
  const before=Number(wallet?.balance_cents),after=before+b.amountCents;
  if(wallet?.currency!=='USD'||!Number.isSafeInteger(before)||before<0||!Number.isSafeInteger(after))throw Error('Invalid USD wallet balance');
  await db.query('INSERT INTO wallet_admin_credits(request_id,tenant_id,user_id,actor_id,amount_cents,reason,balance_before_cents,balance_after_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[b.requestId,user.tenant_id,b.userId,user.id,b.amountCents,b.reason,before,after]);
  const updated=await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents+$1 WHERE user_id=$2 AND tenant_id=$3',[b.amountCents,b.userId,user.tenant_id]);if(updated.rowCount!==1)throw Error('Wallet credit failed');
  await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'wallet_manual_credit')",[randomUUID(),user.tenant_id,user.id,b.userId]);
  await db.query('COMMIT');return send(res,201,{credited:true,amountCents:b.amountCents,balanceAfterCents:after,currency:'USD'});
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Credit request already used. Retry the original request.'});throw e;}finally{db.release();}
}
