import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {countryVerdict} from './countryBoundaries.js';
const countries=Object.keys(JSON.parse(readFileSync(new URL('./dialingCountries.json',import.meta.url),'utf8'))).sort();
const providers=['flowroute','didww'];const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export const geoCallingDefaults={enabled:false,unmatched:'block',maxAccuracyMeters:1000,maxAgeSeconds:45,rules:[]};
export async function migrateGeoCalling(db){
 await db.query(`CREATE TABLE IF NOT EXISTS geo_calling_policies(tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,version INT NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS geo_calling_audit(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,version INT NOT NULL,policy JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX geo_calling_recent(tenant_id,created_at)) ENGINE=InnoDB`);
}
export async function geoCallingPolicy(db,tenant){const r=(await db.query('SELECT policy,version FROM geo_calling_policies WHERE tenant_id=$1',[tenant])).rows[0];return r?{...(typeof r.policy==='string'?JSON.parse(r.policy):r.policy),version:Number(r.version)}:{...geoCallingDefaults,rules:[],version:0};}
export function validateGeoPolicy(b){
 if(!b||Array.isArray(b)||typeof b.enabled!=='boolean'||!['allow','block'].includes(b.unmatched)||!Number.isInteger(b.maxAccuracyMeters)||b.maxAccuracyMeters<10||b.maxAccuracyMeters>10000||!Number.isInteger(b.maxAgeSeconds)||b.maxAgeSeconds<15||b.maxAgeSeconds>45||!Number.isInteger(b.version)||b.version<0||!Array.isArray(b.rules)||b.rules.length>500)throw Error('Valid enabled state, fallback, accuracy 10–10000m, age 15–45s, version and rules required');
 const seen=new Set();const rules=b.rules.map(r=>{if(!r||!countries.includes(r.country)||!providers.includes(r.provider)||typeof r.trunkAvailable!=='boolean'||typeof r.ratesAvailable!=='boolean'||r.deckId!==null&&!uuid(r.deckId))throw Error('Valid country, supported provider, availability flags and rate deck required');const key=r.country+':'+r.provider;if(seen.has(key))throw Error('One rule per country and provider required');seen.add(key);return {country:r.country,provider:r.provider,trunkAvailable:r.trunkAvailable,ratesAvailable:r.ratesAvailable,deckId:r.deckId,zones:validateZones(r.zones||[]),callerDids:validateDids(r.callerDids||[])};});
 return {enabled:b.enabled,unmatched:b.unmatched,maxAccuracyMeters:b.maxAccuracyMeters,maxAgeSeconds:b.maxAgeSeconds,rules};
}
export function validateZones(zones){
 if(!Array.isArray(zones)||zones.length>50)throw Error('Up to 50 geofence zones per interconnect rule required');
 return zones.map(z=>{if(!z||typeof z.name!=='string'||!z.name.trim()||z.name.length>100||![z.latitude,z.longitude,z.radiusMeters].every(Number.isFinite)||Math.abs(z.latitude)>90||Math.abs(z.longitude)>180||z.radiusMeters<1||z.radiusMeters>1000000||z.enabled!==undefined&&typeof z.enabled!=='boolean'||z.deckId!==undefined&&z.deckId!==null&&!uuid(z.deckId))throw Error('Named geofence, valid center, enablement and radius 1–1000000m required');return {name:z.name.trim(),latitude:z.latitude,longitude:z.longitude,radiusMeters:z.radiusMeters,enabled:z.enabled!==false,deckId:z.deckId||null};});
}
export function validateDids(dids){if(!Array.isArray(dids)||dids.length>1000||dids.some(v=>typeof v!=='string'||!/^\+[1-9]\d{7,14}$/.test(v)))throw Error('Valid international caller DID allowlist required');return [...new Set(dids)];}
export function insideZone(p,z){const rad=n=>n*Math.PI/180,a=Math.sin(rad(z.latitude-p.latitude)/2)**2+Math.cos(rad(z.latitude))*Math.cos(rad(p.latitude))*Math.sin(rad(z.longitude-p.longitude)/2)**2;return z.enabled!==false&&6371000*2*Math.asin(Math.min(1,Math.sqrt(a)))+p.accuracy<=z.radiusMeters;}
export function geoPositionValid(p,policy,now=Date.now()){
 return !!p&&[p.latitude,p.longitude,p.accuracy].every(Number.isFinite)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&p.accuracy>=0&&p.accuracy<=policy.maxAccuracyMeters&&Number(p.expires_ms)>now&&Number(p.expires_ms)<=now+50000&&now-(Number(p.expires_ms)-45000)<=policy.maxAgeSeconds*1000;
}
export function decideGeoCalling(policy,position,provider,{now=Date.now(),verdict=countryVerdict,callerId,checkCallerId=true}={}){
 if(!policy.enabled)return {allowed:true,enabled:false,reason:'Geographic calling policy disabled'};
 if(!geoPositionValid(position,policy,now))return {allowed:false,enabled:true,reason:'Fresh accurate device location required for trunk and rate access'};
 let matches;try{matches=[...new Set(policy.rules.map(r=>r.country))].filter(code=>verdict([code],position).allowed);}catch{return {allowed:false,enabled:true,reason:'Country boundary lookup unavailable'};}
 if(matches.length>1)return {allowed:false,enabled:true,reason:'Country location is ambiguous'};
 const country=matches[0]||null,rule=policy.rules.find(r=>r.country===country&&r.provider===provider);
 if(!rule)return {allowed:policy.unmatched==='allow',enabled:true,country,reason:policy.unmatched==='allow'?'Unmatched location/provider permitted':'No geographic trunk/rate rule for this location and provider'};
 const matchingZones=(rule.zones||[]).filter(z=>insideZone(position,z)),zone=matchingZones[0];
 if(new Set(matchingZones.map(z=>z.deckId||rule.deckId||null)).size>1)return {allowed:false,enabled:true,country,reason:'Overlapping geofences have conflicting rate decks'};
 if(rule.zones?.length&&!zone)return {allowed:false,enabled:true,country,reason:'Outside all enabled geofences for this interconnect'};
 if(checkCallerId&&rule.callerDids?.length&&!rule.callerDids.includes(callerId))return {allowed:false,enabled:true,country,reason:'Caller DID not allowed for this interconnect'};
 return {zone:zone?.name,allowed:rule.trunkAvailable&&rule.ratesAvailable,enabled:true,country,deckId:zone?.deckId||rule.deckId,reason:!rule.trunkAvailable?'Trunk unavailable in this location':!rule.ratesAvailable?'Calling rates unavailable in this location':'Trunk and rates permitted'};
}
export async function geoCallingAccess(db,{tenantId,userId,provider,callerId,checkCallerId=true,proof,sessionHash,simulation=false,now=Date.now()},{getPolicy=geoCallingPolicy,getLocationRules=async(...args)=>(await import('./locationPolicy.js')).locationRules(...args),verdict=countryVerdict,evaluate=decideGeoCalling}={}){
 const policy=await getPolicy(db,tenantId);if(!policy.enabled)return decideGeoCalling(policy,null,provider);
 if(!simulation&&!/^[a-f0-9]{64}$/.test(proof||'')&&!/^[a-f0-9]{64}$/.test(sessionHash||''))return {allowed:false,enabled:true,reason:'Session-bound location proof required'};
 const rules=await getLocationRules(db,tenantId,userId),args=[tenantId,userId,rules.policyHash,now];let extra='';
 if(proof){extra+=' AND l.lease_proof=$'+(args.length+1);args.push(proof);}if(sessionHash){extra+=' AND l.session_hash=$'+(args.length+1);args.push(sessionHash);}
 const lease=(await db.query("SELECT l.latitude,l.longitude,l.accuracy,l.source,l.expires_ms FROM location_service_leases l JOIN sessions s ON s.token_hash=l.session_hash AND s.user_id=l.user_id AND s.expires_at>UTC_TIMESTAMP(3) JOIN users u ON u.id=l.user_id AND u.tenant_id=l.tenant_id AND u.status='active' WHERE l.tenant_id=$1 AND l.user_id=$2 AND l.policy_hash=$3 AND l.expires_ms>$4"+extra+' ORDER BY l.expires_ms DESC LIMIT 1',args)).rows[0];
 if(lease&&lease.source!==(rules.allowsVpn?'gps':'ip'))return {allowed:false,enabled:true,reason:'Location source does not match user policy'};
 return evaluate(policy,lease,provider,{now,verdict,callerId,checkCallerId});
}
export function assertGeoRate(access,deckId){if(!access.allowed)throw Error(access.reason);if(access.enabled&&access.deckId&&access.deckId!==deckId)throw Error('Rate deck unavailable in this origin location');}
export async function handleGeoCalling({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});res.setHeader('Cache-Control','no-store');const root='/api/admin/geo-calling';
 if(path===root&&req.method==='GET'){
  const policy=await geoCallingPolicy(pool,user.tenant_id);
  const decks=(await pool.query('SELECT id,provider,active,row_count,imported_at FROM carrier_rate_decks WHERE tenant_id=$1 ORDER BY imported_at DESC LIMIT 100',[user.tenant_id])).rows;
  const trunks=(await pool.query('SELECT provider,status,routing_mode,max_concurrent_calls FROM carrier_provider_profiles WHERE tenant_id=$1',[user.tenant_id])).rows;
  const users=(await pool.query("SELECT id,display_name,email FROM users WHERE tenant_id=$1 AND status='active' ORDER BY display_name LIMIT 1000",[user.tenant_id])).rows;
  const audit=(await pool.query('SELECT actor_id,version,created_at FROM geo_calling_audit WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[user.tenant_id])).rows;
  return send(res,200,{policy,decks,trunks,users,audit,countries,providers});
 }
 if(path===root+'/test'&&req.method==='POST'){
  const b=await readJson(req);if(!b||!uuid(b.userId)||!providers.includes(b.provider))return send(res,400,{error:'User and supported provider required'});
  if(!(await pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[b.userId,user.tenant_id])).rows.length)return send(res,404,{error:'Active tenant user required'});
  return send(res,200,{simulation:true,result:await geoCallingAccess(pool,{tenantId:user.tenant_id,userId:b.userId,provider:b.provider,callerId:b.callerId,simulation:true})});
 }
 if(path!==root||req.method!=='PUT')return send(res,405,{error:'Unsupported geographic calling action'});
 const b=await readJson(req);let policy;try{policy=validateGeoPolicy(b);}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{await db.query('START TRANSACTION');
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const old=await geoCallingPolicy(db,user.tenant_id);
  if(old.version!==b.version){await db.query('ROLLBACK');return send(res,409,{error:'Policy changed; refresh before saving'});}
  for(const r of policy.rules)for(const deckId of new Set([r.deckId,...r.zones.map(z=>z.deckId)].filter(Boolean)))if(!(await db.query('SELECT id FROM carrier_rate_decks WHERE id=$1 AND tenant_id=$2 AND provider=$3',[deckId,user.tenant_id,r.provider])).rows.length){await db.query('ROLLBACK');return send(res,400,{error:'Selected rate deck must belong to this tenant and provider'});}
  const version=old.version+1,json=JSON.stringify(policy);
  await db.query('INSERT INTO geo_calling_policies(tenant_id,policy,version,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE policy=VALUES(policy),version=VALUES(version),updated_by=VALUES(updated_by)',[user.tenant_id,json,version,user.id]);
  await db.query('INSERT INTO geo_calling_audit(id,tenant_id,actor_id,version,policy) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,version,json]);
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'geo_calling_policy_updated']);
  await db.query('COMMIT');return send(res,200,{saved:true,version});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
