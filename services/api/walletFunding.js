import {randomUUID} from 'node:crypto';
import {stripeGateway,paymentKey,stripeRequest,decryptPaymentSecret} from './stripeGateway.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const defaults={enabled:false,minCents:100,maxCents:100000,revision:0};
export async function migrateWalletFunding(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_funding_policy (
 tenant_id CHAR(36) PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT FALSE,
 min_cents INT NOT NULL DEFAULT 100,max_cents INT NOT NULL DEFAULT 100000,
 revision INT NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id),
 CHECK(min_cents>=50 AND max_cents>=min_cents AND max_cents<=1000000)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_topups (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 idempotency_key CHAR(36) NOT NULL,amount_cents INT NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'USD',
 status VARCHAR(16) NOT NULL DEFAULT 'creating',session_id VARCHAR(255) NULL UNIQUE,
 checkout_url VARCHAR(2000) NULL,expires_epoch BIGINT NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),paid_at DATETIME(3) NULL,last_checked_at DATETIME(3) NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id),
 UNIQUE KEY wallet_topup_request(tenant_id,user_id,idempotency_key),
 INDEX wallet_topups_pending(status,created_at),CHECK(amount_cents>0)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_topup_credits (
 topup_id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
 delta_cents BIGINT NOT NULL,balance_after_cents BIGINT NOT NULL,session_id VARCHAR(255) NOT NULL UNIQUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(topup_id) REFERENCES wallet_topups(id),FOREIGN KEY(user_id,tenant_id) REFERENCES wallet_accounts(user_id,tenant_id),
 CHECK(delta_cents>0),INDEX wallet_topup_history(tenant_id,user_id,created_at)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS wallet_topup_events (
 event_id VARCHAR(255) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,topup_id CHAR(36) NOT NULL,
 event_type VARCHAR(120) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(topup_id) REFERENCES wallet_topups(id)) ENGINE=InnoDB`);
}
export async function fundingPolicy(pool,tenant){const row=(await pool.query('SELECT enabled,min_cents,max_cents,revision FROM wallet_funding_policy WHERE tenant_id=$1',[tenant])).rows[0];return row?{enabled:!!row.enabled,minCents:Number(row.min_cents),maxCents:Number(row.max_cents),revision:Number(row.revision)}:{...defaults};}
function liveReady(g){return !!(g?.enabled&&g.mode==='live'&&paymentKey()&&g.secret_key_cipher&&g.webhook_secret_cipher&&decryptPaymentSecret(g.secret_key_cipher).startsWith('sk_live_'));}
export async function fundingCapabilities(pool,tenant){const [policy,g]=await Promise.all([fundingPolicy(pool,tenant),stripeGateway(pool,tenant)]);const gatewayReady=liveReady(g);return {...policy,gatewayReady,fundingAvailable:policy.enabled&&gatewayReady,provider:'stripe',mode:g?.mode||null,fundingNote:policy.enabled&&gatewayReady?'Top up with Stripe. Funds become available after payment confirmation.':'Top-ups are unavailable until a super administrator enables funding and configures live Stripe payments.'};}
export function matchesTopup(t,s){return !!(s&&s.object==='checkout.session'&&s.livemode===true&&s.mode==='payment'&&s.payment_status==='paid'&&s.status==='complete'&&/^cs_live_[A-Za-z0-9]+$/.test(s.id||'')&&s.client_reference_id===t.id&&s.metadata?.purpose==='wallet_topup'&&s.metadata?.tenant_id===t.tenant_id&&s.metadata?.user_id===t.user_id&&Number(s.amount_total)===Number(t.amount_cents)&&String(s.currency).toUpperCase()===t.currency&&(!t.session_id||t.session_id===s.id));}
// Called only with a signature-verified webhook or authenticated server-to-Stripe response.
// Caller owns the transaction; ledger, balance and paid state commit together.
export async function creditConfirmedTopup(db,t,s){
 if(!matchesTopup(t,s))throw Error('Top-up reconciliation mismatch');
 const existing=(await db.query('SELECT session_id,delta_cents FROM wallet_topup_credits WHERE topup_id=$1 FOR UPDATE',[t.id])).rows[0];
 if(existing){if(existing.session_id!==s.id||Number(existing.delta_cents)!==Number(t.amount_cents))throw Error('Top-up credit conflict');return {credited:false,duplicate:true};}
 if(t.status==='paid')throw Error('Paid top-up ledger missing; review required');
 await db.query("INSERT IGNORE INTO wallet_accounts(user_id,tenant_id,currency,balance_cents) VALUES($1,$2,'USD',0)",[t.user_id,t.tenant_id]);
 const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[t.user_id,t.tenant_id])).rows[0];
 const before=Number(wallet?.balance_cents),after=before+Number(t.amount_cents);
 if(wallet?.currency!=='USD'||!Number.isSafeInteger(before)||before<0||!Number.isSafeInteger(after))throw Error('USD wallet balance invalid');
 await db.query('INSERT INTO wallet_topup_credits(topup_id,user_id,tenant_id,delta_cents,balance_after_cents,session_id) VALUES($1,$2,$3,$4,$5,$6)',[t.id,t.user_id,t.tenant_id,t.amount_cents,after,s.id]);
 const update=await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents+$1 WHERE user_id=$2 AND tenant_id=$3',[t.amount_cents,t.user_id,t.tenant_id]);
 if(update.rowCount!==1)throw Error('Wallet update failed');
 await db.query("UPDATE wallet_topups SET status='paid',session_id=$1,paid_at=UTC_TIMESTAMP(3) WHERE id=$2",[s.id,t.id]);
 return {credited:true,balanceCents:after};
}
export async function acceptTopupEvent(db,tenant,event){
 const s=event.data?.object;
 if(s?.metadata?.purpose!=='wallet_topup')return false;
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return true;
 const t=(await db.query('SELECT * FROM wallet_topups WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[s.client_reference_id,tenant])).rows[0];
 if(!t||event.livemode!==true||s.metadata?.tenant_id!==tenant||s.metadata?.user_id!==t.user_id||s.livemode!==true||(t.session_id&&t.session_id!==s.id))throw Error('Top-up event mismatch');
 const prior=await db.query('INSERT IGNORE INTO wallet_topup_events(event_id,tenant_id,topup_id,event_type) VALUES($1,$2,$3,$4)',[event.id,tenant,t.id,event.type]);
 if(!prior.rowCount)return true;
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&s.payment_status==='paid')await creditConfirmedTopup(db,t,s);
 else if(t.status!=='paid'&&['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type))await db.query('UPDATE wallet_topups SET status=$1,session_id=$2 WHERE id=$3',[event.type.endsWith('expired')?'expired':'failed',s.id,t.id]);
 return true;
}
const publicTopup=t=>({id:t.id,amountCents:Number(t.amount_cents),currency:t.currency,status:t.status,createdAt:t.created_at,paidAt:t.paid_at,url:t.checkout_url});
export async function verifyTopup(pool,t,{fetchImpl=fetch}={}){
 if(t.status==='paid')return {status:'paid',duplicate:true};
 if(!t.session_id)return {status:t.status,note:'Checkout not confirmed. Retry the original checkout request; do not start a replacement payment.'};
 const g=await stripeGateway(pool,t.tenant_id);if(!g||g.mode!=='live'||!paymentKey())throw Error('Original live Stripe configuration required');
 const session=await stripeRequest(g,'checkout/sessions/'+encodeURIComponent(t.session_id),{fetchImpl});
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const current=(await db.query('SELECT * FROM wallet_topups WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[t.id,t.tenant_id])).rows[0];
  if(!current)throw Error('Top-up unavailable');
  if(session.payment_status!=='paid'){await db.query('ROLLBACK');return {status:current.status,note:'Payment is not yet confirmed.'};}
  const result=await creditConfirmedTopup(db,current,session);await db.query('COMMIT');return {status:'paid',...result};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function handleWalletFunding({req,res,path,user,pool,send,readJson,origin,fetchImpl=fetch}){
 if(!user.features?.billing)return send(res,403,{error:'Billing unavailable'});
 if(path==='/api/wallet/topups'&&req.method==='GET'){const rows=await pool.query('SELECT * FROM wallet_topups WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50',[user.tenant_id,user.id]);return send(res,200,{topups:rows.rows.map(publicTopup)});}
 const verify=/^\/api\/wallet\/topups\/([0-9a-f-]{36})\/verify$/i.exec(path);
 if(verify&&req.method==='POST'){
  const t=(await pool.query('SELECT * FROM wallet_topups WHERE id=$1 AND tenant_id=$2 AND user_id=$3',[verify[1],user.tenant_id,user.id])).rows[0];
  if(!t)return send(res,404,{error:'Top-up unavailable'});
  try{return send(res,200,await verifyTopup(pool,t,{fetchImpl}));}catch{return send(res,502,{error:'Payment verification unavailable or mismatched. No wallet credit was applied.'});}
 }
 if(path!=='/api/wallet/topups'||req.method!=='POST')return send(res,405,{error:'Method unavailable'});
 const b=await readJson(req);
 if(!Number.isSafeInteger(b.amountCents)||b.amountCents<50||b.amountCents>1000000||!uuid.test(b.idempotencyKey||''))return send(res,400,{error:'Valid USD cents amount and request ID required'});
 const caps=await fundingCapabilities(pool,user.tenant_id);
 if(!caps.fundingAvailable)return send(res,503,{error:caps.fundingNote});
 if(b.amountCents<caps.minCents||b.amountCents>caps.maxCents)return send(res,400,{error:'Amount is outside the configured top-up limits'});
 const g=await stripeGateway(pool,user.tenant_id),db=await pool.connect();let t;
 try{
  await db.query('START TRANSACTION');
  // Account lock serializes identical request creation, including across replicas.
  const account=(await db.query("SELECT email FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE",[user.id,user.tenant_id])).rows[0];
  if(!account)throw Error('Active account required');
  t=(await db.query('SELECT * FROM wallet_topups WHERE tenant_id=$1 AND user_id=$2 AND idempotency_key=$3 FOR UPDATE',[user.tenant_id,user.id,b.idempotencyKey])).rows[0];
  if(t&&Number(t.amount_cents)!==b.amountCents){await db.query('ROLLBACK');return send(res,409,{error:'Request ID already used for a different amount'});}
  if(!t){t={id:randomUUID(),tenant_id:user.tenant_id,user_id:user.id,amount_cents:b.amountCents,currency:'USD',status:'creating',expires_epoch:Math.floor(Date.now()/1000)+3600};await db.query('INSERT INTO wallet_topups(id,tenant_id,user_id,idempotency_key,amount_cents,expires_epoch) VALUES($1,$2,$3,$4,$5,$6)',[t.id,t.tenant_id,t.user_id,b.idempotencyKey,t.amount_cents,t.expires_epoch]);}
  t.email=account.email;await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 if(t.status==='paid')return send(res,200,{...publicTopup(t),alreadyPaid:true});
 if(t.status==='open'&&t.checkout_url&&Number(t.expires_epoch)>Date.now()/1000)return send(res,200,{...publicTopup(t)});
 if(t.status!=='creating'||Number(t.expires_epoch)<Date.now()/1000+1800)return send(res,409,{error:'This checkout cannot be retried. Check its payment status before starting a new top-up.'});
 try{
  const body=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',client_reference_id:t.id,customer_email:t.email,success_url:origin+'/?wallet_topup='+t.id+'#money',cancel_url:origin+'/?wallet_topup='+t.id+'#money',expires_at:String(t.expires_epoch),'metadata[purpose]':'wallet_topup','metadata[tenant_id]':t.tenant_id,'metadata[user_id]':t.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(t.amount_cents),'line_items[0][price_data][product_data][name]':'Olamide account top-up','line_items[0][quantity]':'1'});
  const s=await stripeRequest(g,'checkout/sessions',{body,idempotencyKey:'wallet-topup-'+t.id,fetchImpl});
  const url=new URL(s.url);
  if(!/^cs_live_[A-Za-z0-9]+$/.test(s.id||'')||s.livemode!==true||url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.username||url.password||url.port)throw Error('Invalid checkout');
  await pool.query("UPDATE wallet_topups SET session_id=$1,checkout_url=$2,status='open' WHERE id=$3 AND status='creating'",[s.id,url.href,t.id]);
  return send(res,201,{id:t.id,status:'open',url:url.href,amountCents:t.amount_cents});
 }catch{return send(res,502,{error:'Checkout response unavailable. Retry with the same request ID; no replacement charge will be created.'});}
}
export async function handleWalletFundingAdmin({req,res,path,user,pool,send,readJson,fetchImpl=fetch}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(path==='/api/admin/wallet-funding'&&req.method==='GET'){
  const [capabilities,topups,wallets]=await Promise.all([fundingCapabilities(pool,user.tenant_id),pool.query('SELECT t.*,u.email FROM wallet_topups t JOIN users u ON u.id=t.user_id WHERE t.tenant_id=$1 ORDER BY t.created_at DESC LIMIT 100',[user.tenant_id]),pool.query("SELECT u.email,w.balance_cents,(SELECT COALESCE(SUM(c.reserved_cents),0) FROM pstn_calls c WHERE c.user_id=w.user_id AND c.tenant_id=w.tenant_id AND c.status<>'settled') AS reserved_cents FROM wallet_accounts w JOIN users u ON u.id=w.user_id WHERE w.tenant_id=$1 ORDER BY u.email LIMIT 1000",[user.tenant_id])]);
  return send(res,200,{...capabilities,tenantId:user.tenant_id,wallets:wallets.rows.map(w=>({email:w.email,availableBalanceCents:Number(w.balance_cents),reservedBalanceCents:Number(w.reserved_cents),accountBalanceCents:Number(w.balance_cents)+Number(w.reserved_cents)})),webhookUrl:(process.env.PUBLIC_ORIGIN||'')+'/api/webhooks/stripe/'+user.tenant_id,topups:topups.rows.map(t=>({...publicTopup(t),email:t.email}))});
 }
 if(path==='/api/admin/wallet-funding'&&req.method==='PUT'){
  const b=await readJson(req);
  if(typeof b.enabled!=='boolean'||!Number.isSafeInteger(b.minCents)||!Number.isSafeInteger(b.maxCents)||b.minCents<50||b.maxCents<b.minCents||b.maxCents>1000000||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)return send(res,400,{error:'Valid limits ($0.50 to $10,000), enabled flag and revision required'});
  if(b.enabled&&!liveReady(await stripeGateway(pool,user.tenant_id)))return send(res,409,{error:'Configure and enable live Stripe credentials and a webhook signing secret first'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
   const p=await fundingPolicy(db,user.tenant_id);
   if(p.revision!==b.expectedRevision){await db.query('ROLLBACK');return send(res,409,{error:'Settings changed. Refresh before saving.'});}
   await db.query('INSERT INTO wallet_funding_policy(tenant_id,enabled,min_cents,max_cents,revision,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),min_cents=VALUES(min_cents),max_cents=VALUES(max_cents),revision=VALUES(revision),updated_by=VALUES(updated_by)',[user.tenant_id,b.enabled,b.minCents,b.maxCents,p.revision+1,user.id]);
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'wallet_funding_policy_updated')",[randomUUID(),user.tenant_id,user.id]);
   await db.query('COMMIT');return send(res,200,{updated:true,revision:p.revision+1});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 const verify=/^\/api\/admin\/wallet-funding\/([0-9a-f-]{36})\/verify$/i.exec(path);
 if(verify&&req.method==='POST'){
  const t=(await pool.query('SELECT * FROM wallet_topups WHERE id=$1 AND tenant_id=$2',[verify[1],user.tenant_id])).rows[0];
  if(!t)return send(res,404,{error:'Top-up unavailable'});
  try{const result=await verifyTopup(pool,t,{fetchImpl});await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'wallet_topup_rechecked')",[randomUUID(),user.tenant_id,user.id]);return send(res,200,result);}catch{return send(res,502,{error:'Payment verification unavailable or mismatched. No credit was applied.'});}
 }
 return send(res,405,{error:'Method unavailable'});
}
export function startWalletFundingReconciliation(pool){
 let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{const rows=await pool.query("SELECT * FROM wallet_topups WHERE status IN ('creating','open') AND session_id IS NOT NULL AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) ORDER BY COALESCE(last_checked_at,created_at) LIMIT 20");for(const t of rows.rows){try{await verifyTopup(pool,t);}catch{/* Signed webhooks remain retryable; never credit an unverified payment. */}finally{await pool.query('UPDATE wallet_topups SET last_checked_at=UTC_TIMESTAMP(3) WHERE id=$1',[t.id]);}}}catch{console.error('Wallet top-up reconciliation unavailable');}finally{busy=false;}},60000);timer.unref();return ()=>clearInterval(timer);
}
