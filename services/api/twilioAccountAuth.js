import {randomBytes,createHash} from 'node:crypto';
import {hashPassword,verifyPassword} from './security.js';
import {hubSettings} from './twilioHub.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
const sid=(v,p)=>new RegExp('^'+p+'[a-f0-9]{32}$','i').test(v||'');
export const defaultAuthPolicy={signup:false,login:false,requirePin:true,serviceSid:'',channel:'sms',allowedPrefixes:['+1','+234'],dailyLimit:100,version:0};
export function validateAuthPolicy(b){
 if(!b||!['signup','login','requirePin'].every(k=>typeof b[k]==='boolean')||!['sms','call'].includes(b.channel)||!Number.isInteger(b.version)||b.version<0||!Number.isInteger(b.dailyLimit)||b.dailyLimit<1||b.dailyLimit>1000||!Array.isArray(b.allowedPrefixes)||!b.allowedPrefixes.length||b.allowedPrefixes.length>30||b.allowedPrefixes.some(p=>!/^\+[1-9]\d{0,6}$/.test(p))||((b.signup||b.login)&&!sid(b.serviceSid,'VA')))throw Error('Valid account OTP policy, VA Service SID, prefixes and daily limit required');
 return {signup:b.signup,login:b.login,requirePin:b.requirePin,serviceSid:b.serviceSid||'',channel:b.channel,allowedPrefixes:[...new Set(b.allowedPrefixes)],dailyLimit:b.dailyLimit};
}
export function validPin(pin){return typeof pin==='string'&&/^\d{6,8}$/.test(pin)&&! /^(\d)\1+$/.test(pin)&&!['123456','1234567','12345678','87654321','7654321','654321'].includes(pin);}
export async function migrateTwilioAccountAuth(db){for(const sql of [
 `CREATE TABLE IF NOT EXISTS twilio_account_auth_policy(tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,version INT NOT NULL,updated_by CHAR(36) NOT NULL) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS twilio_account_pins(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,salt CHAR(64) NOT NULL,pin_hash CHAR(128) NOT NULL,failures INT NOT NULL DEFAULT 0,locked_ms BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS twilio_account_challenges(token_hash CHAR(64) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,purpose VARCHAR(8) NOT NULL,phone VARCHAR(16) NOT NULL,service_sid CHAR(34) NOT NULL,account_sid CHAR(34) NOT NULL,provider_sid CHAR(34) NULL,policy_version INT NOT NULL,hub_version INT NOT NULL,status VARCHAR(16) NOT NULL,attempts INT NOT NULL DEFAULT 0,expires_ms BIGINT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX tw_auth_user(tenant_id,user_id,created_at),INDEX tw_auth_tenant(tenant_id,created_at)) ENGINE=InnoDB`
 ])await db.query(sql);}
export async function accountAuthPolicy(db,tenant){const r=(await db.query('SELECT policy,version FROM twilio_account_auth_policy WHERE tenant_id=$1',[tenant])).rows[0];return r?{...(typeof r.policy==='string'?JSON.parse(r.policy):r.policy),version:Number(r.version)}:{...defaultAuthPolicy};}
export async function signupPin(db,userId,tenant,pin,required){if(!pin&&!required)return;if(!validPin(pin))throw Error('Choose a nontrivial PIN of 6 to 8 digits');const {salt,hash}=await hashPassword(pin);await db.query('INSERT INTO twilio_account_pins(user_id,tenant_id,salt,pin_hash) VALUES($1,$2,$3,$4)',[userId,tenant,salt,hash]);}
export async function checkAccountPin(db,user,pin){
 const row=(await db.query('SELECT salt,pin_hash,failures,locked_ms FROM twilio_account_pins WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
 if(!row)return false;
 if(Number(row.locked_ms)>Date.now())throw Error('PIN is temporarily locked. Try again later');
 // Reserve an attempt atomically before the expensive hash or external operation.
 const changed=await db.query('UPDATE twilio_account_pins SET failures=IF(locked_ms>0,1,failures+1),locked_ms=IF(failures>=5,$1,0) WHERE user_id=$2 AND tenant_id=$3 AND locked_ms<=$4',[Date.now()+900000,user.id,user.tenant_id,Date.now()]);
 if(!changed.rowCount)throw Error('PIN is temporarily locked');
 if(typeof pin!=='string'||!validPin(pin)||!await verifyPassword(pin,row.salt,row.pin_hash))throw Error('Invalid credentials or PIN');
 await db.query('UPDATE twilio_account_pins SET failures=0,locked_ms=0 WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);return true;
}
export async function verifyRequest(c,service,operation,form,fetcher=fetch){
 if(!sid(c?.accountSid,'AC')||!sid(service,'VA')||!['Verifications','VerificationCheck'].includes(operation))throw Error('Twilio Verify account service required');
 const pair=c.apiKeySid&&c.apiKeySecret?[c.apiKeySid,c.apiKeySecret]:[c.accountSid,c.authToken];if(!pair[1])throw Error('Twilio credentials unavailable');
 const response=await fetcher('https://verify.twilio.com/v2/Services/'+service+'/'+operation,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(pair.join(':')).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form).toString(),redirect:'error',signal:AbortSignal.timeout(10000)});
 let data;try{data=await response.json();}catch{throw Error('Verification response uncertain');}
 if(!response.ok)throw Error('Twilio Verify unavailable ('+response.status+')');return data;
}
export function approvedCheck(row,r){return r?.status==='approved'&&r.sid===row.provider_sid&&r.to===row.phone&&r.account_sid===row.account_sid&&r.service_sid===row.service_sid;}
async function authContext(db,user){const policy=await accountAuthPolicy(db,user.tenant_id),hub=await hubSettings(db,user.tenant_id);if(!hub?.enabled||!hub.credentials||!sid(policy.serviceSid,'VA'))throw Error('Account verification is not configured');return {policy,hub};}
async function userLock(pool,user,fn){const db=await pool.connect();const key='tw-auth-'+user.id;let held=false;try{held=Number((await db.query('SELECT GET_LOCK($1,0) AS acquired',[key])).rows[0]?.acquired)===1;if(!held)throw Error('Verification already in progress');return await fn(db);}finally{if(held)await db.query('SELECT RELEASE_LOCK($1)',[key]);db.release();}}
export async function startAccountChallenge(pool,user,purpose,fetcher=fetch){return userLock(pool,user,async db=>{
 if(!['signup','login'].includes(purpose))throw Error('Invalid verification purpose');
 const {policy,hub}=await authContext(db,user);if(!policy[purpose])throw Error('Verification policy changed; start again');
 const phone=(await db.query('SELECT phone_e164 FROM user_profiles WHERE user_id=$1',[user.id])).rows[0]?.phone_e164;
 if(!/^\+[1-9]\d{7,14}$/.test(phone||'')||!policy.allowedPrefixes.some(p=>phone.startsWith(p)))throw Error('Account phone is outside verification destinations');
 const counts=(await db.query('SELECT COUNT(*) AS hourly,SUM(created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND)) AS recent FROM twilio_account_challenges WHERE tenant_id=$1 AND user_id=$2 AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR)',[user.tenant_id,user.id])).rows[0];
 if(Number(counts?.hourly)>=3||Number(counts?.recent)>0)throw Error('Verification send limit reached; wait before requesting another code');
 // One tenant lock reserves the daily quota before dispatch, including unknown sends.
 const cap='tw-cap-'+user.tenant_id;let capHeld=false;const token=randomBytes(32).toString('hex'),tokenHash=digest(token);
 try{capHeld=Number((await db.query('SELECT GET_LOCK($1,2) AS acquired',[cap])).rows[0]?.acquired)===1;if(!capHeld)throw Error('Verification quota busy');const n=Number((await db.query('SELECT COUNT(*) AS n FROM twilio_account_challenges WHERE tenant_id=$1 AND created_at>=UTC_DATE()',[user.tenant_id])).rows[0]?.n||0);if(n>=policy.dailyLimit)throw Error('Daily verification allowance reached');
 await db.query("INSERT INTO twilio_account_challenges(token_hash,tenant_id,user_id,purpose,phone,service_sid,account_sid,policy_version,hub_version,status,expires_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'starting',$10)",[tokenHash,user.tenant_id,user.id,purpose,phone,policy.serviceSid,hub.credentials.accountSid,policy.version,hub.version,Date.now()+600000]);
 }finally{if(capHeld)await db.query('SELECT RELEASE_LOCK($1)',[cap]);}
 try{const r=await verifyRequest(hub.credentials,policy.serviceSid,'Verifications',{To:phone,Channel:policy.channel},fetcher);if(!sid(r.sid,'VE')||r.account_sid!==hub.credentials.accountSid||r.service_sid!==policy.serviceSid||r.to!==phone||r.status!=='pending')throw Error('Unconfirmed verification submission');await db.query("UPDATE twilio_account_challenges SET provider_sid=$1,status='pending' WHERE token_hash=$2",[r.sid,tokenHash]);return {verificationRequired:true,purpose,authChallenge:token,channel:policy.channel,expiresIn:600};}
 catch{await db.query("UPDATE twilio_account_challenges SET status='unknown' WHERE token_hash=$1",[tokenHash]);throw Error('Code delivery uncertain. No automatic retry was made; wait before requesting a new code');}
 });}
export async function consumeAccountChallenge(pool,user,purpose,token,code,fetcher=fetch){return userLock(pool,user,async db=>{
 if(!/^[a-f0-9]{64}$/.test(token||'')||!/^\d{4,10}$/.test(code||''))throw Error('Verification challenge and code required');
 const {policy,hub}=await authContext(db,user),row=(await db.query('SELECT * FROM twilio_account_challenges WHERE token_hash=$1 AND tenant_id=$2 AND user_id=$3 AND purpose=$4',[digest(token),user.tenant_id,user.id,purpose])).rows[0];
 const phone=(await db.query('SELECT phone_e164 FROM user_profiles WHERE user_id=$1',[user.id])).rows[0]?.phone_e164;
 if(!policy[purpose]||!row||row.status!=='pending'||row.attempts>=5||Number(row.expires_ms)<=Date.now()||row.phone!==phone||row.policy_version!==policy.version||row.hub_version!==hub.version||row.service_sid!==policy.serviceSid||row.account_sid!==hub.credentials.accountSid)throw Error('Invalid or expired verification');
 await db.query("UPDATE twilio_account_challenges SET status='checking',attempts=attempts+1 WHERE token_hash=$1",[digest(token)]);
 let r;try{r=await verifyRequest(hub.credentials,row.service_sid,'VerificationCheck',{VerificationSid:row.provider_sid,Code:code},fetcher);}catch{await db.query("UPDATE twilio_account_challenges SET status='unknown' WHERE token_hash=$1",[digest(token)]);throw Error('Verification check uncertain. Request a new code after the cooldown');}
 const approved=approvedCheck(row,r);await db.query('UPDATE twilio_account_challenges SET status=$1 WHERE token_hash=$2',[approved?'consumed':'pending',digest(token)]);if(!approved)throw Error('Invalid verification code');return true;
 });}
export async function loginAccountGate(pool,user,{pin,authChallenge,authCode},fetcher=fetch){const p=await accountAuthPolicy(pool,user.tenant_id);const hasPin=!!(await pool.query('SELECT 1 FROM twilio_account_pins WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows.length;if(hasPin)await checkAccountPin(pool,user,pin);if(!p.login)return null;if(authChallenge){await consumeAccountChallenge(pool,user,'login',authChallenge,authCode,fetcher);return null;}return startAccountChallenge(pool,user,'login',fetcher);}
export async function handleAccountAuth({req,res,path,pool,user,send,readJson,origin}){
 res.setHeader('Cache-Control','no-store');
 try{
  if(path==='/api/admin/twilio/account-auth'){
   if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
   const old=await accountAuthPolicy(pool,user.tenant_id);
   if(req.method==='GET')return send(res,200,{policy:old});
   if(req.method!=='PUT')return send(res,405,{error:'Unsupported action'});
   const b=await readJson(req),p=validateAuthPolicy(b),hub=await hubSettings(pool,user.tenant_id);
   if(p.signup||p.login){if(!hub?.enabled||!hub.credentials)throw Error('Configure enabled Twilio account credentials first');if(p.serviceSid===hub.credentials.verifyServiceSid)throw Error('Use a separate Verify Service for account authentication');
    const pair=hub.credentials.apiKeySid&&hub.credentials.apiKeySecret?[hub.credentials.apiKeySid,hub.credentials.apiKeySecret]:[hub.credentials.accountSid,hub.credentials.authToken];
    const response=await fetch('https://verify.twilio.com/v2/Services/'+p.serviceSid,{headers:{Authorization:'Basic '+Buffer.from(pair.join(':')).toString('base64')},redirect:'error',signal:AbortSignal.timeout(10000)});
    const service=await response.json();if(!response.ok||service.sid!==p.serviceSid||service.account_sid!==hub.credentials.accountSid)throw Error('Account Verify Service ownership not confirmed');}
   const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const current=await accountAuthPolicy(db,user.tenant_id);if(current.version!==b.version)throw Error('Authentication policy changed; refresh');await db.query('INSERT INTO twilio_account_auth_policy(tenant_id,policy,version,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE policy=VALUES(policy),version=VALUES(version),updated_by=VALUES(updated_by)',[user.tenant_id,JSON.stringify(p),b.version+1,user.id]);await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES(UUID(),$1,$2,'twilio_auth_policy_updated')",[user.tenant_id,user.id]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}return send(res,200,{saved:true});
  }
  if(path==='/api/account/auth-pin'){
   if(!user)return send(res,401,{error:'Sign in required'});
   if(req.method==='GET')return send(res,200,{hasPin:!!(await pool.query('SELECT 1 FROM twilio_account_pins WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows.length});
   if(req.method!=='PUT')return send(res,405,{error:'Unsupported action'});
   const b=await readJson(req),local=(await pool.query("SELECT id,tenant_id,password_salt,password_hash FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' AND auth_source='local'",[user.id,user.tenant_id])).rows[0];
   if(!local||typeof b.password!=='string'||b.password.length>1024||!await verifyPassword(b.password,local.password_salt,local.password_hash))throw Error('Current local account password required');
   await checkAccountPin(pool,local,b.pin);
   if(!validPin(b.newPin)||b.newPin!==b.confirmPin)throw Error('Matching nontrivial new PIN of 6 to 8 digits required');
   if(!b.authChallenge)return send(res,202,await startAccountChallenge(pool,local,'login'));
   await consumeAccountChallenge(pool,local,'login',b.authChallenge,b.authCode);
   const {salt,hash}=await hashPassword(b.newPin);
   await pool.query('INSERT INTO twilio_account_pins(user_id,tenant_id,salt,pin_hash) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE salt=VALUES(salt),pin_hash=VALUES(pin_hash),failures=0,locked_ms=0',[user.id,user.tenant_id,salt,hash]);
   return send(res,200,{saved:true});
  }
  if(path==='/api/account-auth/signup/resend'&&req.method==='POST'){
   const b=await readJson(req);if(typeof b.email!=='string'||b.email.length>254||typeof b.password!=='string'||b.password.length>1024)throw Error('Invalid credentials');
   const u=(await pool.query("SELECT u.id,u.tenant_id,u.password_salt,u.password_hash FROM users u JOIN tenants t ON t.id=u.tenant_id AND t.status='active' WHERE u.email=$1 AND u.status='pending_email' AND u.auth_source='local'",[b.email.trim().toLowerCase()])).rows[0];
   if(!u||!await verifyPassword(b.password,u.password_salt,u.password_hash))throw Error('Invalid credentials');
   await checkAccountPin(pool,u,b.pin);return send(res,202,await startAccountChallenge(pool,u,'signup'));
  }
  if(path==='/api/account-auth/signup/check'&&req.method==='POST'){
   const b=await readJson(req);if(!/^[a-f0-9]{64}$/.test(b.authChallenge||''))throw Error('Invalid challenge');
   const u=(await pool.query("SELECT u.id,u.tenant_id FROM twilio_account_challenges c JOIN users u ON u.id=c.user_id AND u.tenant_id=c.tenant_id JOIN tenants t ON t.id=u.tenant_id AND t.status='active' WHERE c.token_hash=$1 AND c.purpose='signup' AND u.status='pending_email'",[digest(b.authChallenge)])).rows[0];
   if(!u)throw Error('Invalid verification');await consumeAccountChallenge(pool,u,'signup',b.authChallenge,b.authCode);
   const {createSipAccount}=await import('./sipMarketplace.js');const db=await pool.connect();try{await db.query('START TRANSACTION');const changed=await db.query("UPDATE users SET status='active' WHERE id=$1 AND tenant_id=$2 AND status='pending_email'",[u.id,u.tenant_id]);if(!changed.rowCount)throw Error('Account activation changed');await createSipAccount(db,u.id,new URL(origin).hostname);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}return send(res,200,{status:'verified'});
  }
  return send(res,404,{error:'Authentication route unavailable'});
 }catch(e){return send(res,409,{error:e.message});}
}
