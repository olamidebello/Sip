import {createHash,randomUUID} from 'node:crypto';
import parsePhoneNumber from 'libphonenumber-js/max';
import {boundaries,inCountry} from './countryBoundaries.js';
import {lookupIp} from './locationPolicy.js';
import {getServiceCountries} from './serviceCountries.js';
export const defaultShortDial=Object.freeze({enabled:true,maxDigits:9,allowPrimaryFallback:false});
export function validateShortDial(b){if(!b||Object.keys(b).some(k=>!['enabled','maxDigits','allowPrimaryFallback'].includes(k))||typeof b.enabled!=='boolean'||!Number.isInteger(b.maxDigits)||b.maxDigits<4||b.maxDigits>9||typeof b.allowPrimaryFallback!=='boolean')throw Error('Choose enabled, a digit limit from 4 to 9, and a primary-country fallback preference');return {enabled:b.enabled,maxDigits:b.maxDigits,allowPrimaryFallback:b.allowPrimaryFallback};}
export async function migrateShortDial(db){await db.query(`CREATE TABLE IF NOT EXISTS tenant_short_dial_policy(tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,revision INT NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);}
export async function shortDialPolicy(db,tenant){const row=(await db.query('SELECT policy,revision FROM tenant_short_dial_policy WHERE tenant_id=$1',[tenant])).rows[0];return {policy:row?validateShortDial(typeof row.policy==='string'?JSON.parse(row.policy):row.policy):{...defaultShortDial},revision:row?.revision||0};}
export function countryAtPosition(p,data=boundaries()){
 if(!p||![p.latitude,p.longitude,p.accuracy].every(Number.isFinite)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||p.accuracy<0||p.accuracy>10000)return null;
 const found=[...data].filter(([,polygons])=>inCountry(polygons,p)).map(([country])=>country);return found.length===1?found[0]:null;
}
export function prefixNationalNumber(number,country){
 if(!/^\d{4,9}$/.test(number))throw Error('Enter a complete national number or an international number beginning with +');
 let parsed;try{parsed=parsePhoneNumber(number,{defaultCountry:country,extract:false});}catch{}
 if(!parsed?.isPossible()||!/^\+[1-9]\d{7,14}$/.test(parsed.number))throw Error('This number is incomplete for '+country+'. Include the area code or dial the full international number with +.');
 return parsed.number;
}
function needLocation(message='Allow device location to determine the country code, or dial the full international number with +'){const e=Error(message);e.code='DIAL_COUNTRY_REQUIRED';return e;}
export async function resolveShortDial(db,user,target,{sessionHash,ip,position,now=Date.now()}={}){
 const m=/^sip:(\d{1,9})@([a-z0-9.-]{1,253})$/i.exec(target||'');if(!m)return {target,normalized:false};
 // Any registered numeric identity is handled by normal call access, including cross-tenant denial.
 const internal=await db.query("SELECT a.user_id FROM sip_accounts a JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id WHERE a.username=$1 AND a.domain=$2 AND a.status='active' AND u.status='active' LIMIT 1",[m[1],m[2].toLowerCase()]);if(internal.rowCount)return {target,normalized:false};
 const {policy}=await shortDialPolicy(db,user.tenant_id);if(!policy.enabled||m[1].length>policy.maxDigits)return {target,normalized:false};
 if(m[1].length<4){const e=Error('Short service and emergency codes require an explicitly configured dial plan');e.code='SHORT_SERVICE_CODE';throw e;}
 let country=null,source;
 if(sessionHash&&ip){const lease=(await db.query('SELECT l.latitude,l.longitude,l.accuracy FROM location_service_leases l JOIN sessions s ON s.token_hash=l.session_hash AND s.user_id=l.user_id AND s.expires_at>UTC_TIMESTAMP(3) WHERE l.user_id=$1 AND l.tenant_id=$2 AND l.session_hash=$3 AND l.ip_hash=$4 AND l.expires_ms>$5 LIMIT 1',[user.id,user.tenant_id,sessionHash,createHash('sha256').update(ip).digest('hex'),now])).rows[0];if(lease){country=countryAtPosition(lease);if(country)source='current_location_lease';}}
 if(!country&&position){if(!Number.isFinite(position.timestamp)||Math.abs(now-position.timestamp)>20000)throw needLocation('A fresh device location is required; retry or dial a full international number with +');country=countryAtPosition(position);if(country)source='device_location';}
 if(!country&&process.env.LOCATION_IP_LOOKUP_URL&&ip){try{country=countryAtPosition(await lookupIp(ip));if(country)source='trusted_ip_lookup';}catch{/* A browser GPS retry remains available. */}}
 if(!country&&policy.allowPrimaryFallback){const saved=await getServiceCountries(db,user.tenant_id,user.id);if(saved){country=saved.primaryCountry;source='saved_primary_country';}}
 if(!country)throw needLocation();
 const number=prefixNationalNumber(m[1],country);
 return {target:'sip:'+number+'@'+m[2].toLowerCase(),normalized:true,normalizedNumber:number,country,source};
}
export async function handleShortDialAdmin({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET')return send(res,200,await shortDialPolicy(pool,user.tenant_id));
 if(req.method!=='PUT')return send(res,405,{error:'GET or PUT required'});
 const body=await readJson(req);let policy;try{if(!Number.isInteger(body?.expectedRevision)||body.expectedRevision<0)throw Error('Refresh settings before saving');const {expectedRevision,...b}=body;policy=validateShortDial(b);}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const current=await shortDialPolicy(db,user.tenant_id);if(current.revision!==body.expectedRevision){await db.query('ROLLBACK');return send(res,409,{error:'Settings changed; refresh before saving'});}
 await db.query('INSERT INTO tenant_short_dial_policy(tenant_id,policy,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE policy=VALUES(policy),updated_by=VALUES(updated_by),revision=revision+1',[user.tenant_id,JSON.stringify(policy),user.id]);await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'short_dial_policy_updated')",[randomUUID(),user.tenant_id,user.id]);await db.query('COMMIT');return send(res,200,{policy,revision:current.revision+1});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
