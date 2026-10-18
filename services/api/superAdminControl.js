import {randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9-]{36}$/i,e164=/^\+[1-9][0-9]{7,14}$/;
export async function migrateSuperAdminControl(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS managed_outbound_identities(
 user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,number_e164 VARCHAR(16) NULL,
 authorized BOOLEAN NOT NULL DEFAULT FALSE,evidence VARCHAR(255) NOT NULL,
 updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function managedIdentity(db,tenant,user){
 const r=(await db.query('SELECT number_e164,authorized FROM managed_outbound_identities WHERE user_id=$1 AND tenant_id=$2',[user,tenant])).rows[0];
 if(r&&!Number(r.authorized))throw Error('Outbound caller ID is disabled by administrator');
 const primary=(await db.query("SELECT o.number_e164 FROM user_primary_did p JOIN did_shop_orders o ON o.id=p.order_id AND o.tenant_id=p.tenant_id AND o.user_id=p.user_id WHERE p.user_id=$1 AND p.tenant_id=$2 AND o.status='active' AND o.rental_until>UTC_TIMESTAMP(3)",[user,tenant])).rows[0];
 if(primary)return {callerId:primary.number_e164,provider:'flowroute'};
 if(!r)return null;
 if(!Number(r.authorized)||!e164.test(r.number_e164||''))throw Error('Outbound caller ID is disabled by administrator');
 return {callerId:r.number_e164,provider:'flowroute'};
}
export function validateProfile(b){
 const fields={displayName:100,phone:16,address1:160,address2:160,city:100,region:100,postalCode:32,country:2};
 if(!b||Object.keys(b).some(k=>!Object.hasOwn(fields,k))||Object.entries(fields).some(([k,n])=>typeof b[k]!=='string'||b[k].length>n)||!b.displayName.trim()||!e164.test(b.phone)||!b.address1.trim()||!b.city.trim()||!b.region.trim()||!b.postalCode.trim()||! /^[A-Z]{2}$/.test(b.country))throw Error('Complete name, international phone and actual address required');
 return b;
}
export async function handleSuperAdminControl({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const root='/api/admin/platform-control';
 if(path===root&&req.method==='GET'){
  const users=(await pool.query(`SELECT u.id,u.display_name,u.email,u.role,u.status,p.phone_e164,a.username,a.status AS sip_status,s.status AS subscription_status,pl.name AS plan_name,b.remaining_seconds,m.number_e164 AS caller_id,m.authorized AS caller_id_authorized
  FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN sip_accounts a ON a.user_id=u.id AND a.tenant_id=u.tenant_id LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN plans pl ON pl.id=s.plan_id AND pl.tenant_id=u.tenant_id LEFT JOIN calling_trial_balances b ON b.user_id=u.id AND b.tenant_id=u.tenant_id LEFT JOIN managed_outbound_identities m ON m.user_id=u.id AND m.tenant_id=u.tenant_id WHERE u.tenant_id=$1 ORDER BY u.display_name,u.id LIMIT 500`,[user.tenant_id])).rows;
  const events=(await pool.query('SELECT action,target_id,created_at FROM security_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30',[user.tenant_id])).rows;
  return send(res,200,{users,events,keyStatus:{providerEncryption:/^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CREDENTIAL_KEY||''),sipEncryption:/^[a-f0-9]{64}$/i.test(process.env.SIP_CREDENTIAL_KEY||''),httpBridge:process.env.KAMAILIO_HTTP_BRIDGE_ENABLED==='true',httpBridgeToken:/^[a-f0-9]{64}$/i.test(process.env.KAMAILIO_HTTP_BRIDGE_TOKEN||'')}});
 }
 const match=new RegExp('^'+root+'/users/([a-f0-9-]{36})(?:/(profile|caller-id|subscription|allowance|provision))?$','i').exec(path);
 if(!match||!uuid.test(match[1]))return send(res,404,{error:'Control route unavailable'});
 const [,id,action]=match;
 if(req.method==='GET'&&!action){
  const r=(await pool.query(`SELECT u.id,u.display_name,u.email,p.phone_e164,p.address_line1,p.address_line2,p.city,p.region,p.postal_code,p.country,s.plan_id,s.status AS subscription_status,b.remaining_seconds,m.number_e164 AS caller_id,m.authorized,m.evidence FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN calling_trial_balances b ON b.user_id=u.id AND b.tenant_id=u.tenant_id LEFT JOIN managed_outbound_identities m ON m.user_id=u.id AND m.tenant_id=u.tenant_id WHERE u.id=$1 AND u.tenant_id=$2`,[id,user.tenant_id])).rows[0];
  return send(res,r?200:404,r?{user:r}:{error:'User unavailable'});
 }
 if(!(['profile','caller-id','subscription','allowance'].includes(action)&&req.method==='PUT'||action==='provision'&&req.method==='POST'))return send(res,405,{error:'Unsupported control action'});
 let b=await readJson(req);
 try{
  if(action==='profile')validateProfile(b);
  if(action==='caller-id'&&(!b||typeof b.authorized!=='boolean'||typeof b.evidence!=='string'||!b.evidence.trim()||b.evidence.length>255||b.authorized&&!e164.test(b.number||'')))throw Error('Authorized caller ID and evidence required; use disable to block calls');
  if(action==='subscription'&&(!uuid.test(b.planId||'')||!['active','cancelled','pending_payment'].includes(b.status)))throw Error('Valid plan and subscription status required');
  if(action==='allowance'&&(!Number.isInteger(b.remainingSeconds)||b.remainingSeconds<0||b.remainingSeconds>3600||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>255))throw Error('Remaining seconds 0–3600 and a reason required');
 }catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();
 try{
  await db.query('START TRANSACTION');
  const target=(await db.query('SELECT id,status FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,user.tenant_id])).rows[0];
  if(!target){await db.query('ROLLBACK');return send(res,404,{error:'User unavailable'});}
  if(action==='profile'){
   await db.query('UPDATE users SET display_name=$1 WHERE id=$2 AND tenant_id=$3',[b.displayName.trim(),id,user.tenant_id]);
   await db.query('INSERT INTO user_profiles(user_id,phone_e164,address_line1,address_line2,city,region,postal_code,country) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON DUPLICATE KEY UPDATE phone_e164=VALUES(phone_e164),address_line1=VALUES(address_line1),address_line2=VALUES(address_line2),city=VALUES(city),region=VALUES(region),postal_code=VALUES(postal_code),country=VALUES(country)',[id,b.phone,b.address1,b.address2,b.city,b.region,b.postalCode,b.country]);
  }
  if(action==='caller-id')await db.query('INSERT INTO managed_outbound_identities(user_id,tenant_id,number_e164,authorized,evidence,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE number_e164=VALUES(number_e164),authorized=VALUES(authorized),evidence=VALUES(evidence),updated_by=VALUES(updated_by)',[id,user.tenant_id,b.authorized?b.number:null,b.authorized,b.evidence,user.id]);
  if(action==='subscription'){
   const plan=(await db.query('SELECT id FROM plans WHERE id=$1 AND tenant_id=$2 AND active=TRUE',[b.planId,user.tenant_id])).rows[0];
   if(!plan){await db.query('ROLLBACK');return send(res,400,{error:'Active tenant plan required'});}
   await db.query('INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status=VALUES(status)',[id,b.planId,b.status]);
  }
  if(action==='allowance'){
   await db.query('SELECT remaining_seconds FROM calling_trial_balances WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[id,user.tenant_id]);
   const busy=await db.query("SELECT 1 FROM pstn_calls WHERE user_id=$1 AND tenant_id=$2 AND status<>'settled' LIMIT 1",[id,user.tenant_id]);
   if(busy.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Settle active or pending calls before adjusting allowance'});}
   await db.query('INSERT INTO calling_trial_balances(user_id,tenant_id,remaining_seconds,granted_seconds) SELECT $1,$2,$3,GREATEST(allowance_seconds,$3) FROM calling_plan_settings WHERE tenant_id=$2 ON DUPLICATE KEY UPDATE remaining_seconds=VALUES(remaining_seconds)',[id,user.tenant_id,b.remainingSeconds]);
  }
  if(action==='provision'){
   if(target.status!=='active')throw Error('Activate the user before provisioning');
   const {createSipAccount,credentialKey,encrypt}=await import('./sipMarketplace.js');
   const {randomBytes}=await import('node:crypto');
   await createSipAccount(db,id,process.env.SIP_ACCOUNT_DOMAIN||new URL(process.env.PUBLIC_ORIGIN).hostname);
   const key=credentialKey();if(!key)throw Error('SIP encryption key is not configured');
   await db.query("UPDATE sip_accounts SET secret_cipher=$1 WHERE user_id=$2 AND tenant_id=$3 AND secret_cipher IS NULL AND status='awaiting_switch'",[encrypt(randomBytes(32).toString('base64url'),key),id,user.tenant_id]);
   await db.query("INSERT INTO sip_provisioning_jobs(account_id,next_attempt) SELECT id,UTC_TIMESTAMP(3) FROM sip_accounts WHERE user_id=$1 AND tenant_id=$2 AND status='awaiting_switch' ON DUPLICATE KEY UPDATE next_attempt=UTC_TIMESTAMP(3),attempts=0",[id,user.tenant_id]);
  }
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,id,'platform_control_'+action]);
  await db.query('COMMIT');return send(res,action==='provision'?202:200,{saved:true,status:action==='provision'?'queued':'saved'});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
