import {randomUUID} from "node:crypto";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateWallet(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_accounts (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'USD',
    balance_cents BIGINT NOT NULL DEFAULT 0,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_wallet_nonnegative CHECK(balance_cents>=0),INDEX wallet_accounts_tenant(tenant_id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_transfers (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,sender_id CHAR(36) NOT NULL,recipient_id CHAR(36) NOT NULL,
    amount_cents BIGINT NOT NULL,idempotency_key CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(sender_id) REFERENCES users(id),FOREIGN KEY(recipient_id) REFERENCES users(id),
    UNIQUE KEY wallet_sender_idempotency(sender_id,idempotency_key),INDEX wallet_transfers_tenant(tenant_id,created_at),
    CONSTRAINT chk_wallet_amount CHECK(amount_cents>0)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS wallet_entries (
    id CHAR(36) PRIMARY KEY,transfer_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    delta_cents BIGINT NOT NULL,balance_after_cents BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(transfer_id) REFERENCES wallet_transfers(id),FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE KEY wallet_transfer_user(transfer_id,user_id),INDEX wallet_entries_user(user_id,created_at)) ENGINE=InnoDB`);
}
export function validateTransfer(input) {
  const email=String(input?.recipientEmail??"").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length>254 ||
      !Number.isSafeInteger(input?.amountCents) || input.amountCents<1 || input.amountCents>100000000 ||
      !uuid.test(input?.idempotencyKey||"")) throw new Error("Recipient email, amount in cents, and request ID required");
  return {email,amountCents:input.amountCents,idempotencyKey:input.idempotencyKey};
}
export async function handleWallet({req,res,path,user,pool,send,readJson}) {
  if (!user.features.billing) return send(res,403,{error:"Billing access unavailable"});
  if (path==="/api/wallet" && req.method==="GET") {
    const account=await pool.query("SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]);
    const entries=await pool.query("SELECT e.id,e.delta_cents,e.balance_after_cents,e.created_at,t.sender_id,t.recipient_id FROM wallet_entries e JOIN wallet_transfers t ON t.id=e.transfer_id WHERE e.user_id=$1 AND e.tenant_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 50",[user.id,user.tenant_id]);
    return send(res,200,{balanceCents:Number(account.rows[0]?.balance_cents||0),currency:"USD",entries:entries.rows,
      fundingAvailable:false,payoutAvailable:false,note:"No payment provider or funding path is connected."});
  }
  if (path==="/api/wallet/transfers" && req.method==="POST") {
    let transfer;
    try {transfer=validateTransfer(await readJson(req));}
    catch(error) {return send(res,400,{error:error.message});}
    const recipient=await pool.query("SELECT id FROM users WHERE email=$1 AND tenant_id=$2 AND status='active'",[transfer.email,user.tenant_id]);
    if (!recipient.rowCount || recipient.rows[0].id===user.id) return send(res,404,{error:"Recipient unavailable"});
    const recipientId=recipient.rows[0].id,db=await pool.connect();
    try {
      await db.query("BEGIN");
      for(const id of [user.id,recipientId].sort())
        await db.query("INSERT IGNORE INTO wallet_accounts(user_id,tenant_id,balance_cents) VALUES($1,$2,0)",[id,user.tenant_id]);
      const accounts=[];
      for(const id of [user.id,recipientId].sort()) {
        const found=await db.query("SELECT balance_cents FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE",[id,user.tenant_id]);
        accounts.push({id,balance:Number(found.rows[0].balance_cents)});
      }
      const existing=await db.query("SELECT id,recipient_id,amount_cents FROM wallet_transfers WHERE sender_id=$1 AND idempotency_key=$2",[user.id,transfer.idempotencyKey]);
      if (existing.rowCount) {
        await db.query("ROLLBACK");
        if (existing.rows[0].recipient_id!==recipientId || Number(existing.rows[0].amount_cents)!==transfer.amountCents)
          return send(res,409,{error:"Request ID already used for another transfer"});
        return send(res,200,{id:existing.rows[0].id,status:"completed",duplicate:true});
      }
      const sender=accounts.find(account=>account.id===user.id),receiver=accounts.find(account=>account.id===recipientId);
      if (sender.balance<transfer.amountCents) {await db.query("ROLLBACK");return send(res,409,{error:"Insufficient available balance"});}
      if (!Number.isSafeInteger(sender.balance) || !Number.isSafeInteger(receiver.balance) || receiver.balance>Number.MAX_SAFE_INTEGER-transfer.amountCents)
        {await db.query("ROLLBACK");return send(res,409,{error:"Wallet balance limit reached"});}
      const id=randomUUID(),senderAfter=sender.balance-transfer.amountCents,receiverAfter=receiver.balance+transfer.amountCents;
      await db.query("INSERT INTO wallet_transfers(id,tenant_id,sender_id,recipient_id,amount_cents,idempotency_key) VALUES($1,$2,$3,$4,$5,$6)",
        [id,user.tenant_id,user.id,recipientId,transfer.amountCents,transfer.idempotencyKey]);
      await db.query("UPDATE wallet_accounts SET balance_cents=$1 WHERE user_id=$2 AND tenant_id=$3",[senderAfter,user.id,user.tenant_id]);
      await db.query("UPDATE wallet_accounts SET balance_cents=$1 WHERE user_id=$2 AND tenant_id=$3",[receiverAfter,recipientId,user.tenant_id]);
      for(const [accountId,delta,balance] of [[user.id,-transfer.amountCents,senderAfter],[recipientId,transfer.amountCents,receiverAfter]])
        await db.query("INSERT INTO wallet_entries(id,transfer_id,user_id,tenant_id,delta_cents,balance_after_cents) VALUES($1,$2,$3,$4,$5,$6)",
          [randomUUID(),id,accountId,user.tenant_id,delta,balance]);
      await db.query("COMMIT");
      return send(res,201,{id,status:"completed",balanceCents:senderAfter});
    } catch(error) {await db.query("ROLLBACK");throw error;} finally {db.release();}
  }
  return send(res,404,{error:"Wallet route unavailable"});
}
