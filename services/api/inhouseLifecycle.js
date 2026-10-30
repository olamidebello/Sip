import {migrateInhouseActivation,activationPolicy,completeInhouseFirstCall} from './inhouseActivation.js';
import {randomBytes,createHash} from 'node:crypto';
export const VERIFY_TO='+12109050290';
export const RETENTION={days:30,minimumSeconds:60,holdDays:7};
const hash=s=>createHash('sha256').update(s).digest('hex');
export function nigeriaNumber(n){if(typeof n!=='string')return null;n=n.replace(/[ ()-]/g,'');if(n.startsWith('0'))n='+234'+n.slice(1);if(n.startsWith('234'))n='+'+n;return /^\+234[1-9][0-9]{7,11}$/.test(n)?n:null;}
export function retentionState(assignment,now=Date.now(),policy={retentionDays:30}){
 const base=Math.max(new Date(assignment.provisioned_at||assignment.created_at).getTime(),new Date(assignment.qualified_at||assignment.created_at).getTime());
 const left=Math.ceil((base+policy.retentionDays*86400000-now)/86400000);
 return {daysRemaining:Math.max(0,left),due:left<=0,warning:left<=7};
}
export async function migrateInhouseLifecycle(db){
 for(const sql of [
 `CREATE TABLE IF NOT EXISTS inhouse_sms_challenges(code_hash CHAR(64) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,number_e164 VARCHAR(16) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',expires_at DATETIME(3) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX inhouse_challenge_user(user_id,created_at)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS inhouse_nigeria_verifications(number_e164 VARCHAR(16) PRIMARY KEY,user_id CHAR(36) NOT NULL UNIQUE,tenant_id CHAR(36) NOT NULL,event_id VARCHAR(128) NOT NULL UNIQUE,verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS inhouse_call_activity(call_key CHAR(64) PRIMARY KEY,caller_user CHAR(36) NULL,recipient_user CHAR(36) NULL,started_epoch BIGINT NULL,ended_epoch BIGINT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS inhouse_release_holds(did_id CHAR(36) PRIMARY KEY,previous_user CHAR(36) NOT NULL,available_at DATETIME(3) NOT NULL,released_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS inhouse_retention_notices(did_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,cycle_at DATETIME(3) NOT NULL,kind VARCHAR(16) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(did_id,user_id,cycle_at,kind)) ENGINE=InnoDB`
 ])await db.query(sql);
 const found=await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='inhouse_subscriber_assignments' AND column_name='qualified_at'");if(!found.rows.length)await db.query('ALTER TABLE inhouse_subscriber_assignments ADD COLUMN qualified_at DATETIME(3) NULL');await migrateInhouseActivation(db);
}
export async function nigeriaVerified(db,user){return (await db.query('SELECT 1 FROM inhouse_nigeria_verifications WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows.length>0;}
export async function createInhouseChallenge(pool,user,number){
 number=nigeriaNumber(number);if(number&&/^\+23420315[0-4][0-9]{4}$/.test(number))throw Error('Use an existing Nigeria number outside the in-house range');if(!number)throw Error('Valid existing Nigeria number required');
 const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id]);
 const policy=await activationPolicy(db,user.tenant_id);
 const prior=(await db.query('SELECT created_at FROM inhouse_sms_challenges WHERE user_id=$1 AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) ORDER BY created_at DESC',[user.id])).rows;
 if(prior.length>=policy.codeDailyLimit||prior[0]&&Date.now()-new Date(prior[0].created_at).getTime()<60000)throw Error('Wait before requesting another code; daily limit reached');
 const owned=(await db.query('SELECT user_id FROM inhouse_nigeria_verifications WHERE number_e164=$1',[number])).rows[0];if(owned&&owned.user_id!==user.id)throw Error('Nigeria number already linked to another account');
 const code='SMOOTH-'+randomBytes(10).toString('hex').toUpperCase();
 await db.query("UPDATE inhouse_sms_challenges SET status='replaced' WHERE user_id=$1 AND status='pending'",[user.id]);
 await db.query('INSERT INTO inhouse_sms_challenges(code_hash,tenant_id,user_id,number_e164,expires_at,recipient_e164) VALUES($1,$2,$3,$4,$5,$6)',[hash(code),user.tenant_id,user.id,number,new Date(Date.now()+policy.codeMinutes*60000),policy.verificationTo]);await db.query('COMMIT');
 return {code,sendTo:policy.verificationTo,sendFrom:number,expiresMinutes:policy.codeMinutes,instruction:'Send this exact code by SMS from your Nigeria number. Carrier SMS charges may apply.'};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
// Call only AFTER the existing carrier webhook authentication and normalization.
export async function acceptInhouseVerification(pool,event,{allocate}={}){
 const recipient='+'+String(event.recipient||'').replace(/^\+/,''),sender=nigeriaNumber(event.sender),code=String(event.body||'').trim().toUpperCase();
 if(!/^\+[1-9][0-9]{7,14}$/.test(recipient)||!sender||!/^SMOOTH-[A-F0-9]{20}$/.test(code))return false;
 const db=await pool.connect();try{await db.query('START TRANSACTION');
 const c=(await db.query("SELECT * FROM inhouse_sms_challenges WHERE code_hash=$1 AND status='pending' AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",[hash(code)])).rows[0];
 if(!c||c.number_e164!==sender||recipient!==(c.recipient_e164||VERIFY_TO)){await db.query('ROLLBACK');return false;}
 const owner=(await db.query('SELECT user_id FROM inhouse_nigeria_verifications WHERE number_e164=$1 OR user_id=$2 FOR UPDATE',[sender,c.user_id])).rows;
 if(owner.some(o=>o.user_id!==c.user_id)){await db.query('ROLLBACK');return false;}
 // A verified number cannot be silently changed by another challenge.
 if(owner.length){await db.query('ROLLBACK');return false;}
 await db.query('INSERT INTO inhouse_nigeria_verifications(number_e164,user_id,tenant_id,event_id) VALUES($1,$2,$3,$4)',[sender,c.user_id,c.tenant_id,event.id]);
 await db.query("UPDATE inhouse_sms_challenges SET status='verified' WHERE code_hash=$1",[hash(code)]);await db.query('COMMIT');
 if(!allocate)allocate=(await import('./inhouseSubscriber.js')).ensureIncludedDid;try{await allocate(pool,{id:c.user_id,tenant_id:c.tenant_id});}catch{console.warn('INHOUSE_ALLOCATION pending after verified SMS');}return true;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
export async function registerInhouseCall(db,data,callerUser,recipientUser){
 if(!/^[a-f0-9]{64}$/.test(data.callKey||''))throw Error('Stable in-house call key required');
 const prior=(await db.query('SELECT caller_user,recipient_user FROM inhouse_call_activity WHERE call_key=$1',[data.callKey])).rows[0];
 if(prior&&(prior.caller_user!==(callerUser||null)||prior.recipient_user!==(recipientUser||null)))throw Error('In-house call key reuse rejected');
 await db.query('INSERT IGNORE INTO inhouse_call_activity(call_key,caller_user,recipient_user) VALUES($1,$2,$3)',[data.callKey,callerUser||null,recipientUser||null]);
}
export async function inhouseCallEvent(pool,data){
 if(!/^[a-f0-9]{64}$/.test(data.callKey||'')||!['start','end','failed'].includes(data.event)||!Number.isSafeInteger(data.epoch)||data.epoch<1||data.epoch>Math.floor(Date.now()/1000)+10)return null;
 const db=await pool.connect();try{await db.query('START TRANSACTION');const c=(await db.query('SELECT * FROM inhouse_call_activity WHERE call_key=$1 FOR UPDATE',[data.callKey])).rows[0];if(!c){await db.query('ROLLBACK');return null;}
 if(data.event!=='failed'){const col=data.event==='start'?'started_epoch':'ended_epoch';await db.query(`UPDATE inhouse_call_activity SET ${col}=COALESCE(${col},$1) WHERE call_key=$2`,[data.epoch,data.callKey]);c[col]??=data.epoch;}
 if(c.started_epoch&&c.ended_epoch&&c.ended_epoch-c.started_epoch>=1&&c.ended_epoch-c.started_epoch<=86400){
  for(const u of new Set([c.caller_user,c.recipient_user].filter(Boolean))){const a=(await db.query('SELECT tenant_id FROM inhouse_subscriber_assignments WHERE user_id=$1 LIMIT 1',[u])).rows[0];if(!a||c.ended_epoch-c.started_epoch<(await activationPolicy(db,a.tenant_id)).minimumSeconds)continue;await db.query('UPDATE inhouse_subscriber_assignments f JOIN inhouse_nigeria_verifications v ON v.user_id=f.user_id AND v.tenant_id=f.tenant_id SET f.qualified_at=GREATEST(COALESCE(f.qualified_at,f.created_at),FROM_UNIXTIME($1)) WHERE f.user_id=$2 AND f.created_at<=FROM_UNIXTIME($3)',[c.ended_epoch,u,c.started_epoch]);}
 }
 await db.query('COMMIT');return [200,{recorded:true,inhouse:true}];
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function sweepInhouseRetention(pool){
 // Count settled external calls using their recorded identity/time, never login activity.
 await pool.query("UPDATE inhouse_subscriber_assignments f JOIN inhouse_dids d ON d.id=f.did_id AND d.user_id=f.user_id JOIN inhouse_nigeria_verifications v ON v.user_id=f.user_id AND v.tenant_id=f.tenant_id SET f.qualified_at=GREATEST(COALESCE(f.qualified_at,f.created_at),COALESCE((SELECT FROM_UNIXTIME(MAX(c.ended_epoch)) FROM pstn_calls c WHERE c.user_id=f.user_id AND c.tenant_id=f.tenant_id AND c.caller_id=d.number_e164 AND c.status='settled' AND c.ended_epoch-c.answered_epoch>=COALESCE((SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(p.policy,'$.minimumSeconds')) AS UNSIGNED) FROM inhouse_activation_policies p WHERE p.tenant_id=f.tenant_id),60) AND FROM_UNIXTIME(c.answered_epoch)>=f.created_at),f.created_at))");
 const rows=(await pool.query('SELECT did_id,user_id,tenant_id,created_at,qualified_at,provisioned_at FROM inhouse_subscriber_assignments ORDER BY created_at LIMIT 10000')).rows;
 for(const row of rows){const policy=await activationPolicy(pool,row.tenant_id);const state=retentionState(row,Date.now(),policy);if(!state.warning)continue;const cycle=row.qualified_at||row.created_at;
 await pool.query('INSERT IGNORE INTO inhouse_retention_notices(did_id,user_id,cycle_at,kind) VALUES($1,$2,$3,$4)',[row.did_id,row.user_id,cycle,state.due?'expired':state.daysRemaining<=1?'one-day':'seven-day']);
 if(!state.due)continue;const db=await pool.connect();try{await db.query('START TRANSACTION');const current=(await db.query('SELECT * FROM inhouse_subscriber_assignments WHERE did_id=$1 FOR UPDATE',[row.did_id])).rows[0];if(!current||!retentionState(current,Date.now(),policy).due){await db.query('ROLLBACK');continue;}
 const busy=await db.query("SELECT 1 FROM pstn_calls WHERE user_id=$1 AND status IN ('reserved','answered') UNION SELECT 1 FROM inhouse_call_activity WHERE (caller_user=$1 OR recipient_user=$1) AND started_epoch IS NOT NULL AND ended_epoch IS NULL LIMIT 1",[row.user_id]);if(busy.rows.length){await db.query('ROLLBACK');continue;}
 await db.query('INSERT INTO inhouse_release_holds(did_id,previous_user,available_at) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE previous_user=VALUES(previous_user),available_at=VALUES(available_at),released_at=UTC_TIMESTAMP(3)',[row.did_id,row.user_id,new Date(Date.now()+policy.holdDays*86400000)]);
 await db.query("UPDATE inhouse_dids SET user_id=NULL,status='disabled',invoice_id=NULL WHERE id=$1 AND tenant_id=$2 AND user_id=$3",[row.did_id,row.tenant_id,row.user_id]);await db.query('DELETE FROM inhouse_subscriber_assignments WHERE did_id=$1',[row.did_id]);await db.query('DELETE FROM inhouse_nigeria_verifications WHERE user_id=$1 AND tenant_id=$2',[row.user_id,row.tenant_id]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 await pool.query("UPDATE inhouse_dids d JOIN inhouse_release_holds h ON h.did_id=d.id SET d.status='available' WHERE d.user_id IS NULL AND d.status='disabled' AND h.available_at<=UTC_TIMESTAMP(3)");
 await pool.query("DELETE h FROM inhouse_release_holds h JOIN inhouse_dids d ON d.id=h.did_id WHERE d.status='available' AND d.user_id IS NULL AND h.available_at<=UTC_TIMESTAMP(3)");
}
export async function handleInhouseLifecycle({req,res,user,pool,send,readJson}){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'){
  const {subscriberActive}=await import('./inhouseSubscriber.js');if(!await subscriberActive(pool,user.tenant_id,user.id))return send(res,403,{error:'Active subscription required'});
  try{return send(res,200,await createInhouseChallenge(pool,user,(await readJson(req)).number));}catch(e){return send(res,409,{error:e.code?'Verification unavailable':e.message});}
 }
 if(req.method!=='GET')return send(res,405,{error:'GET or POST required'});
 const policy=await activationPolicy(pool,user.tenant_id);
 const pending=(await pool.query("SELECT c.call_key FROM pstn_calls c JOIN inhouse_subscriber_assignments f ON f.user_id=c.user_id AND f.tenant_id=c.tenant_id WHERE f.state='pending' AND c.status='settled' AND c.user_id=$1 AND c.tenant_id=$2 ORDER BY c.created_at DESC LIMIT 10",[user.id,user.tenant_id])).rows;for(const c of pending)await completeInhouseFirstCall(pool,c.call_key);
 const verified=await nigeriaVerified(pool,user);
 const verification=(await pool.query('SELECT number_e164 FROM inhouse_nigeria_verifications WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
 const assignments=(await pool.query('SELECT d.number_e164,f.created_at,f.qualified_at,f.state,f.provisioned_at FROM inhouse_subscriber_assignments f JOIN inhouse_dids d ON d.id=f.did_id AND d.user_id=f.user_id AND d.tenant_id=f.tenant_id WHERE f.user_id=$1 AND f.tenant_id=$2',[user.id,user.tenant_id])).rows;
 return send(res,200,{verified,firstCallTo:verification?.number_e164||null,sendTo:policy.verificationTo,policy,assignments:assignments.map(a=>({...a,...retentionState(a,Date.now(),policy)})),note:`Keep at least one completed call of ${policy.minimumSeconds} seconds every ${policy.retentionDays} days. Pending provisioning requires an answered call to your verified Nigeria number; normal outbound charges apply. Inactive numbers are held ${policy.holdDays} days before reuse.`});
}
export function startInhouseLifecycle(pool){let stopped=false;async function tick(){try{await sweepInhouseRetention(pool);const users=(await pool.query('SELECT user_id AS id,tenant_id FROM inhouse_nigeria_verifications')).rows;const {ensureIncludedDid}=await import('./inhouseSubscriber.js');for(const u of users){try{await ensureIncludedDid(pool,u);}catch{console.warn('INHOUSE_ALLOCATION pending');}}}catch{console.warn('INHOUSE_LIFECYCLE maintenance pending');}finally{if(!stopped){const timer=setTimeout(tick,3600000);timer.unref?.();}}}void tick();return()=>{stopped=true;};}
