import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { validateRegistration, hashPassword } from './security.js';
import { randomUUID } from 'node:crypto';
import { defaultTenantId } from './tenancy.js';
import { createSipAccount, provisionSipAccount } from './sipMarketplace.js';

const codeHash = (id, code, secret) => createHash('sha256').update(`${id}:${code}:${secret}`).digest('hex');
const emailAddress = value => typeof value === 'string' && value.length <= 254 ? value.trim().toLowerCase() : '';
const configured = () => !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.OTP_HMAC_SECRET?.length >= 32);

export async function migrateOnboarding(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS user_profiles (
    user_id CHAR(36) PRIMARY KEY, phone_e164 VARCHAR(16) NOT NULL,
    address_line1 VARCHAR(160) NOT NULL, address_line2 VARCHAR(160) NOT NULL DEFAULT '',
    city VARCHAR(100) NOT NULL, region VARCHAR(100) NOT NULL, postal_code VARCHAR(32) NOT NULL,
    country CHAR(2) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX profile_phone(phone_e164)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS signup_otps (
    user_id CHAR(36) PRIMARY KEY, code_hash CHAR(64) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME(3) NOT NULL, sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS passkeys (
    id VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, user_id CHAR(36) NOT NULL,
    public_key BLOB NOT NULL, counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
    transports JSON NOT NULL, device_type VARCHAR(32) NOT NULL,
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX passkeys_user(user_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS passkey_challenges (
    user_id CHAR(36) NOT NULL, purpose VARCHAR(16) NOT NULL,
    challenge VARCHAR(255) NOT NULL, expires_at DATETIME(3) NOT NULL,
    PRIMARY KEY(user_id,purpose), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

async function sendCode(email, code, origin) {
  const url = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
  if (url !== 'https://api.resend.com/emails' &&
      !(origin.startsWith('http://127.0.0.1:') && /^http:\/\/127\.0\.0\.1:\d+\/emails$/.test(url)))
    throw new Error('Invalid email delivery URL');
  const response = await fetch(url, {
    method:'POST', signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json'},
    body:JSON.stringify({from:process.env.RESEND_FROM,to:[email],subject:'Verify your Olamide account',
      text:`Your Olamide verification code is ${code}. It expires in 10 minutes. If you did not register, ignore this message.`})
  });
  if (!response.ok) throw new Error('Email delivery failed');
}

export async function handleOnboarding({req,res,path,pool,send,readJson,origin}) {
  if (path === '/api/register' && req.method === 'POST') {
    if (!configured()) return send(res,503,{error:'Email verification is not configured'});
    const data = validateRegistration(await readJson(req));
    const {salt,hash} = await hashPassword(data.password);
    const id=randomUUID(), code=String(randomInt(0,1000000)).padStart(6,'0');
    const db=await pool.connect();
    try {
      await db.query('START TRANSACTION');
      await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,status) VALUES($1,$2,$3,$4,$5,$6,'pending_email')",
        [id,defaultTenantId,data.name,data.email,salt,hash]);
      await db.query('INSERT INTO user_profiles(user_id,phone_e164,address_line1,address_line2,city,region,postal_code,country) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [id,data.phone,data.address1,data.address2,data.city,data.region,data.postalCode,data.country]);
      await db.query("INSERT INTO user_group_members(user_id,group_id) VALUES($1,'00000000-0000-4000-8000-000000000001')",[id]);
      await db.query('INSERT INTO signup_otps(user_id,code_hash,expires_at) VALUES($1,$2,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE))',
        [id,codeHash(id,code,process.env.OTP_HMAC_SECRET)]);
      await db.query('COMMIT');
    } catch(error) {
      await db.query('ROLLBACK');
      if(error.code==='ER_DUP_ENTRY') return send(res,409,{error:'Account already exists'});
      throw error;
    } finally {db.release();}
    try {await sendCode(data.email,code,origin);}
    catch(error) {console.error('Verification delivery failed',error.name);return send(res,503,{error:'Email delivery unavailable. Use resend code later.'});}
    return send(res,201,{email:data.email,verificationRequired:true});
  }
  if (path === '/api/register/resend' && req.method === 'POST') {
    if(!configured()) return send(res,503,{error:'Email verification is not configured'});
    const {email}=await readJson(req);const normalized=emailAddress(email);
    if(!normalized) return send(res,400,{error:'Valid email required'});
    const db=await pool.connect();let delivery=null;
    try {
      await db.query('START TRANSACTION');
      const found=await db.query("SELECT u.id,o.sent_at FROM users u JOIN signup_otps o ON o.user_id=u.id WHERE u.email=$1 AND u.status='pending_email' FOR UPDATE",[normalized]);
      if(found.rowCount && Date.now()-new Date(found.rows[0].sent_at).getTime()>=60000) {
        const id=found.rows[0].id,code=String(randomInt(0,1000000)).padStart(6,'0');
        await db.query('UPDATE signup_otps SET code_hash=$1,attempts=0,expires_at=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE),sent_at=UTC_TIMESTAMP(3) WHERE user_id=$2',
          [codeHash(id,code,process.env.OTP_HMAC_SECRET),id]);delivery={email:normalized,code};
      }
      await db.query('COMMIT');
    } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
    if(delivery) try {await sendCode(delivery.email,delivery.code,origin);} catch(error) {console.error('Verification resend failed',error.name);return send(res,503,{error:'Email delivery unavailable'});}
    return send(res,200,{status:'If this account is awaiting verification, a code has been sent when eligible.'});
  }
  if (path === '/api/register/verify' && req.method === 'POST') {
    if(!configured()) return send(res,503,{error:'Email verification is not configured'});
    const {email,code}=await readJson(req);const normalized=emailAddress(email);
    if(!normalized || typeof code!=='string' || !/^\d{6}$/.test(code)) return send(res,400,{error:'Email and six-digit code required'});
    const db=await pool.connect();let verified=false;
    try {
      await db.query('START TRANSACTION');
      const found=await db.query("SELECT u.id,o.code_hash,o.attempts,o.expires_at FROM users u JOIN signup_otps o ON o.user_id=u.id WHERE u.email=$1 AND u.status='pending_email' FOR UPDATE",[normalized]);
      const row=found.rows[0];
      if(row && row.attempts<5 && new Date(row.expires_at).getTime()>Date.now()) {
        verified=timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(codeHash(row.id,code,process.env.OTP_HMAC_SECRET),'hex'));
        if(verified) {
          await db.query("UPDATE users SET status='active' WHERE id=$1 AND status='pending_email'",[row.id]);
          await createSipAccount(db,row.id,new URL(origin).hostname);
          await db.query('DELETE FROM signup_otps WHERE user_id=$1',[row.id]);
        } else await db.query('UPDATE signup_otps SET attempts=attempts+1 WHERE user_id=$1',[row.id]);
      }
      await db.query('COMMIT');
    } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
    if(verified) {
      const account=(await pool.query('SELECT user_id FROM sip_accounts WHERE user_id=(SELECT id FROM users WHERE email=$1)',[normalized])).rows[0];
      if(account) await provisionSipAccount(pool,account.user_id);
    }
    return send(res,verified?200:400,verified?{status:'verified',sipProvisioning:'Check account status after sign-in'}:{error:'Invalid or expired code. Request another code if needed.'});
  }
  return send(res,404,{error:'Registration route unavailable'});
}
