import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHmac,timingSafeEqual} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=()=>/^[0-9a-f]{64}$/i.test(process.env.PAYMENT_CONFIG_KEY||'')?Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'):null;
function encrypt(value){const k=key();if(!k)throw new Error('Payment encryption key unavailable');const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);return Buffer.concat([iv,c.update(value,'utf8'),c.final(),c.getAuthTag()]);}
function decrypt(value){const k=key();if(!k)throw new Error('Payment encryption key unavailable');const data=Buffer.from(value),c=createDecipheriv('aes-256-gcm',k,data.subarray(0,12));c.setAuthTag(data.subarray(-16));return Buffer.concat([c.update(data.subarray(12,-16)),c.final()]).toString('utf8');}
export async function migratePayments(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_gateways (
    tenant_id CHAR(36) PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE,
    secret_key_cipher VARBINARY(512) NOT NULL, webhook_secret_cipher VARBINARY(512) NOT NULL,
    mode VARCHAR(8) NOT NULL, updated_by CHAR(36) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_attempts (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,invoice_id CHAR(36) NOT NULL,
    provider VARCHAR(16) NOT NULL DEFAULT 'stripe',status VARCHAR(24) NOT NULL DEFAULT 'creating',
    amount_cents INT NOT NULL,currency CHAR(3) NOT NULL,session_id VARCHAR(255) NULL UNIQUE,checkout_url VARCHAR(2000) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(invoice_id) REFERENCES invoices(id),
    INDEX payment_attempt_invoice(tenant_id,invoice_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_events (
    provider_event_id VARCHAR(255) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,attempt_id CHAR(36) NULL,
    event_type VARCHAR(120) NOT NULL,received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(attempt_id) REFERENCES payment_attempts(id)
  ) ENGINE=InnoDB`);
}
export function verifyStripeSignature(raw,header,secret,now=Date.now()){
  const parts=Object.fromEntries(String(header||'').split(',').map(pair=>pair.trim().split('=').slice(0,2)));
  const timestamp=Number(parts.t);
  if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp*1000)>300000||!/^v1=[0-9a-f]{64}$/i.test(`v1=${parts.v1||''}`))return false;
  const signed=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest();
  const candidate=Buffer.from(parts.v1,'hex');return candidate.length===signed.length&&timingSafeEqual(candidate,signed);
}
async function config(pool,tenant){return (await pool.query('SELECT enabled,mode,secret_key_cipher,webhook_secret_cipher FROM payment_gateways WHERE tenant_id=$1',[tenant])).rows[0];}
function publicConfig(row){return {configured:!!row,enabled:!!row?.enabled,mode:row?.mode||null,secretKeySet:!!row?.secret_key_cipher,webhookSecretSet:!!row?.webhook_secret_cipher};}
export async function handlePaymentAdmin({req,res,path,user,pool,send,readJson}){
  if(!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Administrator required'});
  if(path==='/api/admin/payments/gateway'){
    if(req.method==='GET')return send(res,200,{gateway:publicConfig(await config(pool,user.tenant_id)),encryptionReady:!!key(),webhookUrl:`${process.env.PUBLIC_ORIGIN}/api/webhooks/stripe/${user.tenant_id}`});
    if(req.method==='PUT'){
      const body=await readJson(req),current=await config(pool,user.tenant_id);
      if(typeof body.enabled!=='boolean'||!key()||
        (body.secretKey!==undefined&&(!/^sk_(test|live)_[A-Za-z0-9]{12,}$/.test(body.secretKey)||body.secretKey.length>300))||
        (body.webhookSecret!==undefined&&(!/^whsec_[A-Za-z0-9]{12,}$/.test(body.webhookSecret)||body.webhookSecret.length>300)))
        return send(res,400,{error:'Payment encryption key and valid Stripe credentials required'});
      const secret=body.secretKey?encrypt(body.secretKey):current?.secret_key_cipher;
      const webhook=body.webhookSecret?encrypt(body.webhookSecret):current?.webhook_secret_cipher;
      if(!secret||!webhook)return send(res,400,{error:'Stripe secret key and webhook signing secret required'});
      const mode=(body.secretKey||decrypt(secret)).startsWith('sk_live_')?'live':'test';
      if(body.enabled&&mode==='live'&&!body.confirmLive)return send(res,400,{error:'Confirm live Stripe payments before enabling'});
      await pool.query(`INSERT INTO payment_gateways(tenant_id,enabled,secret_key_cipher,webhook_secret_cipher,mode,updated_by)
        VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),secret_key_cipher=VALUES(secret_key_cipher),
        webhook_secret_cipher=VALUES(webhook_secret_cipher),mode=VALUES(mode),updated_by=VALUES(updated_by)`,
        [user.tenant_id,body.enabled,secret,webhook,mode,user.id]);
      return send(res,200,{gateway:publicConfig({enabled:body.enabled,mode,secret_key_cipher:secret,webhook_secret_cipher:webhook})});
    }
  }
  if(path==='/api/admin/payments/attempts'&&req.method==='GET'){
    const rows=await pool.query('SELECT p.id,p.invoice_id,p.status,p.amount_cents,p.currency,p.created_at,u.email FROM payment_attempts p JOIN users u ON u.id=p.user_id WHERE p.tenant_id=$1 ORDER BY p.created_at DESC LIMIT 100',[user.tenant_id]);
    return send(res,200,{attempts:rows.rows});
  }
  return send(res,404,{error:'Payment route unavailable'});
}
export async function handlePaymentCheckout({req,res,user,pool,send,readJson,origin,fetchImpl=fetch}){
  if(!user.features?.billing)return send(res,403,{error:'Billing unavailable'});
  const {invoiceId}=await readJson(req);
  if(!uuid.test(invoiceId||''))return send(res,400,{error:'Valid invoice ID required'});
  const gateway=await config(pool,user.tenant_id);
  if(!gateway?.enabled||!key())return send(res,503,{error:'Online payment unavailable'});
  const db=await pool.connect();let attempt,invoice;
  try{
    await db.query('START TRANSACTION');
    invoice=(await db.query('SELECT i.id,i.description,i.amount_cents,i.currency,i.status,u.email FROM invoices i JOIN users u ON u.id=i.user_id WHERE i.id=$1 AND i.user_id=$2 AND u.tenant_id=$3 FOR UPDATE',[invoiceId,user.id,user.tenant_id])).rows[0];
    if(!invoice||invoice.status!=='unpaid'||invoice.amount_cents<1||invoice.currency!=='USD'){
      await db.query('ROLLBACK');return send(res,409,{error:'Unpaid USD invoice required'});
    }
    const active=(await db.query("SELECT id,status,checkout_url FROM payment_attempts WHERE invoice_id=$1 AND tenant_id=$2 AND status IN ('creating','open') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[invoiceId,user.tenant_id])).rows[0];
    if(active){await db.query('ROLLBACK');return active.checkout_url?send(res,200,{url:active.checkout_url,attemptId:active.id}):send(res,409,{error:'Checkout is being created; retry shortly'});}
    attempt=randomUUID();
    await db.query("INSERT INTO payment_attempts(id,tenant_id,user_id,invoice_id,amount_cents,currency) VALUES($1,$2,$3,$4,$5,$6)",[attempt,user.tenant_id,user.id,invoice.id,invoice.amount_cents,invoice.currency]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  try{
    const body=new URLSearchParams({'mode':'payment','client_reference_id':attempt,'customer_email':invoice.email,
      'success_url':`${origin}/#billing`,'cancel_url':`${origin}/#billing`,
      'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(invoice.amount_cents),
      'line_items[0][price_data][product_data][name]':invoice.description.slice(0,255),'line_items[0][quantity]':'1'});
    const response=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${decrypt(gateway.secret_key_cipher)}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':attempt},body,signal:AbortSignal.timeout(10000)});
    const session=await response.json();
    if(!response.ok||!/^cs_(test|live)_/.test(session.id||'')||!/^https:\/\/checkout\.stripe\.com\//.test(session.url||''))throw new Error('Stripe Checkout unavailable');
    await pool.query("UPDATE payment_attempts SET status='open',session_id=$1,checkout_url=$2 WHERE id=$3 AND status='creating'",[session.id,session.url,attempt]);
    return send(res,201,{url:session.url,attemptId:attempt});
  }catch(error){await pool.query("UPDATE payment_attempts SET status='failed' WHERE id=$1 AND status='creating'",[attempt]);return send(res,502,{error:'Unable to start Stripe Checkout'});}
}
export async function handleStripeWebhook({req,res,path,pool,send}){
  if(req.method!=='POST')return send(res,405,{error:'POST required'});
  const tenant=/^\/api\/webhooks\/stripe\/([0-9a-f-]{36})$/i.exec(path)?.[1];
  if(!uuid.test(tenant||''))return send(res,404,{error:'Webhook unavailable'});
  const gateway=await config(pool,tenant);
  if(!gateway?.enabled||!key())return send(res,404,{error:'Webhook unavailable'});
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1024*1024)return send(res,413,{error:'Webhook too large'});chunks.push(chunk);}
  const raw=Buffer.concat(chunks);
  if(!verifyStripeSignature(raw,req.headers['stripe-signature'],decrypt(gateway.webhook_secret_cipher)))return send(res,400,{error:'Invalid Stripe signature'});
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return send(res,400,{error:'Invalid event'});}
  if(!/^evt_[A-Za-z0-9]+$/.test(event.id||'')||typeof event.type!=='string'||event.type.length>120)return send(res,400,{error:'Invalid event'});
  const session=event.data?.object,paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&session?.payment_status==='paid';
  const db=await pool.connect();
  try{
    await db.query('START TRANSACTION');
    const inserted=await db.query('INSERT IGNORE INTO payment_events(provider_event_id,tenant_id,event_type) VALUES($1,$2,$3)',[event.id,tenant,event.type]);
    if(!inserted.rowCount){await db.query('COMMIT');return send(res,200,{received:true,duplicate:true});}
    if(paid){
      const attempt=(await db.query('SELECT id,invoice_id,user_id,amount_cents,currency,session_id,status FROM payment_attempts WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[session.client_reference_id,tenant])).rows[0];
      if(!attempt||!['creating','open','paid'].includes(attempt.status)||
        (attempt.session_id&&attempt.session_id!==session.id)||session.mode!=='payment'||
        Number(session.amount_total)!==attempt.amount_cents||String(session.currency).toUpperCase()!==attempt.currency){
        await db.query('ROLLBACK');return send(res,409,{error:'Payment reconciliation mismatch'});
      }
      const invoice=(await db.query('SELECT status,amount_cents,currency FROM invoices WHERE id=$1 AND user_id=$2 FOR UPDATE',[attempt.invoice_id,attempt.user_id])).rows[0];
      if(!invoice||invoice.status==='void'||invoice.amount_cents!==attempt.amount_cents||invoice.currency!==attempt.currency){
        await db.query('ROLLBACK');return send(res,409,{error:'Invoice reconciliation mismatch'});
      }
      await db.query("UPDATE payment_attempts SET status='paid',session_id=$1 WHERE id=$2",[session.id,attempt.id]);
      await db.query("UPDATE invoices SET status='paid' WHERE id=$1 AND user_id=$2 AND status='unpaid'",[attempt.invoice_id,attempt.user_id]);
      await db.query('UPDATE payment_events SET attempt_id=$1 WHERE provider_event_id=$2',[attempt.id,event.id]);
    }
    await db.query('COMMIT');return send(res,200,{received:true});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
