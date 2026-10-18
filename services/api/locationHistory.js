import {createHash,randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateLocationHistory(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS location_history_policy (
 tenant_id CHAR(36) PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT TRUE,retention_days INT NOT NULL DEFAULT 90,
 revision INT NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id),
 CHECK(retention_days BETWEEN 1 AND 365)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS user_location_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,capture_key CHAR(64) NOT NULL UNIQUE,
 tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,source VARCHAR(16) NOT NULL,
 latitude DOUBLE NOT NULL,longitude DOUBLE NOT NULL,accuracy DOUBLE NOT NULL,
 captured_at DATETIME(3) NOT NULL,received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CHECK(latitude BETWEEN -90 AND 90),CHECK(longitude BETWEEN -180 AND 180),CHECK(accuracy BETWEEN 0 AND 10000),
 INDEX location_history_own(tenant_id,user_id,id),INDEX location_history_retention(tenant_id,received_at)) ENGINE=InnoDB`);
}
export async function historyPolicy(pool,tenant){const p=(await pool.query('SELECT enabled,retention_days,revision FROM location_history_policy WHERE tenant_id=$1',[tenant])).rows[0];return {enabled:p?!!p.enabled:true,retentionDays:Number(p?.retention_days||90),revision:Number(p?.revision||0)};}
export function validPosition(p){return !!(p&&[p.latitude,p.longitude,p.accuracy].every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&p.accuracy>=0&&p.accuracy<=10000);}
export async function recordLocationSnapshot(pool,user,position,{source,sessionHash,now=Date.now(),capturedAt=now}={}){
 if(!validPosition(position)||!['service_gps','service_ip','manual_gps'].includes(source)||!sessionHash)return false;
 const policy=await historyPolicy(pool,user.tenant_id);if(!policy.enabled)return false;
 // Keep at most one sample per source/session/minute. This avoids recording every 15-second lease refresh.
 const key=createHash('sha256').update([user.tenant_id,user.id,sessionHash,source,Math.floor(now/60000)].join(':')).digest('hex');
 const result=await pool.query('INSERT IGNORE INTO user_location_history(capture_key,tenant_id,user_id,source,latitude,longitude,accuracy,captured_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[key,user.tenant_id,user.id,source,position.latitude,position.longitude,position.accuracy,new Date(capturedAt)]);
 return !!result.rowCount;
}
// Observe an already authorized heartbeat. Do not read its body or extend its lease.
// Capture errors never change the response or weaken location enforcement.
export function observeLocationHeartbeat({req,res,path,pool,resolveUser,sessionHash,onError=()=>console.error('Location history capture unavailable')}){
 if(path!=='/api/location/heartbeat'||req.method!=='POST')return;
 res.once('finish',()=>{if(res.statusCode<200||res.statusCode>=300)return;void (async()=>{
  const user=await resolveUser();if(!user||!sessionHash)return;
  const lease=(await pool.query('SELECT source,latitude,longitude,accuracy FROM location_service_leases WHERE session_hash=$1 AND user_id=$2 AND tenant_id=$3 AND expires_ms>$4',[sessionHash,user.id,user.tenant_id,Date.now()])).rows[0];
  if(lease&&lease.latitude!==null&&lease.longitude!==null&&lease.accuracy!==null)await recordLocationSnapshot(pool,user,{latitude:Number(lease.latitude),longitude:Number(lease.longitude),accuracy:Number(lease.accuracy)},{source:lease.source==='gps'?'service_gps':lease.source==='ip'?'service_ip':'',sessionHash});
 })().catch(onError);});
}
function filterHistory(url,admin,user){
 const before=url.searchParams.get('before')||'18446744073709551615',target=admin?url.searchParams.get('userId'):user.id;
 if(!/^\d{1,20}$/.test(before)||BigInt(before)>18446744073709551615n||target&&!uuid.test(target))throw Error('Invalid location report cursor or user');
 const args=[user.tenant_id,before];let where='h.tenant_id=$1 AND h.id<$2';if(target){args.push(target);where+=' AND h.user_id=$'+args.length;}
 for(const [name,operator] of [['from','>='],['to','<=']]){const text=url.searchParams.get(name);if(text){if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)throw Error('Dates must use YYYY-MM-DD');args.push(name==='to'?text+' 23:59:59.999':text+' 00:00:00');where+=' AND h.captured_at'+operator+'$'+args.length;}}
 const source=url.searchParams.get('source');if(source){if(!['service_gps','service_ip','manual_gps'].includes(source))throw Error('Invalid location source');args.push(source);where+=' AND h.source=$'+args.length;}
 return {args,where};
}
export async function handleLocationHistory({req,res,path,user,pool,send,readJson,sessionHash}){
 const admin=path.startsWith('/api/admin/');if(admin&&user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(!admin&&!(await pool.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rowCount)return send(res,403,{error:'Switch back to your home workspace to view your locations'});
 if(path==='/api/admin/location-history/policy'&&req.method==='PUT'){
  const b=await readJson(req);if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.retentionDays)||b.retentionDays<1||b.retentionDays>365||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)return send(res,400,{error:'Enabled flag, retention of 1–365 days and revision required'});
  const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const p=await historyPolicy(db,user.tenant_id);if(p.revision!==b.expectedRevision){await db.query('ROLLBACK');return send(res,409,{error:'Settings changed. Refresh before saving.'});}
   await db.query('INSERT INTO location_history_policy(tenant_id,enabled,retention_days,revision,updated_by) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),retention_days=VALUES(retention_days),revision=VALUES(revision),updated_by=VALUES(updated_by)',[user.tenant_id,b.enabled,b.retentionDays,p.revision+1,user.id]);await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'location_history_policy_updated')",[randomUUID(),user.tenant_id,user.id]);await db.query('COMMIT');return send(res,200,{updated:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(!['/api/account/location-history','/api/admin/location-history'].includes(path))return send(res,404,{error:'Location history route unavailable'});
 const policy=await historyPolicy(pool,user.tenant_id);
 if(req.method==='GET'){
  let filter;try{filter=filterHistory(new URL(req.url||path,'http://localhost'),admin,user);}catch(e){return send(res,400,{error:e.message});}
  filter.args.push(policy.retentionDays);filter.where+=' AND h.received_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL $'+filter.args.length+' DAY)';
  const history=(await pool.query('SELECT CAST(h.id AS CHAR) AS id,h.user_id,'+(admin?'u.email,':'')+'h.source,h.latitude,h.longitude,h.accuracy,h.captured_at,h.received_at FROM user_location_history h JOIN users u ON u.id=h.user_id WHERE '+filter.where+' ORDER BY h.id DESC LIMIT 50',filter.args)).rows;
  return send(res,200,{history,nextBefore:history.length===50?history.at(-1).id:null,policy,scope:admin?'workspace':'self',note:'Device-reported GPS and approximate IP locations are estimates, not proof of physical presence. Historical records begin after this feature is installed.'});
 }
 if(!admin&&req.method==='POST'){
  if(!policy.enabled)return send(res,409,{error:'Location history collection is disabled for this workspace'});
  const b=await readJson(req);if(!validPosition(b)||!Number.isFinite(b.timestamp)||Math.abs(Date.now()-b.timestamp)>30000||Object.keys(b).some(k=>!['latitude','longitude','accuracy','timestamp'].includes(k)))return send(res,400,{error:'Fresh device coordinates and accuracy are required'});
  const recorded=await recordLocationSnapshot(pool,user,b,{source:'manual_gps',sessionHash,capturedAt:b.timestamp});return send(res,200,{recorded,note:recorded?'Current device location recorded.':'A location was already recorded during this minute.'});
 }
 if(!admin&&req.method==='DELETE'){
  await pool.query('DELETE FROM user_location_history WHERE tenant_id=$1 AND user_id=$2',[user.tenant_id,user.id]);return send(res,200,{deleted:true});
 }
 return send(res,405,{error:'Method unavailable'});
}
export function startLocationHistoryRetention(pool){let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{const rows=(await pool.query('SELECT DISTINCT h.tenant_id,COALESCE(p.retention_days,90) AS days FROM user_location_history h LEFT JOIN location_history_policy p ON p.tenant_id=h.tenant_id')).rows;for(const r of rows)await pool.query('DELETE FROM user_location_history WHERE tenant_id=$1 AND received_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL $2 DAY) LIMIT 1000',[r.tenant_id,Number(r.days)]);}catch{console.error('Location history retention unavailable');}finally{busy=false;}},300000);timer.unref();return ()=>clearInterval(timer);}
