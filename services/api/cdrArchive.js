import {randomUUID,createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {validateReportSchedule} from './telecomReports.js';
import {reportRange} from './reports.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const archiveRowLimit=50000;
export function csvCell(value){const s=value instanceof Date?value.toISOString():String(value??'');return '"'+(/^[=+\-@\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
export async function migrateCdrArchives(pool){
 const index=await pool.query("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='cdr_records' AND index_name='cdr_archive_range'");
 if(!index.rowCount)await pool.query('ALTER TABLE cdr_records ADD INDEX cdr_archive_range(tenant_id,started_at,id)');
 await pool.query(`CREATE TABLE IF NOT EXISTS cdr_archive_schedules (
 tenant_id CHAR(36) PRIMARY KEY,actor_id CHAR(36) NOT NULL,interval_hours INT NOT NULL,lookback_days INT NOT NULL,
 next_at DATETIME(3) NOT NULL,enabled BOOLEAN NOT NULL,revision INT NOT NULL DEFAULT 1,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS cdr_archives (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
 from_day DATE NOT NULL,to_day DATE NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0,lease_token CHAR(36) NULL,next_attempt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 schedule_key VARCHAR(100) NULL UNIQUE,
 row_count INT NULL,sha256 CHAR(64) NULL,content LONGBLOB NULL,error_code VARCHAR(40) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),completed_at DATETIME(3) NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id),INDEX archive_due(status,next_attempt),INDEX archive_tenant(tenant_id,created_at)) ENGINE=InnoDB`);
}
export async function handleCdrArchives({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const root='/api/admin/telecom/archives';
 if(path===root&&req.method==='GET'){
  const rows=(await pool.query('SELECT id,from_day,to_day,status,attempts,row_count,sha256,error_code,created_at,completed_at FROM cdr_archives WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',[user.tenant_id])).rows;
  const schedule=(await pool.query('SELECT interval_hours,lookback_days,next_at,enabled,revision FROM cdr_archive_schedules WHERE tenant_id=$1',[user.tenant_id])).rows[0]||null;
  return send(res,200,{archives:rows,schedule,rowLimit:archiveRowLimit,note:'Compressed CSV copies of recorded CDRs. Original records are retained. Split date ranges exceeding 50,000 rows. This is not a whole-database backup.'});
 }
 if(path===root+'/schedule'&&req.method==='PUT'){
  let b;try{b=validateReportSchedule({...await readJson(req),name:'CDR archive'});if(b.enabled&&Date.parse(b.nextAt)<Date.now()-60000)throw Error();}catch{return send(res,400,{error:'Valid interval, lookback, future UTC start and enabled state required'});}
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
   const old=(await db.query('SELECT revision FROM cdr_archive_schedules WHERE tenant_id=$1 FOR UPDATE',[user.tenant_id])).rows[0];
   if((old&&b.revision!==old.revision)||(!old&&b.revision!==0)){await db.query('ROLLBACK');return send(res,409,{error:'Schedule changed; refresh'});}
   await db.query(`INSERT INTO cdr_archive_schedules(tenant_id,actor_id,interval_hours,lookback_days,next_at,enabled) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE actor_id=VALUES(actor_id),interval_hours=VALUES(interval_hours),lookback_days=VALUES(lookback_days),next_at=VALUES(next_at),enabled=VALUES(enabled),revision=revision+1`,[user.tenant_id,user.id,b.intervalHours,b.lookbackDays,b.nextAt.slice(0,23).replace('T',' '),b.enabled]);
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'cdr_archive_schedule_saved')",[randomUUID(),user.tenant_id,user.id]);
   await db.query('COMMIT');return send(res,200,{saved:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(path===root&&req.method==='POST'){
  let range;try{const b=await readJson(req);if(typeof b.from!=='string'||typeof b.to!=='string')throw Error();range=reportRange(new URLSearchParams({from:b.from,to:b.to}));}catch{return send(res,400,{error:'Valid from/to dates required, at most 366 days'});}
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
   const n=Number((await db.query('SELECT COUNT(*) AS n FROM cdr_archives WHERE tenant_id=$1',[user.tenant_id])).rows[0]?.n||0);
   if(n>=20){await db.query('ROLLBACK');return send(res,409,{error:'Archive storage limit reached. Download and remove unneeded archive copies first.'});}
   const id=randomUUID();await db.query('INSERT INTO cdr_archives(id,tenant_id,actor_id,from_day,to_day) VALUES($1,$2,$3,$4,$5)',[id,user.tenant_id,user.id,range.from,range.to]);
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'cdr_archive_requested')",[randomUUID(),user.tenant_id,user.id,id]);
   await db.query('COMMIT');return send(res,202,{id,status:'pending'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 const match=/^\/api\/admin\/telecom\/archives\/([0-9a-f-]{36})(\/download)?$/.exec(path);
 if(!match||!uuid.test(match[1]))return send(res,404,{error:'Archive route unavailable'});
 if(match[2]&&req.method==='GET'){
  const row=(await pool.query("SELECT content,sha256 FROM cdr_archives WHERE id=$1 AND tenant_id=$2 AND status='ready'",[match[1],user.tenant_id])).rows[0];
  if(!row)return send(res,404,{error:'Ready archive unavailable'});
  res.writeHead(200,{'Content-Type':'application/gzip','Content-Disposition':`attachment; filename="cdr-${match[1]}.csv.gz"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Archive-SHA256':row.sha256});res.end(row.content);return;
 }
 if(!match[2]&&req.method==='DELETE'){
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');const r=await db.query("DELETE FROM cdr_archives WHERE id=$1 AND tenant_id=$2 AND status IN ('ready','failed','cancelled')",[match[1],user.tenant_id]);
   if(r.rowCount)await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'cdr_archive_copy_removed')",[randomUUID(),user.tenant_id,user.id,match[1]]);
   await db.query('COMMIT');return send(res,r.rowCount?200:409,{removed:!!r.rowCount,note:'Original CDR records are unchanged'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 return send(res,405,{error:'Method unavailable'});
}
const columns=['id','source','leg_id','direction','caller_e164','callee_e164','disposition','duration_seconds','billable_seconds','started_at','received_at'];
export async function processCdrArchive(pool){
 const db=await pool.connect();let job;
 try{
  await db.query('START TRANSACTION');
  await db.query("UPDATE cdr_archives SET status='failed',error_code='RETRIES_EXHAUSTED' WHERE status='running' AND attempts>=3 AND next_attempt<=UTC_TIMESTAMP(3)");
  job=(await db.query("SELECT * FROM cdr_archives WHERE status IN ('pending','running') AND attempts<3 AND next_attempt<=UTC_TIMESTAMP(3) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
  if(!job){await db.query('COMMIT');return false;}
  job.token=randomUUID();await db.query("UPDATE cdr_archives SET status='running',attempts=attempts+1,lease_token=$1,next_attempt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE id=$2",[job.token,job.id]);await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 const update=(status,error)=>pool.query('UPDATE cdr_archives SET status=$1,error_code=$2 WHERE id=$3 AND lease_token=$4',[status,error,job.id,job.token]);
 try{
  const owner=(await pool.query("SELECT u.id FROM users u JOIN tenants home ON home.id=u.tenant_id JOIN tenants t ON t.id=$2 WHERE u.id=$1 AND u.role='super_admin' AND u.status='active' AND t.status='active' AND home.status='active'",[job.actor_id,job.tenant_id])).rows[0];
  if(!owner){await update('cancelled','OWNER_UNAVAILABLE');return true;}
  const day=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
  const from=day(job.from_day),until=new Date(Date.parse(day(job.to_day)+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const chunks=[columns.join(',')+'\r\n'];let count=0,cursor='',started=null,bytes=0;
  while(true){
   const rows=(await pool.query(`SELECT ${columns.join(',')} FROM cdr_records WHERE tenant_id=$1 AND started_at>=$2 AND started_at<$3 AND received_at<=$4 ${started?'AND (started_at>$5 OR (started_at=$5 AND id>$6))':''} ORDER BY started_at,id LIMIT 1000`,started?[job.tenant_id,from,until,job.created_at,started,cursor]:[job.tenant_id,from,until,job.created_at])).rows;
   if(!rows.length)break;
   for(const row of rows){if(++count>archiveRowLimit)throw Error('ROW_LIMIT');const line=columns.map(k=>csvCell(row[k])).join(',')+'\r\n';bytes+=Buffer.byteLength(line);if(bytes>20000000)throw Error('SIZE_LIMIT');chunks.push(line);}
   const last=rows.at(-1);started=last.started_at;cursor=last.id;
   if(rows.length<1000)break;
  }
  const content=gzipSync(chunks.join('')),sha=createHash('sha256').update(content).digest('hex');
  await pool.query("UPDATE cdr_archives SET status='ready',row_count=$1,sha256=$2,content=$3,completed_at=UTC_TIMESTAMP(3),error_code=NULL WHERE id=$4 AND lease_token=$5",[count,sha,content,job.id,job.token]);
 }catch(e){await update(['ROW_LIMIT','SIZE_LIMIT'].includes(e.message)||Number(job.attempts)+1>=3?'failed':'pending',['ROW_LIMIT','SIZE_LIMIT'].includes(e.message)?e.message:'ARCHIVE_RETRY');}
 return true;
}
export function startCdrArchives(pool,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let stopped=false,timer;async function tick(){try{await enqueueCdrArchive(pool);await processCdrArchive(pool);}catch(e){console.error('CDR archive worker',e.code||e.name);}if(!stopped){timer=setTimer(tick,30000);timer.unref?.();}}void tick();return()=>{stopped=true;clearTimer(timer);};
}

export async function enqueueCdrArchive(pool){
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const s=(await db.query("SELECT s.* FROM cdr_archive_schedules s JOIN users u ON u.id=s.actor_id JOIN tenants home ON home.id=u.tenant_id JOIN tenants t ON t.id=s.tenant_id WHERE s.enabled=TRUE AND s.next_at<=UTC_TIMESTAMP(3) AND u.status='active' AND u.role='super_admin' AND home.status='active' AND t.status='active' ORDER BY s.next_at,s.tenant_id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
  if(!s){await db.query('COMMIT');return false;}
  const n=Number((await db.query('SELECT COUNT(*) AS n FROM cdr_archives WHERE tenant_id=$1',[s.tenant_id])).rows[0]?.n||0);
  if(n>=20){await db.query('UPDATE cdr_archive_schedules SET enabled=FALSE,revision=revision+1 WHERE tenant_id=$1',[s.tenant_id]);await db.query('COMMIT');return true;}
  const to=new Date(new Date(s.next_at).getTime()-86400000).toISOString().slice(0,10),from=new Date(Date.parse(to+'T00:00:00Z')-(s.lookback_days-1)*86400000).toISOString().slice(0,10);
  await db.query('INSERT IGNORE INTO cdr_archives(id,tenant_id,actor_id,from_day,to_day,schedule_key) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),s.tenant_id,s.actor_id,from,to,s.tenant_id+':'+new Date(s.next_at).toISOString()]);
  await db.query('UPDATE cdr_archive_schedules SET next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL interval_hours HOUR),revision=revision+1 WHERE tenant_id=$1',[s.tenant_id]);
  await db.query('COMMIT');return true;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
