import {provisionKamailioAccount} from './kamailioAccounts.js';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { verifyPassword } from './security.js';
import { isAdmin } from './tenancy.js';
import { sipProfilePermissions } from './sipProfiles.js';

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

export function credentialKey(){const value=process.env.SIP_CREDENTIAL_KEY;
  return /^[0-9a-f]{64}$/i.test(value||'')?Buffer.from(value,'hex'):null;}
export function encrypt(secret,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]);}
function decrypt(value,key){const buffer=Buffer.from(value),iv=buffer.subarray(0,12),tag=buffer.subarray(buffer.length-16);
  const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(buffer.subarray(12,-16)),cipher.final()]).toString('utf8');}
export async function createSipAccount(db,userId,domain) {
  const existing=(await db.query("SELECT id,username,status FROM sip_accounts WHERE user_id=$1",[userId])).rows[0];
  if(existing) return existing;
  const owner=(await db.query("SELECT tenant_id FROM users WHERE id=$1",[userId])).rows[0];
  if(!owner) throw new Error("Account owner unavailable");
  const id=randomUUID();
  // Stable collision-resistant identifier; switch authorization remains separate.
  const username='ol'+randomBytes(12).toString('hex');
  const key=credentialKey();const password=key?randomBytes(32).toString('base64url'):null;
  await db.query("INSERT INTO sip_accounts(id,user_id,tenant_id,username,domain,status,secret_cipher) VALUES($1,$2,$3,$4,$5,'awaiting_switch',$6)",
    [id,userId,owner.tenant_id,username,domain,password?encrypt(password,key):null]);
  return {id,username,status:'awaiting_switch'};
}

export async function provisionSipAccount(pool,userId){
  const url=process.env.SIP_PROVISION_URL,token=process.env.SIP_PROVISION_TOKEN,key=credentialKey();
  const local=process.env.SIP_PROVISION_MODE==='kamailio_local';
  if(!key||(!local&&(!url||!token||!/^https:\/\//.test(url)))) return false;
  const account=(await pool.query('SELECT id,tenant_id,username,domain,secret_cipher FROM sip_accounts WHERE user_id=$1 AND status=\'awaiting_switch\' AND EXISTS (SELECT 1 FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=sip_accounts.user_id AND u.status=\'active\' AND t.status=\'active\')',[userId])).rows[0];
  if(!account?.secret_cipher) return false;
  try {
    if(local) await provisionKamailioAccount(pool,account,decrypt(account.secret_cipher,key));
    else {
    const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':account.id},
      body:JSON.stringify({accountId:account.id,tenantId:account.tenant_id,userId,
        username:account.username,password:decrypt(account.secret_cipher,key),domain:account.domain})});
    if(!response.ok) throw new Error(`Switch provisioning HTTP ${response.status}`);
    const result=await response.json();
    if(result.status!=='active') throw new Error('Switch did not acknowledge activation');
    }
    const updated=await pool.query("UPDATE sip_accounts SET status='active' WHERE id=$1 AND status='awaiting_switch' AND EXISTS (SELECT 1 FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=sip_accounts.user_id AND u.status='active' AND t.status='active')",[account.id]);
    return updated.rowCount===1;
  } catch(error){console.error('SIP provisioning pending',error.code||(/authenticate data/.test(error.message||'')?'SIP_CREDENTIAL_KEY_MISMATCH':error.name));return false;}
}

export async function automaticSipSession(pool,user) {
  const key=credentialKey();
  if(!key)return {status:'pending',note:'SIP credential encryption is not configured'};
  const db=await pool.connect();let locked=false;
  try {
    locked=Number((await db.query("SELECT GET_LOCK($1,0) AS acquired",['sip-login-'+user.id])).rows[0]?.acquired)===1;
    if(!locked)return {status:'pending',note:'SIP provisioning is already in progress'};
    const owner=(await db.query("SELECT u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.status='active' AND t.status='active'",[user.id,user.tenant_id])).rows[0];
    if(!owner)return {status:'unavailable',note:'SIP account owner is unavailable in this workspace'};
    const domain=process.env.SIP_ACCOUNT_DOMAIN||new URL(process.env.PUBLIC_ORIGIN||'http://localhost').hostname;
    await createSipAccount(db,user.id,domain);
    await db.query('UPDATE sip_accounts SET secret_cipher=$1 WHERE user_id=$2 AND tenant_id=$3 AND secret_cipher IS NULL AND status=\'awaiting_switch\'',[encrypt(randomBytes(32).toString('base64url'),key),user.id,user.tenant_id]);
    let account=(await db.query('SELECT username,domain,status,secret_cipher FROM sip_accounts WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
    if(account?.status==='awaiting_switch') {
      await provisionSipAccount(db,user.id);
      account=(await db.query('SELECT username,domain,status,secret_cipher FROM sip_accounts WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
    }
    if(account?.status!=='active'||!account.secret_cipher)return {status:'pending',note:'Your SIP account is waiting for switch activation'};
    const setting=(await db.query("SELECT value FROM tenant_settings WHERE tenant_id=$1 AND setting_key='sip_wss_url'",[user.tenant_id])).rows[0]?.value;
    const wssUrl=setting||process.env.SIP_WSS_URL||'wss://'+new URL(process.env.PUBLIC_ORIGIN||'http://localhost').host+'/ws';
    let transport;
    try {transport=new URL(wssUrl);} catch {return {status:'pending',note:'Secure SIP WebSocket URL is invalid'};}
    if(transport.protocol!=='wss:'||transport.username||transport.password||transport.hash)
      return {status:'pending',note:'Secure SIP WebSocket URL is invalid'};
    return {status:'active',aor:`sip:${account.username}@${account.domain}`,wssUrl,
      username:account.username,domain:account.domain,password:decrypt(account.secret_cipher,key)};
  }finally{try{if(locked)await db.query('SELECT RELEASE_LOCK($1)',['sip-login-'+user.id]);}finally{db.release();}}
}

export async function handleSipMarketplace({req,res,path,user,pool,send,readJson}) {
  if(path.startsWith('/api/dialplan/') && !user.features?.billing && !isAdmin(user))
    return send(res,403,{error:'Billing unavailable for your groups'});
  if(path.startsWith('/api/sip-account') && !(await sipProfilePermissions(pool,user)).view)
    return send(res,403,{error:'SIP profile view permission required'});
  if(path==='/api/sip-account/session' && req.method==='POST') {
    res.setHeader('Cache-Control','no-store');
    if(user.must_change_password||user.passkeyGate)return send(res,403,{error:'Complete sign-in requirements first'});
    const result=await automaticSipSession(pool,user);
    return send(res,result.status==='active'?200:result.status==='pending'?202:403,result);
  }
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
