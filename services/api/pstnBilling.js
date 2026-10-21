import {applyFlowrouteCustomerRate} from './flowrouteCustomerRate.js';
import {migrateVoicemail} from './voicemail.js';
import {migrateDialingPolicies} from './dialingPolicy.js';
import {profileDestination} from './localDialing.js';
import {loadTelecomPolicies,normalizeDestination,selectPolicyRate,assertCallingWindow,internationalAllowance,selectShadowRate,selectCallType} from './telecomPolicies.js';
import {loadPolicy,assignedIdentity} from './outboundDids.js';
import {flowrouteTrunk,adapterTrunk} from './flowrouteTrunk.js';

export function callCharge(rate,seconds,first,step){
 if(!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(String(rate))||!Number.isInteger(seconds)||seconds<0||!Number.isInteger(first)||first<1||!Number.isInteger(step)||step<1)throw Error('Invalid rating');
 if(seconds===0)return 0;
 const [whole,fraction='']=String(rate).split('.');const micros=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 const billed=Math.max(first,first+Math.ceil(Math.max(0,seconds-first)/step)*step);
 return Number((micros*BigInt(billed)+599999n)/600000n); // USD micro-units -> cents, rounded up.
}
export async function migratePstnBilling(pool){
 // OLAMIDE_VOICEMAIL_MIGRATION_V1
 await migrateVoicemail(pool);
 await migrateDialingPolicies(pool);
 const db=await pool.connect();let locked=false;
 try{
  locked=Number((await db.query("SELECT GET_LOCK('olamide_pstn_schema_migration',60) AS acquired")).rows[0]?.acquired)===1;
  if(!locked)throw Error('Could not acquire billing migration lock');
 await db.query(`CREATE TABLE IF NOT EXISTS pstn_calls (
 call_key CHAR(64) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 destination VARCHAR(16) NOT NULL,rate DECIMAL(12,6) NOT NULL,first_interval INT NOT NULL,sub_interval INT NOT NULL,
 reserved_cents BIGINT NOT NULL,charged_cents BIGINT NOT NULL DEFAULT 0,max_seconds INT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'reserved',answered_epoch BIGINT NULL,ended_epoch BIGINT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),settled_at DATETIME(3) NULL,
 INDEX pstn_active(tenant_id,status),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 for(const [name,ddl] of [['caller_id','VARCHAR(16) NULL'],['provider',"VARCHAR(16) NOT NULL DEFAULT 'flowroute'"],['carrier_host','VARCHAR(80) NULL'],['shadow_policy_id','CHAR(36) NULL'],['shadow_rate','DECIMAL(12,6) NULL'],['shadow_first','INT NULL'],['shadow_step','INT NULL'],['call_type_id','CHAR(36) NULL']]){
  const found=await db.query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=\'pstn_calls\' AND column_name=$1',[name]);
  if(!found.rowCount)await db.query(`ALTER TABLE pstn_calls ADD COLUMN ${name} ${ddl}`);
 }
 await db.query(`CREATE TABLE IF NOT EXISTS pstn_wallet_entries (
 call_key CHAR(64) NOT NULL,event VARCHAR(16) NOT NULL,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
 delta_cents BIGINT NOT NULL,balance_after_cents BIGINT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(call_key,event),FOREIGN KEY(call_key) REFERENCES pstn_calls(call_key)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS pstn_call_events (
 call_key CHAR(64) NOT NULL,event VARCHAR(16) NOT NULL,event_epoch BIGINT NOT NULL,
 PRIMARY KEY(call_key,event),FOREIGN KEY(call_key) REFERENCES pstn_calls(call_key)) ENGINE=InnoDB`);
 }finally{if(locked)await db.query("SELECT RELEASE_LOCK('olamide_pstn_schema_migration')");db.release();}
}
export async function reservePstn(pool,data){
 if(process.env.KAMAILIO_PSTN_ENABLED!=='true')return [403,{error:'Paid route not deployed'}];
 if(!/^[a-f0-9]{64}$/.test(data.callKey||'')||!/^\+?\d{3,20}$/.test(data.destination||''))return [400,{error:'Valid call key and E164 destination required'}];
 let destination;const db=await pool.connect();let tenantLock;
 try{
  const actor=(await db.query('SELECT tenant_id,user_id,external_calls FROM olamide_sip_call_access WHERE username=$1 AND domain=$2',[data.caller,data.domain])).rows[0];
  if(!actor||!Number(actor.external_calls))return [403,{error:'Active subscription required for PSTN'}];
  tenantLock='pstn-'+actor.tenant_id;
  if(Number((await db.query('SELECT GET_LOCK($1,5) AS acquired',[tenantLock])).rows[0]?.acquired)!==1)throw Error('Billing busy');
  await db.query('START TRANSACTION');
  const policies=await loadTelecomPolicies(db,actor.tenant_id);
  destination=normalizeDestination(await profileDestination(db,actor.tenant_id,actor.user_id,data.destination),policies);
  const identity=assignedIdentity(loadPolicy(),actor.tenant_id,actor.user_id);
  const provider=identity?.provider||'flowroute';
  const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[actor.user_id,actor.tenant_id])).rows[0];
  const existing=(await db.query('SELECT * FROM pstn_calls WHERE call_key=$1 FOR UPDATE',[data.callKey])).rows[0];
  if(existing){
   if(existing.user_id!==actor.user_id||existing.tenant_id!==actor.tenant_id||existing.destination!==destination||existing.status==='settled')throw Error('Call key reuse rejected');
   const callerId=existing.caller_id||adapterTrunk(await flowrouteTrunk(db,actor.tenant_id)).callerId;
   if(identity&&(identity.callerId!==callerId||identity.provider!==existing.provider||identity.carrierHost!==(existing.carrier_host||undefined)))throw Error('Call identity changed; start a new call');
   await db.query('COMMIT');return [200,{route:'pstn',normalizedDestination:destination,tenantId:actor.tenant_id,maxSeconds:existing.max_seconds,callerId,provider:existing.provider||'flowroute',carrierHost:existing.carrier_host||''}];
  }
  assertCallingWindow(policies,destination);
  if(!wallet||wallet.currency!=='USD')throw Error('USD wallet required');
  const profile=provider==='didww'?{max_concurrent_calls:identity.maxConcurrentCalls}:(await db.query("SELECT max_concurrent_calls FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider='flowroute' AND status='active' AND routing_mode<>'disabled'",[actor.tenant_id])).rows[0];
  if(!profile)throw Error('Activate Flowroute first');
  const count=Number((await db.query("SELECT COUNT(*) AS n FROM pstn_calls WHERE tenant_id=$1 AND status<>'settled'",[actor.tenant_id])).rows[0].n);
  if(count>=Number(profile.max_concurrent_calls))throw Error('Carrier concurrency limit reached');
  const blocked=await db.query('SELECT 1 FROM operator_fraud_rules WHERE tenant_id=$1 AND enabled=TRUE AND $2 LIKE CONCAT(prefix,\'%\') LIMIT 1',[actor.tenant_id,destination]);
  if(blocked.rowCount)throw Error('Destination blocked by fraud policy');
  const rate=(await db.query("SELECT r.* FROM carrier_rate_rows r JOIN carrier_rate_decks d ON d.id=r.deck_id WHERE d.tenant_id=$1 AND d.provider=$3 AND d.active=TRUE AND r.effective_at<=UTC_TIMESTAMP() AND $2 LIKE CONCAT(r.prefix,'%') ORDER BY CHAR_LENGTH(r.prefix) DESC,r.effective_at DESC,r.deck_id LIMIT 1",[actor.tenant_id,destination,provider])).rows[0];
  if(!rate)throw Error('Active carrier rate required for destination');
  const config=provider==='flowroute'?adapterTrunk(await flowrouteTrunk(db,actor.tenant_id)):{authenticationMode:'ip'};
  const callerId=identity?.callerId||config.callerId;
  const override=selectPolicyRate(policies,{userId:actor.user_id,callerId,destination});
  if(override&&provider!=='flowroute')Object.assign(rate,{price_usd_per_minute:override.data.rate,first_interval:override.data.first,sub_interval:override.data.step});
// OLAMIDE_FLOWROUTE_COST_PLUS_30_V1
  if(provider==='flowroute')Object.assign(rate,applyFlowrouteCustomerRate(rate));
  const shadow=selectShadowRate(policies,destination);
  const allowance=await internationalAllowance(db,policies,{tenantId:actor.tenant_id,userId:actor.user_id,destination});
  let maxSeconds=3600;const balance=Number(wallet.balance_cents),budget=Math.min(balance,allowance);
  while(maxSeconds>=60&&callCharge(rate.price_usd_per_minute,maxSeconds,rate.first_interval,rate.sub_interval)>budget)maxSeconds-=60;
  if(maxSeconds<60)throw Error('Insufficient credit for one minute');
  const reserved=callCharge(rate.price_usd_per_minute,maxSeconds,rate.first_interval,rate.sub_interval);
  if(config.authenticationMode!=='ip')throw Error('Kamailio paid route requires IP authentication');
  await db.query('INSERT INTO pstn_calls(call_key,tenant_id,user_id,destination,rate,first_interval,sub_interval,reserved_cents,max_seconds,caller_id,provider,carrier_host) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[data.callKey,actor.tenant_id,actor.user_id,destination,rate.price_usd_per_minute,rate.first_interval,rate.sub_interval,reserved,maxSeconds,callerId,provider,identity?.carrierHost||null]);
  const callType=selectCallType(policies,destination);
  if(callType)await db.query('UPDATE pstn_calls SET call_type_id=$1 WHERE call_key=$2',[callType,data.callKey]);
  if(shadow)await db.query('UPDATE pstn_calls SET shadow_policy_id=$1,shadow_rate=$2,shadow_first=$3,shadow_step=$4 WHERE call_key=$5',[shadow.id,shadow.data.rate,shadow.data.first,shadow.data.step,data.callKey]);
  await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents-$1 WHERE user_id=$2 AND tenant_id=$3',[reserved,actor.user_id,actor.tenant_id]);
  await db.query("INSERT INTO pstn_wallet_entries(call_key,event,user_id,tenant_id,delta_cents,balance_after_cents) VALUES($1,'reserve',$2,$3,$4,$5)",[data.callKey,actor.user_id,actor.tenant_id,-reserved,balance-reserved]);
  await db.query('COMMIT');return [200,{route:'pstn',normalizedDestination:destination,tenantId:actor.tenant_id,maxSeconds,callerId,provider,carrierHost:identity?.carrierHost||''}];
 }catch(e){await db.query('ROLLBACK');return [403,{error:e.code?'Billing unavailable':e.message}];}
 finally{if(tenantLock)await db.query('SELECT RELEASE_LOCK($1)',[tenantLock]);db.release();}
}
export async function settlePstn(pool,data){
 if(!/^[a-f0-9]{64}$/.test(data.callKey||'')||!['start','end','failed'].includes(data.event)||!Number.isSafeInteger(data.epoch)||data.epoch<1||data.epoch>Math.floor(Date.now()/1000)+10)return [400,{error:'Invalid switch event'}];
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const call=(await db.query('SELECT * FROM pstn_calls WHERE call_key=$1 FOR UPDATE',[data.callKey])).rows[0];
  if(!call){await db.query('ROLLBACK');return [404,{error:'Reservation unavailable'}];}
  await db.query('INSERT IGNORE INTO pstn_call_events(call_key,event,event_epoch) VALUES($1,$2,$3)',[data.callKey,data.event,data.epoch]);
  const events=(await db.query('SELECT event,event_epoch FROM pstn_call_events WHERE call_key=$1',[data.callKey])).rows;
  const start=events.find(e=>e.event==='start'),end=events.find(e=>e.event==='end'),failed=events.find(e=>e.event==='failed');
  if(call.status==='settled'){await db.query('COMMIT');return [200,{settled:true}];}
  if(!failed&&(!start||!end)){
   if(start)await db.query("UPDATE pstn_calls SET status='answered',answered_epoch=$1 WHERE call_key=$2",[start.event_epoch,data.callKey]);
   await db.query('COMMIT');return [200,{recorded:true}];
  }
  if(failed&&start)throw Error('Conflicting events require review');
  const seconds=failed?0:Math.max(0,Number(end.event_epoch)-Number(start.event_epoch));
  if(seconds>Number(call.max_seconds)+5)throw Error('Duration exceeds reserved call budget; review required');
  const charge=failed?0:callCharge(call.rate,Math.max(1,seconds),call.first_interval,call.sub_interval);
  if(charge>Number(call.reserved_cents))throw Error('Charge exceeds reservation; review required');
  const refund=Number(call.reserved_cents)-charge;
  const wallet=(await db.query('SELECT balance_cents FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[call.user_id,call.tenant_id])).rows[0];
  await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents+$1 WHERE user_id=$2 AND tenant_id=$3',[refund,call.user_id,call.tenant_id]);
  await db.query("INSERT INTO pstn_wallet_entries(call_key,event,user_id,tenant_id,delta_cents,balance_after_cents) VALUES($1,'settle',$2,$3,$4,$5)",[data.callKey,call.user_id,call.tenant_id,refund,Number(wallet.balance_cents)+refund]);
  await db.query("UPDATE pstn_calls SET status='settled',charged_cents=$1,answered_epoch=$2,ended_epoch=$3,settled_at=UTC_TIMESTAMP(3) WHERE call_key=$4",[charge,start?.event_epoch||null,(end||failed).event_epoch,data.callKey]);
  if(call.shadow_policy_id){
   const shadowCharge=failed?0:callCharge(call.shadow_rate,Math.max(1,seconds),Number(call.shadow_first),Number(call.shadow_step));
   await db.query('INSERT INTO telecom_shadow_ledger(call_key,tenant_id,user_id,policy_id,actual_cents,shadow_cents,seconds) VALUES($1,$2,$3,$4,$5,$6,$7)',[data.callKey,call.tenant_id,call.user_id,call.shadow_policy_id,charge,shadowCharge,seconds]);
  }
  await db.query('COMMIT');return [200,{settled:true,chargedCents:charge,refundedCents:refund}];
 }catch{await db.query('ROLLBACK');return [409,{error:'Settlement deferred for reconciliation'}];}finally{db.release();}
}

