import {randomUUID} from 'node:crypto';
import {geoCallingAccess,geoPositionValid,validateZones,insideZone} from './geoCalling.js';
export const hpDefaults={enabled:false,maxAccuracyMeters:1000,maxAgeSeconds:45,zones:[],callerDids:[],destinationPrefix:'234',version:0};
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v),e164=v=>typeof v==='string'&&/^\+[1-9]\d{7,14}$/.test(v);
export async function migrateHpInterconnect(db){
 await db.query(`CREATE TABLE IF NOT EXISTS hp_interconnect_policy(tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,version INT NOT NULL,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await db.query("INSERT IGNORE INTO carrier_provider_catalog(tenant_id,provider,display_name,enabled,created_by) SELECT tenant_id,'hp-inc','HP Inc',FALSE,MIN(id) FROM users WHERE role='super_admin' AND status='active' GROUP BY tenant_id");
}
export async function hpPolicy(db,tenant){const r=(await db.query('SELECT policy,version FROM hp_interconnect_policy WHERE tenant_id=$1',[tenant])).rows[0];return r?{...(typeof r.policy==='string'?JSON.parse(r.policy):r.policy),version:Number(r.version)}:{...hpDefaults,zones:[],callerDids:[]};}
export function validateHpPolicy(b){
 if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.version)||b.version<0||!Number.isInteger(b.maxAccuracyMeters)||b.maxAccuracyMeters<10||b.maxAccuracyMeters>10000||!Number.isInteger(b.maxAgeSeconds)||b.maxAgeSeconds<15||b.maxAgeSeconds>45||!Array.isArray(b.zones)||b.zones.length>50||!Array.isArray(b.callerDids)||b.callerDids.length>1000||b.callerDids.some(v=>!e164(v)))throw Error('Valid HP policy, caller DIDs, age 15–45s and accuracy 10–10000m required');
 const zones=validateZones(b.zones);
 if(b.enabled&&(!zones.length||!b.callerDids.length))throw Error('At least one radius zone and allowed caller DID required');
 return {enabled:b.enabled,maxAccuracyMeters:b.maxAccuracyMeters,maxAgeSeconds:b.maxAgeSeconds,zones,callerDids:[...new Set(b.callerDids)],destinationPrefix:'234'};
}
export function decideHp(policy,p,{destination,callerId,now=Date.now()}){
 const no=reason=>({allowed:false,provider:'hp-inc',destinationPrefix:'234',commissioned:false,reason});
 if(!policy.enabled)return no('HP Inc eligibility policy disabled');
 const n=String(destination||'').replace(/^\+/,'');if(!/^234\d{7,12}$/.test(n))return no('HP Inc only permits Nigeria destinations beginning 234');
 if(!policy.callerDids.includes(callerId))return no('Caller DID not allowed for HP Inc');
 if(!geoPositionValid(p,policy,now))return no('Fresh accurate location required for HP Inc');
 const zone=policy.zones.find(z=>insideZone(p,z));
 return zone?{allowed:true,provider:'hp-inc',destinationPrefix:'234',zone:zone.name,commissioned:false,reason:'Location and caller DID eligible; HP Inc trunk and termination adapter still require commissioning'}:no('Caller location outside all allowed HP Inc radius zones');
}
export async function hpAccess(db,request,{getPolicy=hpPolicy,...deps}={}){const policy=await getPolicy(db,request.tenantId);if(!policy.enabled)return decideHp(policy,null,request);return geoCallingAccess(db,{...request,provider:'hp-inc'},{...deps,getPolicy:async()=>({...policy,enabled:true,rules:[],unmatched:'allow'}),evaluate:(_p,position)=>decideHp(policy,position,request)});}
export async function handleHpInterconnect({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});res.setHeader('Cache-Control','no-store');const root='/api/admin/hp-interconnect';
 if(path===root&&req.method==='GET')return send(res,200,{policy:await hpPolicy(pool,user.tenant_id),provider:'hp-inc',displayName:'HP Inc',type:'Clearing house / interconnect',commissioned:false,required:['HP Inc SIP endpoint, port and transport','IP authorization or SIP authentication','Approved caller IDs and rate deck/currency','Commissioned termination adapter'],users:(await pool.query("SELECT id,display_name,email FROM users WHERE tenant_id=$1 AND status='active' ORDER BY display_name LIMIT 1000",[user.tenant_id])).rows});
 if(path===root+'/test'&&req.method==='POST'){const b=await readJson(req);if(!b||!uuid(b.userId)||!e164(b.callerId)||typeof b.destination!=='string')return send(res,400,{error:'User, caller DID and destination required'});if(!(await pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[b.userId,user.tenant_id])).rows.length)return send(res,404,{error:'Active tenant user required'});return send(res,200,{simulation:true,result:await hpAccess(pool,{tenantId:user.tenant_id,userId:b.userId,destination:b.destination,callerId:b.callerId,simulation:true})});}
 if(path!==root||req.method!=='PUT')return send(res,405,{error:'Unsupported HP Inc action'});
 const b=await readJson(req);let policy;try{policy=validateHpPolicy(b);}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const old=await hpPolicy(db,user.tenant_id);if(old.version!==b.version){await db.query('ROLLBACK');return send(res,409,{error:'HP policy changed; refresh before saving'});}const version=old.version+1,json=JSON.stringify(policy);
 await db.query("INSERT IGNORE INTO carrier_provider_catalog(tenant_id,provider,display_name,enabled,created_by) VALUES($1,'hp-inc','HP Inc',FALSE,$2)",[user.tenant_id,user.id]);
 await db.query('INSERT INTO hp_interconnect_policy(tenant_id,policy,version,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE policy=VALUES(policy),version=VALUES(version),updated_by=VALUES(updated_by)',[user.tenant_id,json,version,user.id]);
 await db.query('INSERT INTO geo_calling_audit(id,tenant_id,actor_id,version,policy) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,version,JSON.stringify({provider:'hp-inc',...policy})]);
 await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'hp_inc_policy_updated']);await db.query('COMMIT');return send(res,200,{saved:true,version,commissioned:false});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
