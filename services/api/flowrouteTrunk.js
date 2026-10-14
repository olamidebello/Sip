import {isIP} from 'node:net';
import {randomUUID} from 'node:crypto';
import {masterKey,seal,providerCredentials} from './providerCredentials.js';
export const flowrouteHosts=Object.freeze({'US-East-VA':'us-east-va.sip.flowroute.com','US-West-OR':'us-west-or.sip.flowroute.com'});
const provider='flowroute_sip';
export async function flowrouteTrunk(pool,tenant){
 const value=await providerCredentials(pool,tenant,provider);
 if(!value||value.disabled)return null;
 const row=(await pool.query('SELECT revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2',[tenant,provider])).rows[0];
 return {...value,revision:Number(row?.revision||0)};
}
export function publicTrunk(c){return c?{configured:true,revision:c.revision,authenticationMode:c.authenticationMode,pop:c.pop,host:flowrouteHosts[c.pop],port:5060,sipUsername:c.sipUsername,techPrefix:c.techPrefix,publicIp:c.publicIp,allowedIpConfirmed:c.allowedIpConfirmed,callerId:c.callerId,maxConcurrentCalls:c.maxConcurrentCalls,passwordConfigured:!!c.sipPassword}:{configured:false,revision:0};}
export function validateTrunk(b,old){
 const allowed=['expectedRevision','authenticationMode','pop','sipUsername','sipPassword','techPrefix','publicIp','allowedIpConfirmed','callerId','maxConcurrentCalls'];
 if(!b||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k))||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)throw Error('Current configuration revision required');
 const c={authenticationMode:b.authenticationMode,pop:b.pop,sipUsername:b.sipUsername,techPrefix:b.techPrefix,publicIp:b.publicIp,allowedIpConfirmed:b.allowedIpConfirmed,callerId:b.callerId,maxConcurrentCalls:b.maxConcurrentCalls,sipPassword:b.sipPassword||old?.sipPassword||''};
 if(!['ip','digest'].includes(c.authenticationMode)||!Object.hasOwn(flowrouteHosts,c.pop)||!/^\d{8}$/.test(c.sipUsername||'')||!/^\d{8}$/.test(c.techPrefix||'')||!isIP(c.publicIp||'')||typeof c.allowedIpConfirmed!=='boolean'||typeof c.callerId!=='string'||(c.callerId&&!/^\+[1-9][0-9]{7,14}$/.test(c.callerId))||!Number.isInteger(c.maxConcurrentCalls)||c.maxConcurrentCalls<1||c.maxConcurrentCalls>100000||typeof c.sipPassword!=='string'||c.sipPassword.length>256||/[\r\n\x00]/.test(c.sipPassword)||c.authenticationMode==='digest'&&!c.sipPassword)throw Error('Valid Flowroute authentication, eight-digit identities, public IP, caller ID and capacity required');
 return c;
}
export async function withFlowrouteLock(pool,tenant,action){
 const db=await pool.connect(),name='olamide-flowroute-'+tenant;let held=false;
 try{held=Number((await db.query('SELECT GET_LOCK($1,5) AS acquired',[name])).rows[0]?.acquired)===1;if(!held)throw Error('Flowroute configuration is busy; retry');return await action();}
 finally{try{if(held)await db.query('SELECT RELEASE_LOCK($1)',[name]);}finally{db.release();}}
}
export async function saveFlowrouteTrunk(pool,user,b){return withFlowrouteLock(pool,user.tenant_id,()=>saveUnlocked(pool,user,b));}
async function saveUnlocked(pool,user,b){
 const key=masterKey();if(!key)return {code:409,body:{error:'Configure PROVIDER_CREDENTIAL_KEY before saving SIP credentials'}};
 const old=await flowrouteTrunk(pool,user.tenant_id);let c;try{c=validateTrunk(b,old);}catch(e){return {code:400,body:{error:e.message}};}
 const db=await pool.connect();try{
 await db.query('START TRANSACTION');
 const active=await db.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider='flowroute' AND status='active'",[user.tenant_id]);
 if(active.rowCount){await db.query('ROLLBACK');return {code:409,body:{error:'Deactivate Flowroute before changing live trunk credentials'}};}
 const rows=await db.query('SELECT revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2 FOR UPDATE',[user.tenant_id,provider]);
 if(Number(rows.rows[0]?.revision||0)!==b.expectedRevision){await db.query('ROLLBACK');return {code:409,body:{error:'Configuration changed; refresh before saving'}};}
 const revision=b.expectedRevision+1;
 await db.query('INSERT INTO provider_api_credentials(tenant_id,provider,ciphertext,revision,updated_by) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),revision=VALUES(revision),enabled=TRUE,updated_by=VALUES(updated_by)',[user.tenant_id,provider,seal(c,key,user.tenant_id,provider),revision,user.id]);
 await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'flowroute_sip_settings_updated']);
 await db.query('COMMIT');return {code:200,body:publicTrunk({...c,revision})};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export function adapterTrunk(c){
 if(!c)throw Error('Save Flowroute SIP settings first');
 if(c.authenticationMode==='ip'&&!c.allowedIpConfirmed)throw Error('Confirm the public egress IP is allowed in Flowroute Manage');
 if(!c.callerId)throw Error('Configure an authorized outbound caller ID');
 return {configurationRevision:c.revision,authenticationMode:c.authenticationMode,host:flowrouteHosts[c.pop],port:5060,transport:'udp',register:false,techPrefix:c.techPrefix,publicIp:c.publicIp,callerId:c.callerId,sipUsername:c.sipUsername,...(c.authenticationMode==='digest'?{sipPassword:c.sipPassword}:{}),destinationFormat:c.authenticationMode==='ip'?'techPrefix*E164':'E164',defaultOutbound:'flowroute',fallback:false};
}
export function acknowledgedTrunk(result,c){return result.configurationRevision===c.configurationRevision&&result.authenticationMode===c.authenticationMode&&result.defaultOutbound==='flowroute';}
