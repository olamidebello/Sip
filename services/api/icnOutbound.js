import {readFileSync} from 'node:fs';
import {inhouseNumber} from './inhouseSubscriber.js';
const CONFIG='/var/lib/olamide/service-inventory/icn-outbound.json';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function loadIcnOutbound(path=CONFIG){
 let c;try{c=JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('ICN activation configuration invalid');}
 return validateIcnOutbound(c);
}
export function validateIcnOutbound(c){
 if(c?.version!==1||c.enabled!==true||c.carrierApproved!==true||typeof c.approvalReference!=='string'||!c.approvalReference.trim()||c.approvalReference.length>255||!['domestic','e164-digits','e164-plus'].includes(c.callerIdFormat)||!Number.isInteger(c.firstInterval)||!Number.isInteger(c.nextInterval)||c.firstInterval<1||c.firstInterval>60||c.nextInterval<1||c.nextInterval>60||!Number.isInteger(c.maxSeconds)||c.maxSeconds<60||c.maxSeconds>3600||!Number.isInteger(c.maxConcurrent)||c.maxConcurrent<1||c.maxConcurrent>500||!Array.isArray(c.tenants)||!c.tenants.length||c.tenants.some(t=>!uuid.test(t))||!Array.isArray(c.prefixes)||!c.prefixes.length||c.prefixes.length>1000)throw Error('ICN approval, tenant scope, caller format, capacity and billing intervals required');
 const seen=new Set();for(const r of c.prefixes){if(!/^234[1-9][0-9]{0,10}$/.test(r.prefix)||!['gsm','other'].includes(r.category)||seen.has(r.prefix))throw Error('Unique reviewed ICN E164 destination prefixes required');seen.add(r.prefix);}
 if(c.preferredDids&&Object.entries(c.preferredDids).some(([k,v])=>!uuid.test(k)||!/^\+234[1-9][0-9]{7,11}$/.test(v)))throw Error('Invalid ICN preferred DID');
 return c;
}
export function icnTariff(destination,c,fx,now=Date.now()){
 if(!/^234[1-9][0-9]{7,11}$/.test(destination))throw Error('Valid Nigeria destination required');
 const r=c.prefixes.filter(r=>destination.startsWith(r.prefix)).sort((a,b)=>b.prefix.length-a.prefix.length)[0];if(!r)throw Error('No reviewed ICN tariff prefix for destination');
 const at=new Date(fx?.observed_at).getTime(),n=Number(fx?.ngn_per_usd);
 if(!Number.isFinite(n)||n<1||n>1000000||!Number.isFinite(at)||now-at>36*3600000||at>now+300000)throw Error('Fresh validated NGN per USD quote required for ICN billing');
 const sell=r.category==='gsm'?8:10,buy=r.category==='gsm'?4.45:5.25;
 // Round UP once to a USD micro-unit; snapshot this immutable rate for settlement.
 const micros=Math.ceil(sell/n*1e6);return {category:r.category,sellNgn:sell,buyNgn:buy,ngnPerUsd:n,fxAt:new Date(at),rate:(micros/1e6).toFixed(6)};
}
export function icnResponse(call,c){return {route:'pstn',provider:'icn',tenantId:call.tenant_id,maxSeconds:Number(call.max_seconds),callerId:call.caller_id,carrierHost:'196.216.253.173',normalizedDestination:call.destination,icnDestination:'0'+call.destination.slice(3),icnCallerId:c.callerIdFormat==='domestic'?'0'+call.caller_id.slice(4):c.callerIdFormat==='e164-digits'?call.caller_id.slice(1):call.caller_id};}
export async function migrateIcnOutbound(db){await db.query(`CREATE TABLE IF NOT EXISTS icn_call_tariffs(call_key CHAR(64) PRIMARY KEY,did_id CHAR(36) NOT NULL,category VARCHAR(16) NOT NULL,buy_ngn DECIMAL(12,6) NOT NULL,sell_ngn DECIMAL(12,6) NOT NULL,ngn_per_usd DECIMAL(18,6) NOT NULL,fx_at DATETIME(3) NOT NULL,approval_reference VARCHAR(255) NOT NULL,FOREIGN KEY(call_key) REFERENCES pstn_calls(call_key)) ENGINE=InnoDB`);}
export async function icnLocationProof(db,user,sessionHash){
 const lease=(await db.query('SELECT l.lease_proof FROM location_service_leases l JOIN sessions s ON s.token_hash=l.session_hash AND s.user_id=l.user_id AND s.expires_at>UTC_TIMESTAMP(3) WHERE l.tenant_id=$1 AND l.user_id=$2 AND l.session_hash=$3 AND l.expires_ms>$4 ORDER BY l.expires_ms DESC LIMIT 1',[user.tenant_id,user.id,sessionHash,Date.now()])).rows[0];
 return {proof:/^[a-f0-9]{64}$/.test(lease?.lease_proof||'')?lease.lease_proof:null};
}
// Runs inside reservePstn's tenant lock and transaction. null means this user has
// no in-house Nigeria DID and can follow their existing carrier route.
export async function reserveIcnOutbound(db,{actor,data,destination,charge,assertWindow,policies,allowance},{config,access}={}){
 if(inhouseNumber(destination))throw Error('In-house DID must use free subscriber routing');
 if(!destination.startsWith('234'))return null;config??=loadIcnOutbound();if(!config||!config.tenants.includes(actor.tenant_id))return null;
 const rentals=(await db.query("SELECT d.id,d.number_e164,d.status,d.user_id,CASE WHEN f.did_id IS NOT NULL THEN 'active' ELSE r.status END AS rental_status,CASE WHEN f.did_id IS NOT NULL THEN '9999-12-31' ELSE r.paid_until END AS paid_until,g.policy,CASE WHEN f.did_id IS NOT NULL THEN 1 ELSE EXISTS(SELECT 1 FROM smooth_did_payments p JOIN invoices i ON i.id=p.invoice_id AND i.user_id=p.user_id AND i.status='paid' WHERE p.did_id=d.id AND p.tenant_id=d.tenant_id AND p.user_id=d.user_id AND p.period_end=r.paid_until) END AS purchased FROM inhouse_dids d LEFT JOIN inhouse_subscriber_assignments f ON f.did_id=d.id AND f.tenant_id=d.tenant_id AND f.user_id=d.user_id LEFT JOIN smooth_did_rentals r ON r.did_id=d.id AND r.tenant_id=d.tenant_id AND r.user_id=d.user_id LEFT JOIN smooth_did_members m ON m.did_id=d.id LEFT JOIN smooth_did_groups g ON g.id=m.group_id AND g.tenant_id=d.tenant_id WHERE d.tenant_id=$1 AND d.user_id=$2 AND d.number_e164 LIKE '+234%' AND (f.did_id IS NOT NULL OR r.did_id IS NOT NULL) ORDER BY d.number_e164 FOR UPDATE",[actor.tenant_id,actor.user_id])).rows;
 const preferred=config.preferredDids?.[actor.user_id];
 if(!rentals.length){if(preferred)throw Error('Configured ICN DID is not purchased by this user');return null;}
 const candidates=preferred?rentals.filter(r=>r.number_e164===preferred):rentals.filter(r=>r.status==='assigned'&&r.rental_status==='active'&&new Date(r.paid_until)>new Date());
 if(candidates.length!==1)throw Error('Select one active purchased ICN DID in preferredDids');const did=candidates[0];
 if(!Number(did.purchased))throw Error('Subscriber assignment or paid rental required for ICN DID');
 if(did.status!=='assigned'||did.rental_status!=='active'||new Date(did.paid_until)<=new Date())throw Error('ICN DID rental expired or suspended');
 const group=typeof did.policy==='string'?JSON.parse(did.policy):did.policy;
 if(!group||!group.geofenceEnabled||!group.voiceReady||!group.interconnects?.includes('icn'))throw Error('Purchased DID group is not configured for ICN voice');
 if(!access)access=async()=>{
   const {providerAccess}=await import('./providerManager.js');const p=await providerAccess(db,actor.tenant_id,'icn','voice');if(!p.allowed)throw Error(p.reason);
   const {smoothGroupAccess}=await import('./smoothDid.js');const g=await smoothGroupAccess(db,group,{id:actor.user_id,tenant_id:actor.tenant_id},{proof:data.locationProof,provider:'icn'});if(!g.allowed)throw Error(g.reason);
   const {icnAccess}=await import('./icnInterconnect.js');const a=await icnAccess(db,{tenantId:actor.tenant_id,userId:actor.user_id,callerId:did.number_e164,destination,proof:data.locationProof});if(!a.eligible||!a.formatConfirmed||a.dialString!=='0'+destination.slice(3))throw Error(a.reason);
 };
 await access();assertWindow(policies,destination);
 const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[actor.user_id,actor.tenant_id])).rows[0];
 if(wallet?.currency!=='USD'||!Number.isSafeInteger(Number(wallet.balance_cents))||Number(wallet.balance_cents)<0)throw Error('Available USD wallet required');
 const existing=(await db.query('SELECT * FROM pstn_calls WHERE call_key=$1 FOR UPDATE',[data.callKey])).rows[0];
 if(existing){if(existing.tenant_id!==actor.tenant_id||existing.user_id!==actor.user_id||existing.destination!==destination||existing.caller_id!==did.number_e164||existing.provider!=='icn'||existing.status==='settled')throw Error('ICN call key reuse rejected');await db.query('COMMIT');return [200,icnResponse(existing,config)];}
 const blocked=await db.query("SELECT 1 FROM operator_fraud_rules WHERE tenant_id=$1 AND enabled=TRUE AND $2 LIKE CONCAT(prefix,'%') LIMIT 1",[actor.tenant_id,destination]);if(blocked.rows.length)throw Error('Destination blocked by fraud policy');
 const count=Number((await db.query("SELECT COUNT(*) AS n FROM pstn_calls WHERE tenant_id=$1 AND provider='icn' AND status<>'settled'",[actor.tenant_id])).rows[0].n);if(count>=config.maxConcurrent)throw Error('ICN concurrency limit reached');
 const fx=(await db.query('SELECT ngn_per_usd,observed_at FROM icn_display_fx WHERE id=1')).rows[0],tariff=icnTariff(destination,config,fx);
 const budget=Math.min(Number(wallet.balance_cents),await allowance(db,policies,{tenantId:actor.tenant_id,userId:actor.user_id,destination}));let seconds=config.maxSeconds;
 while(seconds>=60&&charge(tariff.rate,seconds,config.firstInterval,config.nextInterval)>budget)seconds-=60;if(seconds<60)throw Error('Insufficient credit for one ICN minute');
 const reserved=charge(tariff.rate,seconds,config.firstInterval,config.nextInterval);
 await db.query('INSERT INTO pstn_calls(call_key,tenant_id,user_id,destination,rate,first_interval,sub_interval,reserved_cents,max_seconds,caller_id,provider,carrier_host) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[data.callKey,actor.tenant_id,actor.user_id,destination,tariff.rate,config.firstInterval,config.nextInterval,reserved,seconds,did.number_e164,'icn','196.216.253.173']);
 await db.query('INSERT INTO icn_call_tariffs(call_key,did_id,category,buy_ngn,sell_ngn,ngn_per_usd,fx_at,approval_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[data.callKey,did.id,tariff.category,tariff.buyNgn,tariff.sellNgn,tariff.ngnPerUsd,tariff.fxAt,config.approvalReference]);
 await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents-$1 WHERE user_id=$2 AND tenant_id=$3',[reserved,actor.user_id,actor.tenant_id]);
 await db.query("INSERT INTO pstn_wallet_entries(call_key,event,user_id,tenant_id,delta_cents,balance_after_cents) VALUES($1,'reserve',$2,$3,$4,$5)",[data.callKey,actor.user_id,actor.tenant_id,-reserved,Number(wallet.balance_cents)-reserved]);
 await db.query('COMMIT');return [200,icnResponse({tenant_id:actor.tenant_id,max_seconds:seconds,caller_id:did.number_e164,destination},config)];
}
