import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { verifyPassword } from './security.js';
import { defaultTenantId, isAdmin } from './tenancy.js';

export async function migrateSipMarketplace(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS sip_accounts (
    id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL UNIQUE, tenant_id CHAR(36) NOT NULL,
    username VARCHAR(64) NOT NULL UNIQUE, domain VARCHAR(255) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'awaiting_switch', secret_cipher VARBINARY(256) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dialplan_offers (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL, description VARCHAR(1000) NOT NULL,
    monthly_cents INT UNSIGNED NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    INDEX offer_catalog(tenant_id,status,name)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dialplan_orders (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
    offer_id CHAR(36) NOT NULL, invoice_id CHAR(36) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending_payment',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id), FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(offer_id) REFERENCES dialplan_offers(id), FOREIGN KEY(invoice_id) REFERENCES invoices(id),
    INDEX dialplan_orders_user(tenant_id,user_id,created_at)
  ) ENGINE=InnoDB`);
}

function credentialKey(){const value=process.env.SIP_CREDENTIAL_KEY;
  return /^[0-9a-f]{64}$/i.test(value||'')?Buffer.from(value,'hex'):null;}
function encrypt(secret,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]);}
function decrypt(value,key){const buffer=Buffer.from(value),iv=buffer.subarray(0,12),tag=buffer.subarray(buffer.length-16);
  const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(buffer.subarray(12,-16)),cipher.final()]).toString('utf8');}
export async function createSipAccount(db,userId,domain) {
  const id=randomUUID();
  // Stable collision-resistant identifier; switch authorization remains separate.
  const username='ol'+randomBytes(12).toString('hex');
  const key=credentialKey();const password=key?randomBytes(32).toString('base64url'):null;
  await db.query("INSERT INTO sip_accounts(id,user_id,tenant_id,username,domain,status,secret_cipher) VALUES($1,$2,$3,$4,$5,'awaiting_switch',$6)",
    [id,userId,defaultTenantId,username,domain,password?encrypt(password,key):null]);
  return {id,username,status:'awaiting_switch'};
}

export async function provisionSipAccount(pool,userId){
  const url=process.env.SIP_PROVISION_URL,token=process.env.SIP_PROVISION_TOKEN,key=credentialKey();
  if(!url||!token||!key||!/^https:\/\//.test(url)) return false;
  const account=(await pool.query('SELECT id,tenant_id,username,domain,secret_cipher FROM sip_accounts WHERE user_id=$1 AND status=\'awaiting_switch\'',[userId])).rows[0];
  if(!account?.secret_cipher) return false;
  try {
    const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':account.id},
      body:JSON.stringify({accountId:account.id,tenantId:account.tenant_id,userId,
        username:account.username,password:decrypt(account.secret_cipher,key),domain:account.domain})});
    if(!response.ok) throw new Error(`Switch provisioning HTTP ${response.status}`);
    const result=await response.json();
    if(result.status!=='active') throw new Error('Switch did not acknowledge activation');
    await pool.query("UPDATE sip_accounts SET status='active' WHERE id=$1 AND status='awaiting_switch'",[account.id]);
    return true;
  } catch(error){console.error('SIP provisioning pending',error.name);return false;}
}

export async function handleSipMarketplace({req,res,path,user,pool,send,readJson}) {
  if(path.startsWith('/api/dialplan/') && !user.features?.billing && !isAdmin(user))
    return send(res,403,{error:'Billing unavailable for your groups'});
  if(path==='/api/sip-account' && req.method==='GET') {
    const account=await pool.query('SELECT id,username,domain,status,created_at FROM sip_accounts WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);
    return send(res,200,{account:account.rows[0]||null,
      note:'Switch credentials and live SIP service require commissioned provisioning.'});
  }
  if(path==='/api/sip-account/credentials' && req.method==='POST') {
    const {password}=await readJson(req),key=credentialKey();
    if(typeof password!=='string'||!key) return send(res,503,{error:'SIP credentials unavailable'});
    const account=(await pool.query("SELECT u.password_salt,u.password_hash,s.username,s.domain,s.secret_cipher,s.status FROM users u JOIN sip_accounts s ON s.user_id=u.id WHERE u.id=$1 AND s.tenant_id=$2 AND u.auth_source='local'",[user.id,user.tenant_id])).rows[0];
    if(!account||!await verifyPassword(password,account.password_salt,account.password_hash)) return send(res,401,{error:'Invalid account password'});
    if(account.status!=='active'||!account.secret_cipher) return send(res,409,{error:'SIP account is awaiting switch activation'});
    return send(res,200,{username:account.username,domain:account.domain,password:decrypt(account.secret_cipher,key)});
  }
  if(path==='/api/dialplan/offers' && req.method==='GET') {
    const rows=await pool.query("SELECT id,name,description,monthly_cents,currency FROM dialplan_offers WHERE tenant_id=$1 AND status='published' ORDER BY name LIMIT 200",[user.tenant_id]);
    return send(res,200,{offers:rows.rows});
  }
  if(path==='/api/dialplan/orders' && req.method==='GET') {
    const rows=await pool.query('SELECT o.id,o.status,o.created_at,d.name,d.monthly_cents,d.currency FROM dialplan_orders o JOIN dialplan_offers d ON d.id=o.offer_id WHERE o.tenant_id=$1 AND o.user_id=$2 ORDER BY o.created_at DESC LIMIT 100',[user.tenant_id,user.id]);
    return send(res,200,{orders:rows.rows});
  }
  if(path==='/api/dialplan/orders' && req.method==='POST') {
    const {offerId}=await readJson(req);
    if(typeof offerId!=='string'||!/^[0-9a-f-]{36}$/i.test(offerId)) return send(res,400,{error:'Valid offer required'});
    const db=await pool.connect();
    try {
      await db.query('START TRANSACTION');
      const offer=(await db.query("SELECT id,name,monthly_cents,currency FROM dialplan_offers WHERE id=$1 AND tenant_id=$2 AND status='published' FOR UPDATE",[offerId,user.tenant_id])).rows[0];
      if(!offer){await db.query('ROLLBACK');return send(res,404,{error:'Offer unavailable'});}
      const invoiceId=randomUUID(),id=randomUUID();
      await db.query("INSERT INTO invoices(id,user_id,description,amount_cents,currency,status) VALUES($1,$2,$3,$4,$5,'unpaid')",[invoiceId,user.id,`Dial plan request: ${offer.name}`,offer.monthly_cents,offer.currency]);
      await db.query('INSERT INTO dialplan_orders(id,tenant_id,user_id,offer_id,invoice_id) VALUES($1,$2,$3,$4,$5)',[id,user.tenant_id,user.id,offer.id,invoiceId]);
      await db.query('COMMIT');
      return send(res,201,{id,invoiceId,status:'pending_payment'});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  if(path==='/api/admin/dialplan/offers' && req.method==='GET') {
    if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});
    const rows=await pool.query('SELECT id,name,description,monthly_cents,currency,status FROM dialplan_offers WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',[user.tenant_id]);
    return send(res,200,{offers:rows.rows});
  }
  if(path==='/api/admin/dialplan/offers' && req.method==='POST') {
    if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});
    const {name,description,monthlyCents,currency,status}=await readJson(req);
    if(typeof name!=='string'||!name.trim()||name.length>100||typeof description!=='string'||description.length>1000||
      !Number.isSafeInteger(monthlyCents)||monthlyCents<0||monthlyCents>100000000||
      typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||!['draft','published'].includes(status))
      return send(res,400,{error:'Valid offer fields required'});
    const id=randomUUID();
    await pool.query('INSERT INTO dialplan_offers(id,tenant_id,name,description,monthly_cents,currency,status) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id,user.tenant_id,name.trim(),description,monthlyCents,currency,status]);
    return send(res,201,{id,status});
  }
  return send(res,404,{error:'Dial plan route unavailable'});
}
