import {profileAddress} from './locationReportAddress.js';
import {randomUUID} from 'node:crypto';
const defaults={enabled:true,retentionDays:30};
export async function migrateLocationReports(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS tenant_location_reports (
 tenant_id CHAR(36) PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT TRUE,retention_days INT NOT NULL DEFAULT 30,
 updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function locationReportPolicy(pool,tenant){const r=(await pool.query('SELECT enabled,retention_days FROM tenant_location_reports WHERE tenant_id=$1',[tenant])).rows[0];return r?{enabled:!!r.enabled,retentionDays:Number(r.retention_days)}:{...defaults};}
export async function handleLocationReports({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const path=new URL(req.url,'http://local').pathname;
 if(path.endsWith('/policy')){
  if(req.method==='GET')return send(res,200,await locationReportPolicy(pool,user.tenant_id));
  if(req.method!=='PUT')return send(res,405,{error:'GET or PUT required'});
  const b=await readJson(req);
  if(typeof b.enabled!=='boolean'||!Number.isInteger(b.retentionDays)||b.retentionDays<1||b.retentionDays>30)return send(res,400,{error:'Enable setting and retention of 1–30 days required'});
  await pool.query('INSERT INTO tenant_location_reports(tenant_id,enabled,retention_days,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),retention_days=VALUES(retention_days),updated_by=VALUES(updated_by)',[user.tenant_id,b.enabled,b.retentionDays,user.id]);
  await pool.query("DELETE FROM user_location_history WHERE tenant_id=$1 AND recorded_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL $2 DAY)",[user.tenant_id,b.retentionDays]);
  await audit(pool,user,'location_report_policy_changed');return send(res,200,{enabled:b.enabled,retentionDays:b.retentionDays});
 }
 if(req.method==='DELETE'){
  const b=await readJson(req);
  if(!/^[0-9a-f-]{36}$/i.test(b.userId||''))return send(res,400,{error:'Select a report user'});
  await pool.query('DELETE FROM user_location_history WHERE tenant_id=$1 AND user_id=$2',[user.tenant_id,b.userId]);
  await audit(pool,user,'location_report_cleared',b.userId);return send(res,200,{status:'cleared'});
 }
 if(req.method!=='GET')return send(res,405,{error:'GET or DELETE required'});
 const policy=await locationReportPolicy(pool,user.tenant_id);
 await pool.query('DELETE FROM user_location_history WHERE tenant_id=$1 AND recorded_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL $2 DAY)',[user.tenant_id,policy.retentionDays]);
 const rows=await pool.query('SELECT h.user_id AS userId,u.display_name AS name,h.latitude,h.longitude,h.accuracy_meters AS accuracyMeters,h.recorded_at AS recordedAt,p.address_line1 AS address1,p.address_line2 AS address2,p.city,p.region,p.postal_code AS postalCode,p.country FROM user_location_history h JOIN users u ON u.id=h.user_id AND u.tenant_id=h.tenant_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE h.tenant_id=$1 ORDER BY h.recorded_at DESC,h.id DESC LIMIT 500',[user.tenant_id]);
 await audit(pool,user,'location_report_viewed');return send(res,200,{policy,entries:rows.rows.map(row=>({...row,profileAddress:profileAddress(row)})),limit:500});
}
async function audit(pool,user,action,target=null){await pool.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,target,action]);}
