import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {hashPassword} from './security.js';
import {consumeCaptcha} from './signupCaptcha.js';
import {defaultTenantId} from './tenancy.js';
import {registrationAllowed} from './operationsPolicy.js';
import {ensureDefaultPresence} from './defaultPresence.js';
import {createSipAccount} from './sipMarketplace.js';
import {accountAuthPolicy,validPin,migrateTwilioAccountAuth} from './twilioAccountAuth.js';
import {safeRegistration} from './registrationSafety.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
export const quickSignupDid='+12109050290';
export const quickSmsCode=body=>typeof body==='string'?/^OLAMIDE ([A-F0-9]{16})$/i.exec(body.trim())?.[1].toUpperCase():undefined;
export const normalizeQuickPhone=value=>typeof value==='string'&&/^\+?[1-9]\d{7,14}$/.test(value)?'+'+value.replace(/^\+/,''):null;
export async function migrateQuickSignup(db){
 await migrateTwilioAccountAuth(db);
 await db.query(`CREATE TABLE IF NOT EXISTS quick_signups (
  token_hash CHAR(64) PRIMARY KEY,code_hash CHAR(64) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,name VARCHAR(100) NOT NULL,
  password_salt CHAR(64) NULL,password_hash CHAR(128) NULL,pin_salt CHAR(64) NULL,pin_hash CHAR(128) NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'pending',user_id CHAR(36) NULL,
  expires_at DATETIME(3) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX quick_expiry(expires_at)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS quick_verified_phones (
  phone VARCHAR(16) PRIMARY KEY,user_id CHAR(36) NOT NULL UNIQUE,
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE,verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
}
export function quickInput(b){
 if(!b||typeof b.email!=='string'||b.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()))throw Object.assign(Error('Enter a valid email'),{registrationValidation:true});
 if(typeof b.password!=='string'||b.password.length<12||b.password.length>1024||b.password!==b.confirmPassword)throw Object.assign(Error('Matching passwords of 12–1024 characters required'),{registrationValidation:true});
 if(b.pin&&!validPin(b.pin))throw Object.assign(Error('Choose a nontrivial account PIN of 6 to 8 digits'),{registrationValidation:true});
 return {email:b.email.trim().toLowerCase(),name:'New member'};
}
function ready(){return (process.env.FLOWROUTE_WEBHOOK_TOKEN||'').length>=32&&
 (!process.env.FLOWROUTE_WEBHOOK_TENANT_ID||process.env.FLOWROUTE_WEBHOOK_TENANT_ID===defaultTenantId);}
async function publicHandler({req,res,path,pool,send,readJson}){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 if(!ready())return send(res,503,{error:'Inbound SMS verification is not configured'});
 const b=await readJson(req);
 if(path==='/api/register/quick/start'){
  const data=quickInput(b),policy=await accountAuthPolicy(pool,defaultTenantId);
  if(policy.signup&&policy.requirePin&&!validPin(b.pin))return send(res,400,{error:'Your administrator requires a nontrivial PIN of 6 to 8 digits'});
  if(!await consumeCaptcha(pool,b.captchaId,b.captchaAnswer))return send(res,400,{error:'Invalid or expired CAPTCHA. Refresh and try again.'});
  if(!await registrationAllowed(pool,data.email))return send(res,403,{error:'Registration is closed or this email domain is not permitted'});
  // Remove expired pending credential hashes. Cap pending requests across all API instances.
  await pool.query('DELETE FROM quick_signups WHERE expires_at<UTC_TIMESTAMP(3) LIMIT 500');
  const db=await pool.connect();let held=false;
  try{
   held=Number((await db.query("SELECT GET_LOCK('quick-signup-start',2) AS acquired")).rows[0]?.acquired)===1;
   if(!held)return send(res,429,{error:'Signup busy; try again shortly'});
   const count=Number((await db.query("SELECT COUNT(*) AS n FROM quick_signups WHERE state='pending' AND expires_at>UTC_TIMESTAMP(3)")).rows[0]?.n||0);
   if(count>=1000)return send(res,429,{error:'Signup capacity reached; try again later'});
   const token=randomBytes(32).toString('hex'),code=randomBytes(8).toString('hex').toUpperCase();
   const password=await hashPassword(b.password),pin=b.pin?await hashPassword(b.pin):null;
   await db.query(`INSERT INTO quick_signups(token_hash,code_hash,email,name,password_salt,password_hash,pin_salt,pin_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`,
    [digest(token),digest(code),data.email,data.name,password.salt,password.hash,pin?.salt||null,pin?.hash||null]);
   return send(res,201,{token,number:quickSignupDid,message:'OLAMIDE '+code,expiresInSeconds:600});
  }finally{if(held)await db.query("SELECT RELEASE_LOCK('quick-signup-start')");db.release();}
 }
 if(path==='/api/register/quick/status'){
  if(!/^[a-f0-9]{64}$/.test(b.token||''))return send(res,400,{error:'Valid signup token required'});
  const row=(await pool.query(`SELECT q.state,q.user_id,q.code_hash,q.created_at,q.expires_at,a.status AS sip_status FROM quick_signups q
   LEFT JOIN sip_accounts a ON a.user_id=q.user_id WHERE q.token_hash=$1 AND q.expires_at>UTC_TIMESTAMP(3)`,[digest(b.token)])).rows[0];
  if(!row)return send(res,410,{error:'Signup expired. Start again.'});
  // Only persisted, authenticated carrier events can establish a phone conflict.
  // This also handles messages whose earlier webhook attempt stopped before activation.
  if(row.state==='pending'){
   const conflict=(await pool.query(`SELECT 1 FROM flowroute_message_events e
    JOIN user_profiles p ON p.phone_e164=CONCAT('+',TRIM(LEADING '+' FROM e.sender))
    WHERE e.tenant_id=$1 AND e.kind='sms'
    AND CONCAT('+',TRIM(LEADING '+' FROM e.recipient))=$2
    AND UPPER(TRIM(e.body)) REGEXP '^OLAMIDE [A-F0-9]{16}$'
    AND SHA2(SUBSTRING(UPPER(TRIM(e.body)),9),256)=$3
    AND e.received_at>= $4 AND e.received_at< $5 LIMIT 1`,
    [defaultTenantId,quickSignupDid,row.code_hash,row.created_at,row.expires_at])).rows[0];
   if(conflict)return send(res,200,{state:'unavailable',error:'Signup could not be completed. The phone number or login may already belong to an account. Sign in or use password recovery.',sipStatus:null,profileRequired:false});
  }
  return send(res,200,{state:row.state,error:row.state==='unavailable'?'Signup could not be completed. The phone number or login may already belong to an account, or registration policy does not permit this signup. Sign in or use password recovery.':undefined,sipStatus:row.sip_status||null,profileRequired:row.state==='verified'});
 }
 return send(res,404,{error:'Quick signup route unavailable'});
}
export const handleQuickSignup=c=>safeRegistration(publicHandler,c);
// Called ONLY after carrier webhook authentication and normalized payload validation.
export async function acceptQuickSignup(pool,event,{tenantId,origin}){
 const code=quickSmsCode(event.body),phone=normalizeQuickPhone(event.sender);
 if(tenantId!==defaultTenantId||normalizeQuickPhone(event.recipient)!==quickSignupDid||!phone||phone===quickSignupDid||!code)return false;
 const db=await pool.connect();let phoneLocked=false;
 try{
  phoneLocked=Number((await db.query('SELECT GET_LOCK($1,2) AS acquired',['quick-phone-'+phone])).rows[0]?.acquired)===1;
  if(!phoneLocked)throw Error('Quick signup phone busy');
  await db.query('START TRANSACTION');
  const row=(await db.query("SELECT * FROM quick_signups WHERE code_hash=$1 AND state='pending' AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",[digest(code)])).rows[0];
  if(!row){await db.query('COMMIT');return false;}
  const policy=await accountAuthPolicy(db,defaultTenantId);
  const allowed=await registrationAllowed(db,row.email);
  const tenant=(await db.query("SELECT id FROM tenants WHERE id=$1 AND status='active'",[defaultTenantId])).rows[0];
  const duplicate=(await db.query('SELECT user_id FROM user_profiles WHERE phone_e164=$1 LIMIT 1',[phone])).rows[0];
  const claimed=(await db.query('SELECT user_id FROM quick_verified_phones WHERE phone=$1',[phone])).rows[0];
  if(!allowed||!tenant||duplicate||claimed||(policy.signup&&(!policy.allowedPrefixes.some(p=>phone.startsWith(p))||(policy.requirePin&&!row.pin_hash)))){
   await db.query("UPDATE quick_signups SET state='unavailable',password_salt=NULL,password_hash=NULL,pin_salt=NULL,pin_hash=NULL WHERE token_hash=$1",[row.token_hash]);
   await db.query('COMMIT');return false;
  }
  const id=randomUUID();
  try{
   await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,status) VALUES($1,$2,$3,$4,$5,$6,'active')",[id,defaultTenantId,row.name,row.email,row.password_salt,row.password_hash]);
  }catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;await db.query("UPDATE quick_signups SET state='unavailable',password_salt=NULL,password_hash=NULL,pin_salt=NULL,pin_hash=NULL WHERE token_hash=$1",[row.token_hash]);await db.query('COMMIT');return false;}
  await db.query("INSERT INTO user_profiles(user_id,phone_e164,address_line1,address_line2,city,region,postal_code,country) VALUES($1,$2,'','','','','','')",[id,phone]);
  await db.query('INSERT INTO quick_verified_phones(phone,user_id) VALUES($1,$2)',[phone,id]);
  await db.query("INSERT INTO user_group_members(user_id,group_id) VALUES($1,'00000000-0000-4000-8000-000000000001')",[id]);
  if(row.pin_hash)await db.query('INSERT INTO twilio_account_pins(user_id,tenant_id,salt,pin_hash) VALUES($1,$2,$3,$4)',[id,defaultTenantId,row.pin_salt,row.pin_hash]);
  await ensureDefaultPresence(db,id);
  await createSipAccount(db,id,new URL(origin).hostname);
  await db.query("UPDATE quick_signups SET state='verified',user_id=$1,password_salt=NULL,password_hash=NULL,pin_salt=NULL,pin_hash=NULL WHERE token_hash=$2",[id,row.token_hash]);
  await db.query('COMMIT');return true;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{if(phoneLocked)await db.query('SELECT RELEASE_LOCK($1)',['quick-phone-'+phone]);db.release();}
}
export async function handleQuickProfile({req,res,pool,user,send,readJson}){
 res.setHeader('Cache-Control','no-store');
 if(!user)return send(res,401,{error:'Sign in required'});
 const profile=(await pool.query('SELECT p.*,v.profile_complete FROM quick_verified_phones v JOIN user_profiles p ON p.user_id=v.user_id JOIN users u ON u.id=v.user_id WHERE v.user_id=$1 AND u.tenant_id=$2',[user.id,user.tenant_id])).rows[0];
 if(req.method==='GET')return send(res,200,{required:!!profile&&!profile.profile_complete,profile:profile||null});
 if(req.method!=='PUT'||!profile)return send(res,405,{error:'Profile update unavailable'});
 const b=await readJson(req),fields=[['name',2,100],['address1',1,160],['address2',0,160],['city',1,100],['region',1,100],['postalCode',1,32]];
 for(const [key,min,max]of fields)if(typeof b[key]!=='string'||b[key].trim().length<min||b[key].trim().length>max)return send(res,400,{error:'Complete your name and address fields'});
 if(!/^[A-Z]{2}$/.test(b.country||''))return send(res,400,{error:'Two-letter country code required'});
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  await db.query('UPDATE users SET display_name=$1 WHERE id=$2 AND tenant_id=$3',[b.name.trim(),user.id,user.tenant_id]);
  await db.query('UPDATE user_profiles SET address_line1=$1,address_line2=$2,city=$3,region=$4,postal_code=$5,country=$6 WHERE user_id=$7',[b.address1.trim(),b.address2.trim(),b.city.trim(),b.region.trim(),b.postalCode.trim(),b.country,user.id]);
  await db.query('UPDATE quick_verified_phones SET profile_complete=TRUE WHERE user_id=$1',[user.id]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 return send(res,200,{saved:true});
}
