import {randomUUID} from 'node:crypto';
import {collectReport,reportRange} from './reports.js';
const uuid=/^[a-f0-9-]{36}$/i;
export async function migrateTelecomReports(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS telecom_report_schedules(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,name VARCHAR(100) NOT NULL,interval_hours INT UNSIGNED NOT NULL,lookback_days INT UNSIGNED NOT NULL,next_at DATETIME(3) NOT NULL,enabled BOOLEAN NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 1,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX report_due(enabled,next_at),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS telecom_report_runs(id CHAR(36) PRIMARY KEY,schedule_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,due_at DATETIME(3) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts INT UNSIGNED NOT NULL DEFAULT 0,lease_token CHAR(36) NULL,next_attempt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),payload JSON NULL,provider_id VARCHAR(255) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),UNIQUE KEY report_once(schedule_id,due_at),INDEX report_pending(status,next_attempt),FOREIGN KEY(schedule_id) REFERENCES telecom_report_schedules(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
}
export function validateReportSchedule(b){
 if(!b||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!Number.isInteger(b.intervalHours)||b.intervalHours<1||b.intervalHours>720||!Number.isInteger(b.lookbackDays)||b.lookbackDays<1||b.lookbackDays>31||typeof b.enabled!=='boolean'||typeof b.nextAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(b.nextAt)||!Number.isFinite(Date.parse(b.nextAt))||new Date(b.nextAt).toISOString()!==b.nextAt)throw Error('Name, interval (1–720 hours), lookback (1–31 days), UTC start and enabled state required');
 return b;
}
export async function handleTelecomReports({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET'&&path==='/api/admin/telecom/reports'){
  const schedules=(await pool.query('SELECT id,name,interval_hours,lookback_days,next_at,enabled,revision,actor_id FROM telecom_report_schedules WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',[user.tenant_id])).rows;
  const runs=(await pool.query('SELECT id,schedule_id,due_at,status,attempts,provider_id,created_at,updated_at FROM telecom_report_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',[user.tenant_id])).rows;
  return send(res,200,{schedules,runs,mailConfigured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM),note:'Reports go to the creating administrator’s current account email. Accepted means the mail provider accepted the request, not proof of inbox delivery.'});
 }
 const run=/^\/api\/admin\/telecom\/reports\/runs\/([0-9a-f-]{36})$/.exec(path);
 if(req.method==='GET'&&run){const result=await pool.query('SELECT id,status,payload FROM telecom_report_runs WHERE id=$1 AND tenant_id=$2',[run[1],user.tenant_id]);if(!result.rowCount)return send(res,404,{error:'Report unavailable'});const row=result.rows[0];return send(res,200,{...row,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload});}
 const id=path.startsWith('/api/admin/telecom/reports/')?path.slice('/api/admin/telecom/reports/'.length):null;
 if(!((req.method==='POST'&&path==='/api/admin/telecom/reports')||(req.method==='PUT'&&uuid.test(id||''))))return send(res,405,{error:'Use GET, POST or PUT on report schedules'});
 let b;try{b=validateReportSchedule(await readJson(req));if(id&&(!Number.isInteger(b.revision)||b.revision<1))throw Error('Current revision required');if(b.enabled&&Date.parse(b.nextAt)<Date.now()-60000)throw Error('Start must be current or future');}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
  if(id){const result=await db.query('UPDATE telecom_report_schedules SET name=$1,interval_hours=$2,lookback_days=$3,next_at=$4,enabled=$5,revision=revision+1 WHERE id=$6 AND tenant_id=$7 AND actor_id=$8 AND revision=$9',[b.name.trim(),b.intervalHours,b.lookbackDays,b.nextAt.slice(0,23).replace('T',' '),b.enabled,id,user.tenant_id,user.id,b.revision]);if(!result.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Own schedule unavailable or changed; refresh'});}}
  else {const count=Number((await db.query('SELECT COUNT(*) AS n FROM telecom_report_schedules WHERE tenant_id=$1',[user.tenant_id])).rows[0]?.n||0);if(count>=200){await db.query('ROLLBACK');return send(res,409,{error:'Schedule limit reached'});}await db.query('INSERT INTO telecom_report_schedules(id,tenant_id,actor_id,name,interval_hours,lookback_days,next_at,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),user.tenant_id,user.id,b.name.trim(),b.intervalHours,b.lookbackDays,b.nextAt.slice(0,23).replace('T',' '),b.enabled]);}
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)',[randomUUID(),user.tenant_id,user.id,'report_schedule_saved']);await db.query('COMMIT');return send(res,id?200:201,{saved:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function enqueueDueReport(pool){
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const schedule=(await db.query("SELECT s.* FROM telecom_report_schedules s JOIN users u ON u.id=s.actor_id AND u.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id WHERE s.enabled=TRUE AND s.next_at<=UTC_TIMESTAMP(3) AND u.status='active' AND u.role='super_admin' AND t.status='active' ORDER BY s.next_at,s.id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
  if(!schedule){await db.query('COMMIT');return false;}
  await db.query('INSERT IGNORE INTO telecom_report_runs(id,schedule_id,tenant_id,due_at) VALUES($1,$2,$3,$4)',[randomUUID(),schedule.id,schedule.tenant_id,schedule.next_at]);
  await db.query('UPDATE telecom_report_schedules SET next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL interval_hours HOUR),revision=revision+1 WHERE id=$1',[schedule.id]);await db.query('COMMIT');return true;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function processReportRun(pool,{fetchImpl=fetch,now=new Date()}={}){
 const db=await pool.connect();let job;
 try{
  await db.query('START TRANSACTION');
  job=(await db.query("SELECT r.*,s.lookback_days,s.name,s.actor_id,s.enabled FROM telecom_report_runs r JOIN telecom_report_schedules s ON s.id=r.schedule_id WHERE r.status IN ('pending','running') AND r.attempts<5 AND r.next_attempt<=UTC_TIMESTAMP(3) ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
  if(!job){await db.query('COMMIT');return false;}
  job.token=randomUUID();await db.query("UPDATE telecom_report_runs SET status='running',attempts=attempts+1,lease_token=$1,next_attempt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=$2",[job.token,job.id]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 const update=(status,providerId=null)=>pool.query('UPDATE telecom_report_runs SET status=$1,provider_id=$2 WHERE id=$3 AND lease_token=$4',[status,providerId,job.id,job.token]);
 try{
  const actor=(await pool.query("SELECT u.email FROM users u JOIN tenants t ON t.id=u.tenant_id JOIN telecom_report_schedules s ON s.actor_id=u.id AND s.tenant_id=u.tenant_id WHERE s.id=$1 AND s.enabled=TRUE AND u.id=$2 AND u.tenant_id=$3 AND u.role='super_admin' AND u.status='active' AND t.status='active'",[job.schedule_id,job.actor_id,job.tenant_id])).rows[0];
  if(!actor||now-new Date(job.created_at)>23*3600000){await update('cancelled');return true;}
  let payload=typeof job.payload==='string'?JSON.parse(job.payload):job.payload;
  if(!payload){const end=new Date(new Date(job.due_at).getTime()-86400000).toISOString().slice(0,10),from=new Date(Date.parse(end+'T00:00:00Z')-(Number(job.lookback_days)-1)*86400000).toISOString().slice(0,10);payload=await collectReport(pool,job.tenant_id,reportRange(new URLSearchParams({from,to:end})));await pool.query('UPDATE telecom_report_runs SET payload=$1 WHERE id=$2 AND lease_token=$3',[JSON.stringify(payload),job.id,job.token]);}
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM)throw Error('Mail configuration missing');
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'telecom-report/'+job.id},body:JSON.stringify({from:process.env.RESEND_FROM,to:[actor.email],subject:'Olamide SIP report: '+job.name,text:JSON.stringify(payload,null,2)}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Provider rejected report');const result=await response.json();if(typeof result.id!=='string'||!result.id||result.id.length>255)throw Error('Provider acknowledgment missing');await update('accepted',result.id);return true;
 }catch{await update(Number(job.attempts)+1>=5?'failed':'pending');return true;}
}
export function startTelecomReports(pool,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let stopped=false,timer;async function tick(){try{await enqueueDueReport(pool);await processReportRun(pool);}catch(e){console.error('Telecom report worker pending',e.code||e.name);}if(!stopped){timer=setTimer(tick,30000);timer.unref?.();}}void tick();return()=>{stopped=true;clearTimer(timer);};
}
