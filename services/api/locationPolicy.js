import {getServiceCountries,appendServiceEvent} from './serviceCountries.js';
import {countryVerdict} from './countryBoundaries.js';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
const uuid=/^[a-f0-9-]{36}$/i;
export const LOCATION_TTL=45000;
const hash=s=>createHash('sha256').update(s).digest('hex');
export function effectiveVpn(user,groups=[]){return user===null||user===undefined?{allowsVpn:!groups.some(v=>!Boolean(Number(v))),source:groups.length?'group':'default'}:{allowsVpn:!!Number(user),source:'user'};}
export function evaluateLocation(policy,p){
 if(policy.countries?.length){const c=countryVerdict(policy.countries,p);if(!c.allowed)return c;}
 if(!policy.enabled||!policy.zones?.length)return {allowed:true,reason:'No geofence restriction'};
 if(!p||![p.latitude,p.longitude,p.accuracy].every(Number.isFinite)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||p.accuracy<0||p.accuracy>policy.maxAccuracyMeters)return {allowed:false,reason:'Accurate device location required'};
 const rad=n=>n*Math.PI/180;
 const inside=policy.zones.some(z=>{
  const dlat=rad(z.latitude-p.latitude),dlon=rad(z.longitude-p.longitude);
  const a=Math.sin(dlat/2)**2+Math.cos(rad(z.latitude))*Math.cos(rad(p.latitude))*Math.sin(dlon/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(a)))+p.accuracy<=z.radiusMeters;
 });
 return {allowed:inside,reason:inside?'Within allowed area':'Outside allowed area'};
}
export async function migrateLocationPolicy(db){
 for(const sql of [
 `CREATE TABLE IF NOT EXISTS user_vpn_policy(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,allows_vpn BOOLEAN NOT NULL DEFAULT TRUE,updated_by CHAR(36) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS group_vpn_policy(group_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,allows_vpn BOOLEAN NOT NULL DEFAULT TRUE,updated_by CHAR(36) NOT NULL,FOREIGN KEY(group_id) REFERENCES user_groups(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS location_service_leases(session_hash CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,ip_hash CHAR(64) NOT NULL,policy_hash CHAR(64) NOT NULL,source VARCHAR(8) NOT NULL,lease_proof CHAR(64) NOT NULL,latitude DOUBLE NULL,longitude DOUBLE NULL,accuracy DOUBLE NULL,expires_ms BIGINT NOT NULL,INDEX location_user(tenant_id,user_id,expires_ms),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS location_sip_calls(call_key CHAR(64) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,caller_id CHAR(36) NOT NULL,caller_session_hash CHAR(64) NULL,callee_id CHAR(36) NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX location_call_age(created_at)) ENGINE=InnoDB`
 ])await db.query(sql);
}
export async function locationRules(db,tenant,user){
 const p=(await db.query('SELECT policy FROM tenant_geofence_policy WHERE tenant_id=$1',[tenant])).rows[0]?.policy;
 let fence=p?(typeof p==='string'?JSON.parse(p):p):{enabled:false,zones:[],maxAccuracyMeters:100};
 const u=(await db.query('SELECT allows_vpn FROM user_vpn_policy WHERE user_id=$1 AND tenant_id=$2',[user,tenant])).rows[0];
 const g=(await db.query('SELECT p.allows_vpn FROM group_vpn_policy p JOIN user_group_members m ON m.group_id=p.group_id JOIN user_groups g ON g.id=p.group_id AND g.tenant_id=p.tenant_id WHERE m.user_id=$1 AND p.tenant_id=$2',[user,tenant])).rows;
 const vpn=effectiveVpn(u?.allows_vpn,g.map(x=>x.allows_vpn));
 const serviceCountries=await getServiceCountries(db,tenant,user);
 if(serviceCountries&&!serviceCountries.all)fence={...fence,countries:serviceCountries.countries};
 const restricted=!!fence.enabled&&!!fence.zones?.length||!!fence.countries?.length;
 return {...vpn,fence,restricted,policyHash:hash(JSON.stringify({fence,vpn})),ipLookupConfigured:!!process.env.LOCATION_IP_LOOKUP_URL};
}
export async function serviceLocationAccess(db,tenant,user,{sessionHash,ip,proof,requireProof=false,requireSession=false,now=Date.now()}={}){
 const rules=await locationRules(db,tenant,user);
 if(!rules.restricted)return {allowed:true,restricted:false,reason:'No geofence restriction'};
 if(requireProof&&!/^[a-f0-9]{64}$/.test(proof||''))return {allowed:false,restricted:true,reason:'This SIP client requires a device location proof'};
 if(requireSession&&!sessionHash)return {allowed:false,restricted:true,reason:'Call has no bound device location session'};
 const args=[tenant,user,rules.policyHash,now];
 let extra='';if(sessionHash){extra+=' AND l.session_hash=$5';args.push(sessionHash);}
 if(proof){extra+=' AND l.lease_proof=$'+(args.length+1);args.push(proof);}
 if(ip){extra+=' AND l.ip_hash=$'+(args.length+1);args.push(hash(ip));}
 const lease=(await db.query('SELECT l.session_hash,l.source,l.latitude,l.longitude,l.accuracy,l.expires_ms FROM location_service_leases l JOIN sessions s ON s.token_hash=l.session_hash AND s.user_id=l.user_id AND s.expires_at>UTC_TIMESTAMP(3) WHERE l.tenant_id=$1 AND l.user_id=$2 AND l.policy_hash=$3 AND l.expires_ms>$4'+extra+' ORDER BY l.expires_ms DESC LIMIT 1',args)).rows[0];
 if(!lease)return {allowed:false,restricted:true,reason:rules.allowsVpn?'Enable device location to continue':'Fresh trusted IP/VPN verification required'};
 if((rules.allowsVpn&&lease.source!=='gps')||(!rules.allowsVpn&&lease.source!=='ip'))return {allowed:false,restricted:true,reason:'Fresh device location required'};
 const verdict=evaluateLocation(rules.fence,lease);
 return {...verdict,restricted:true,...(proof?{leaseSessionHash:lease.session_hash}:{})};
}
export async function lookupIp(ip,fetcher=fetch){
 if(!isIP(ip))throw Error('Client IP unavailable');
 const raw=process.env.LOCATION_IP_LOOKUP_URL;if(!raw)throw Error('Trusted IP/VPN lookup is not configured');
 const url=new URL(raw);
 if(url.username||url.password||url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','location-ip'].includes(url.hostname)))throw Error('Invalid IP lookup endpoint');
 url.searchParams.set('ip',ip);
 const r=await fetcher(url,{headers:process.env.LOCATION_IP_LOOKUP_TOKEN?{Authorization:'Bearer '+process.env.LOCATION_IP_LOOKUP_TOKEN}:{},signal:AbortSignal.timeout(5000),redirect:'error'});
 if(!r.ok)throw Error('IP verification unavailable');
 const b=await r.json();if(typeof b.isVpn!=='boolean'||![b.latitude,b.longitude,b.accuracy].every(Number.isFinite))throw Error('IP verification response invalid');
 if(b.isVpn)throw Error('VPN connections are disabled for this account');
 return b;
}
export async function handleLocationPolicy({req,res,path,user,pool,send,readJson,sessionHash,ip}){
 if(path.startsWith('/api/admin/location-policy')){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(req.method==='GET'&&path==='/api/admin/location-policy'){
   const users=(await pool.query('SELECT u.id,u.display_name,u.email,p.allows_vpn,CASE WHEN p.user_id IS NOT NULL THEN p.allows_vpn WHEN EXISTS(SELECT 1 FROM user_group_members m JOIN group_vpn_policy gp ON gp.group_id=m.group_id AND gp.tenant_id=u.tenant_id WHERE m.user_id=u.id AND gp.allows_vpn=FALSE) THEN FALSE ELSE TRUE END AS effective_allows_vpn FROM users u LEFT JOIN user_vpn_policy p ON p.user_id=u.id AND p.tenant_id=u.tenant_id WHERE u.tenant_id=$1 ORDER BY u.display_name LIMIT 500',[user.tenant_id])).rows;
   const groups=(await pool.query('SELECT g.id,g.name,p.allows_vpn FROM user_groups g LEFT JOIN group_vpn_policy p ON p.group_id=g.id AND p.tenant_id=g.tenant_id WHERE g.tenant_id=$1 ORDER BY g.name',[user.tenant_id])).rows;
   return send(res,200,{users,groups,defaultAllowsVpn:true,ipLookupConfigured:!!process.env.LOCATION_IP_LOOKUP_URL});
  }
  const m=/^\/api\/admin\/location-policy\/(users|groups)\/([a-f0-9-]{36})$/i.exec(path);
  if(!m||!uuid.test(m[2])||req.method!=='PUT')return send(res,405,{error:'Unsupported policy action'});
  const b=await readJson(req);if(!b||Object.keys(b).some(k=>k!=='allowsVpn')||b.allowsVpn!==null&&typeof b.allowsVpn!=='boolean')return send(res,400,{error:'Allows VPN must be true, false, or null to inherit'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   const isUser=m[1]==='users',table=isUser?'users':'user_groups',key=isUser?'user_id':'group_id',policy=isUser?'user_vpn_policy':'group_vpn_policy';
   const found=await db.query('SELECT id FROM '+table+' WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[m[2],user.tenant_id]);
   if(!found.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Tenant user or group unavailable'});}
   if(b.allowsVpn===null)await db.query('DELETE FROM '+policy+' WHERE '+key+'=$1 AND tenant_id=$2',[m[2],user.tenant_id]);
   else await db.query('INSERT INTO '+policy+'('+key+',tenant_id,allows_vpn,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE allows_vpn=VALUES(allows_vpn),updated_by=VALUES(updated_by)',[m[2],user.tenant_id,b.allowsVpn,user.id]);
   await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,m[2],'vpn_policy_'+m[1]+'_updated']);
   await db.query('COMMIT');return send(res,200,{saved:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 const rules=await locationRules(pool,user.tenant_id,user.id);
 if(req.method==='GET'&&path==='/api/location/policy')return send(res,200,{...rules,policyHash:undefined,fence:undefined,heartbeatSeconds:15,leaseSeconds:45,...await serviceLocationAccess(pool,user.tenant_id,user.id,{sessionHash,ip})});
 if(req.method!=='POST'||path!=='/api/location/heartbeat')return send(res,405,{error:'Unsupported location action'});
 if(!rules.restricted){await pool.query('DELETE FROM location_service_leases WHERE session_hash=$1',[sessionHash]);return send(res,200,{allowed:true,restricted:false,reason:'No geofence restriction'});}
 const b=await readJson(req);let position,source;
 try{
  if(rules.allowsVpn){
   if(!b||b.source!=='gps'||!Number.isFinite(b.timestamp)||Math.abs(Date.now()-b.timestamp)>20000)throw Error('Fresh device location required');
   position={latitude:b.latitude,longitude:b.longitude,accuracy:b.accuracy};source='gps';
  }else {position=await lookupIp(ip);source='ip';}
  const verdict=evaluateLocation(rules.fence,position);if(!verdict.allowed)throw Error(verdict.reason);
  const expires=Date.now()+LOCATION_TTL;
  await pool.query('INSERT INTO location_service_leases(session_hash,user_id,tenant_id,ip_hash,policy_hash,source,latitude,longitude,accuracy,expires_ms,lease_proof) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON DUPLICATE KEY UPDATE ip_hash=VALUES(ip_hash),policy_hash=VALUES(policy_hash),source=VALUES(source),latitude=VALUES(latitude),longitude=VALUES(longitude),accuracy=VALUES(accuracy),expires_ms=VALUES(expires_ms)',[sessionHash,user.id,user.tenant_id,hash(ip),rules.policyHash,source,position.latitude,position.longitude,position.accuracy,expires,randomBytes(32).toString('hex')]);
  const proof=(await pool.query('SELECT lease_proof FROM location_service_leases WHERE session_hash=$1',[sessionHash])).rows[0].lease_proof;
  await trackLocationState(pool,user,'allowed');
  return send(res,200,{allowed:true,restricted:true,expiresAt:expires,source,proof,reason:'Within allowed area'});
 }catch(e){await trackLocationState(pool,user,'denied');await pool.query('DELETE FROM location_service_leases WHERE session_hash=$1',[sessionHash]);return send(res,403,{allowed:false,restricted:true,error:e.message});}
}
export function startLocationCleanup(pool){
 const timer=setInterval(()=>{pool.query('DELETE FROM location_service_leases WHERE expires_ms<$1',[Date.now()]).catch(()=>{});pool.query('DELETE FROM location_sip_calls WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY)').catch(()=>{});},30000);timer.unref();return ()=>clearInterval(timer);
}

async function trackLocationState(pool,user,state){const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id]);const old=(await db.query('SELECT state FROM user_location_event_state WHERE user_id=$1',[user.id])).rows[0]?.state;if(old!==state){await db.query('INSERT INTO user_location_event_state(user_id,state) VALUES($1,$2) ON DUPLICATE KEY UPDATE state=VALUES(state)',[user.id,state]);await appendServiceEvent(db,user.tenant_id,user.id,user.id,'location_access_'+state,{});}await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
