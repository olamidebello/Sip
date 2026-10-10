import {randomUUID,timingSafeEqual} from 'node:crypto';
import {fleetLevel,handleFleetNetwork} from './fleetNetwork.js';
import {handleFleetFirewall} from './fleetFirewall.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const label=/^[a-z][a-z0-9-]{1,39}$/;
const userName=/^[a-z_][a-z0-9_-]{0,31}$/;
const region=/^[a-zA-Z0-9 ._-]{1,40}$/;
export function validNode(body){
  if(!body||!label.test(body.name||'')||!userName.test(body.sshUser||'')||
    !region.test(body.region||'')||!Number.isSafeInteger(body.sshPort)||body.sshPort<1||body.sshPort>65535||
    !Number.isSafeInteger(body.capacity)||body.capacity<1||body.capacity>100000||
    !['switch','app'].includes(body.role))return false;
  const octets=String(body.host||'').split('.');
  return octets.length===4&&octets.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255)&&
    Number(octets[0])!==0&&Number(octets[0])!==127&&
    !(Number(octets[0])===169&&Number(octets[1])===254)&&
    !(Number(octets[0])===100&&Number(octets[1])===100&&Number(octets[2])===100&&Number(octets[3])===200);
}
export function runnerAuthorized(header,secret){
  if(typeof secret!=='string'||secret.length<32||typeof header!=='string'||!header.startsWith('Bearer '))return false;
  const a=Buffer.from(header.slice(7)),b=Buffer.from(secret);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function migrateServerFleet(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS deployment_nodes (
    id CHAR(36) PRIMARY KEY,name VARCHAR(40) NOT NULL UNIQUE,role VARCHAR(16) NOT NULL,
    host VARCHAR(45) NOT NULL,ssh_user VARCHAR(32) NOT NULL,ssh_port SMALLINT UNSIGNED NOT NULL,
    region VARCHAR(40) NOT NULL,capacity INT UNSIGNED NOT NULL DEFAULT 100,enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(16) NOT NULL DEFAULT 'new',version VARCHAR(80) NULL,metrics JSON NULL,
    last_seen_at DATETIME(3) NULL,last_error VARCHAR(500) NULL,
    created_by CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(created_by) REFERENCES users(id),UNIQUE KEY node_host_role(host,role)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deployment_jobs (
    id CHAR(36) PRIMARY KEY,node_id CHAR(36) NOT NULL,action VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    runner_id VARCHAR(80) NULL,lease_until DATETIME(3) NULL,requested_by CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    started_at DATETIME(3) NULL,finished_at DATETIME(3) NULL,
    summary VARCHAR(1000) NULL,FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),
    FOREIGN KEY(requested_by) REFERENCES users(id),INDEX next_job(status,created_at),
    INDEX node_history(node_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deployment_checks (
    id CHAR(36) PRIMARY KEY,node_id CHAR(36) NOT NULL,status VARCHAR(16) NOT NULL,
    version VARCHAR(80) NULL,latency_ms INT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),INDEX node_check_time(node_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kamailio_node_checks (
    id CHAR(36) PRIMARY KEY,node_id CHAR(36) NOT NULL,
    signaling_status VARCHAR(16) NOT NULL,media_status VARCHAR(16) NOT NULL,
    version VARCHAR(80) NULL,latency_ms INT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),
    INDEX kamailio_node_time(node_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kamailio_node_configs (
    node_id CHAR(36) PRIMARY KEY,sip_domain VARCHAR(255) NOT NULL,
    listen_ip VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
    listen_port SMALLINT UNSIGNED NOT NULL DEFAULT 5062,
    api_url VARCHAR(255) NOT NULL DEFAULT 'http://127.0.0.1:18080',
    media_socket VARCHAR(80) NOT NULL DEFAULT 'udp:127.0.0.1:2223',
    max_concurrent_calls INT UNSIGNED NOT NULL DEFAULT 100,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),
    FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kamailio_node_config_audit (
    id CHAR(36) PRIMARY KEY,node_id CHAR(36) NOT NULL,revision INT UNSIGNED NOT NULL,
    sip_domain VARCHAR(255) NOT NULL,max_concurrent_calls INT UNSIGNED NOT NULL,
    actor_id CHAR(36) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),
    FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX kamailio_config_history(node_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deployment_schedules (
    id CHAR(36) PRIMARY KEY,node_id CHAR(36) NOT NULL,action VARCHAR(16) NOT NULL,
    interval_minutes INT UNSIGNED NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at DATETIME(3) NOT NULL,created_by CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),FOREIGN KEY(created_by) REFERENCES users(id),
    INDEX due_schedules(enabled,next_run_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deployment_events (
    id CHAR(36) PRIMARY KEY,node_id CHAR(36) NULL,job_id CHAR(36) NULL,
    category VARCHAR(32) NOT NULL,detail VARCHAR(500) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),
    FOREIGN KEY(job_id) REFERENCES deployment_jobs(id),
    INDEX event_time(created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deployment_report_settings (
    id TINYINT PRIMARY KEY,stale_seconds INT UNSIGNED NOT NULL DEFAULT 300,
    warning_latency_ms INT UNSIGNED NOT NULL DEFAULT 2000,
    retention_days INT UNSIGNED NOT NULL DEFAULT 90,
    updated_by CHAR(36) NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query('INSERT IGNORE INTO deployment_report_settings(id) VALUES(1)');
}
async function queue(pool,nodeId,action,userId){
  const db=await pool.connect();
  try{
    await db.query('START TRANSACTION');
    const node=(await db.query('SELECT id,role,enabled FROM deployment_nodes WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[nodeId])).rows[0];
    if(!node){await db.query('ROLLBACK');return {code:404,error:'Server unavailable'};}
    if(!node.enabled){await db.query('ROLLBACK');return {code:409,error:'Server disabled'};}
    if(node.role!=='switch'){await db.query('ROLLBACK');return {code:409,error:'Only switch node deployment is configured'};}
    const active=await db.query("SELECT id FROM deployment_jobs WHERE node_id=$1 AND (status='pending' OR (status='leased' AND lease_until>UTC_TIMESTAMP(3))) LIMIT 1",[nodeId]);
    if(active.rowCount){await db.query('ROLLBACK');return {code:409,error:'Server already has an active job'};}
    const id=randomUUID();
    await db.query("INSERT INTO deployment_jobs(id,node_id,action,requested_by) VALUES($1,$2,$3,$4)",[id,nodeId,action,userId]);
    await db.query("INSERT INTO deployment_events(id,node_id,job_id,category,detail) VALUES($1,$2,$3,'job_queued',$4)",
      [randomUUID(),nodeId,id,action]);
    await db.query('COMMIT');
    return {code:202,id,status:'pending'};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function handleServerFleetAdmin({req,res,path,user,pool,send,readJson}){
  const level=await fleetLevel(pool,user);
  const granted=needed=>({view:1,manage:2,deploy:3})[level]>=({view:1,manage:2,deploy:3})[needed];
  if(path==='/api/admin/servers/kamailio'&&req.method==='GET'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const result=await pool.query(`SELECT n.id,n.name,n.region,n.capacity,n.enabled,
      c.signaling_status,c.media_status,c.version,c.latency_ms,c.created_at
      FROM deployment_nodes n LEFT JOIN kamailio_node_checks c ON c.id=(
        SELECT c2.id FROM kamailio_node_checks c2 WHERE c2.node_id=n.id
        ORDER BY c2.created_at DESC,c2.id DESC LIMIT 1)
      WHERE n.role='switch' AND n.deleted_at IS NULL ORDER BY n.name LIMIT 500`);
    return send(res,200,{nodes:result.rows,scope:'Reported systemd service state only; calls and RTP quality are not measured'});
  }
  if(path==='/api/admin/servers/commissioning'&&req.method==='GET'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const [calls,journals]=await Promise.all([
      pool.query("SELECT status,COUNT(*) AS count FROM prepaid_calls GROUP BY status"),
      pool.query("SELECT COUNT(*) AS count FROM billing_journals WHERE source_type='prepaid_call'")]);
    return send(res,200,{reservations:calls.rows,prepaidJournals:Number(journals.rows[0]?.count||0),
      liveCarrierVerified:false,scope:'Database counts only; reconcile each carrier CDR and observe call expiry before commissioning'});
  }
  if(path==='/api/admin/servers/kamailio-config'&&req.method==='GET'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const configs=await pool.query(`SELECT c.node_id,n.name,n.region,c.sip_domain,c.listen_ip,c.listen_port,
      c.api_url,c.media_socket,c.max_concurrent_calls,c.revision,c.updated_at
      FROM kamailio_node_configs c JOIN deployment_nodes n ON n.id=c.node_id
      WHERE n.deleted_at IS NULL ORDER BY n.name`);
    const history=await pool.query(`SELECT a.node_id,a.revision,a.sip_domain,a.max_concurrent_calls,a.created_at
      FROM kamailio_node_config_audit a ORDER BY a.created_at DESC LIMIT 50`);
    return send(res,200,{configs:configs.rows,history:history.rows,
      scope:'Saved loopback adapter intent only; live SIP services and carrier routes are unchanged'});
  }
  const kamailioConfig=/^\/api\/admin\/servers\/([0-9a-f-]{36})\/kamailio-config$/.exec(path);
  if(kamailioConfig&&req.method==='PUT'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const b=await readJson(req);
    if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(b.sipDomain||'')||
       !Number.isSafeInteger(b.maxConcurrentCalls)||b.maxConcurrentCalls<1||b.maxConcurrentCalls>5000||
       !Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)
      return send(res,400,{error:'Valid SIP domain, call capacity, and expected revision required'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      const node=await db.query("SELECT role,enabled FROM deployment_nodes WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[kamailioConfig[1]]);
      if(!node.rowCount||node.rows[0].role!=='switch'||!node.rows[0].enabled){
        await db.query('ROLLBACK');return send(res,404,{error:'Enabled switch node unavailable'});
      }
      const existing=await db.query('SELECT revision FROM kamailio_node_configs WHERE node_id=$1 FOR UPDATE',[kamailioConfig[1]]);
      const previous=Number(existing.rows[0]?.revision||0);
      if(previous!==b.expectedRevision){
        await db.query('ROLLBACK');return send(res,409,{error:'Configuration changed; refresh before saving'});
      }
      const revision=previous+1;
      await db.query(`INSERT INTO kamailio_node_configs(node_id,sip_domain,max_concurrent_calls,revision,updated_by)
        VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE sip_domain=VALUES(sip_domain),
        max_concurrent_calls=VALUES(max_concurrent_calls),revision=VALUES(revision),
        updated_by=VALUES(updated_by)`,
        [kamailioConfig[1],b.sipDomain.toLowerCase(),b.maxConcurrentCalls,revision,user.id]);
      await db.query(`INSERT INTO kamailio_node_config_audit(id,node_id,revision,sip_domain,max_concurrent_calls,actor_id)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [randomUUID(),kamailioConfig[1],revision,b.sipDomain.toLowerCase(),b.maxConcurrentCalls,user.id]);
      await db.query('COMMIT');
      return send(res,200,{nodeId:kamailioConfig[1],revision,state:'staged'});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  if(path==='/api/admin/servers/permissions'&&req.method==='GET')return send(res,200,{accessLevel:level});
  if(path==='/api/admin/servers/firewall'||/^\/api\/admin\/servers\/[0-9a-f-]{36}\/firewall$/.test(path))
    return handleFleetFirewall({req,res,path,user,pool,send,readJson,level,queue});
  if(path.startsWith('/api/admin/servers/devices')||path.startsWith('/api/admin/servers/access'))
    return handleFleetNetwork({req,res,path,user,pool,send,readJson,level});
  if(!granted('view'))return send(res,403,{error:'Fleet access required'});
  if(path==='/api/admin/servers'&&req.method==='GET'){
    if(req.method==='GET'&&!granted('view'))return send(res,403,{error:'Fleet view access required'});
    const [nodes,jobs,settings,schedules,events]=await Promise.all([
      pool.query('SELECT id,name,role,host,ssh_user,ssh_port,region,capacity,enabled,status,version,metrics,last_seen_at,last_error,sort_order,created_at FROM deployment_nodes WHERE deleted_at IS NULL ORDER BY sort_order,name LIMIT 500'),
      pool.query('SELECT j.id,j.node_id,n.name AS node_name,j.action,j.status,j.attempts,j.created_at,j.started_at,j.finished_at,j.summary FROM deployment_jobs j JOIN deployment_nodes n ON n.id=j.node_id ORDER BY j.created_at DESC LIMIT 100'),
      pool.query('SELECT stale_seconds,warning_latency_ms,retention_days FROM deployment_report_settings WHERE id=1'),
      pool.query('SELECT id,node_id,action,interval_minutes,enabled,next_run_at FROM deployment_schedules ORDER BY next_run_at LIMIT 200'),
      pool.query('SELECT e.id,e.node_id,n.name AS node_name,e.category,e.detail,e.created_at FROM deployment_events e LEFT JOIN deployment_nodes n ON n.id=e.node_id ORDER BY e.created_at DESC LIMIT 100')]);
    return send(res,200,{nodes:nodes.rows,jobs:jobs.rows,settings:settings.rows[0],schedules:schedules.rows,events:events.rows,accessLevel:level,superAdmin:user.role==='super_admin',
      runnerConfigured:!!process.env.DEPLOY_RUNNER_TOKEN,scope:'Switch jobs require the private Ansible runner. App capacity remains on the existing Compose cluster control.'});
  }
  if(path==='/api/admin/servers'&&req.method==='POST'){
    if(!granted('manage'))return send(res,403,{error:'Fleet management access required'});
    const b=await readJson(req);
    if(!validNode(b))return send(res,400,{error:'Valid server name, IPv4 address, SSH user, port, region, role and capacity required'});
    const id=randomUUID();
    try{await pool.query('INSERT INTO deployment_nodes(id,name,role,host,ssh_user,ssh_port,region,capacity,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id,b.name,b.role,b.host,b.sshUser,b.sshPort,b.region,b.capacity,user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Server name or host already registered'});throw error;}
    return send(res,201,{id,status:'new'});
  }
  if(path==='/api/admin/servers/report'&&req.method==='GET'){
    const days=Number(new URL(req.url,'http://localhost').searchParams.get('days')||7);
    if(!Number.isInteger(days)||days<1||days>90)return send(res,400,{error:'Report range must be 1 to 90 days'});
    const [health,jobs,settings,capacity,events]=await Promise.all([
      pool.query('SELECT n.id,n.name,n.role,n.status,n.version,n.region,n.capacity,n.last_seen_at,COUNT(c.id) AS checks,COALESCE(SUM(c.status=\'healthy\'),0) AS healthy_checks,MAX(c.latency_ms) AS max_latency_ms FROM deployment_nodes n LEFT JOIN deployment_checks c ON c.node_id=n.id AND c.created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL $1 DAY) GROUP BY n.id ORDER BY n.name',[days]),
      pool.query('SELECT action,status,COUNT(*) AS count FROM deployment_jobs WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL $1 DAY) GROUP BY action,status',[days]),
      pool.query('SELECT stale_seconds,warning_latency_ms,retention_days FROM deployment_report_settings WHERE id=1'),
      pool.query("SELECT role,COUNT(*) AS nodes,COALESCE(SUM(capacity),0) AS configured_capacity FROM deployment_nodes WHERE enabled=TRUE GROUP BY role"),
      pool.query("SELECT category,COUNT(*) AS count FROM deployment_events WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL $1 DAY) GROUP BY category",[days])]);
    return send(res,200,{days,health:health.rows,jobs:jobs.rows,settings:settings.rows[0],capacity:capacity.rows,events:events.rows,
      note:'Capacity is configured inventory, not measured concurrent call throughput. Health is reported by the private runner.'});
  }
  if(path==='/api/admin/servers/topology'&&req.method==='GET'){
    const [regions,targets]=await Promise.all([
      pool.query("SELECT n.region,n.role,COUNT(*) AS nodes,COALESCE(SUM(n.capacity),0) AS configured_capacity,COALESCE(SUM(n.enabled=TRUE AND n.status='healthy' AND n.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL s.stale_seconds SECOND)),0) AS fresh_healthy FROM deployment_nodes n JOIN deployment_report_settings s ON s.id=1 WHERE n.deleted_at IS NULL GROUP BY n.region,n.role ORDER BY n.region,n.role"),
      pool.query("SELECT COUNT(*) AS targets FROM redirector_targets t JOIN deployment_nodes n ON n.id=t.node_id JOIN deployment_report_settings s ON s.id=1 WHERE t.enabled=TRUE AND n.enabled=TRUE AND n.deleted_at IS NULL AND n.status='healthy' AND n.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL s.stale_seconds SECOND)")]);
    return send(res,200,{regions:regions.rows,healthyWssTargets:Number(targets.rows[0]?.targets||0),
      scope:'Inventory and fresh health only; application replicas are controlled by the existing single-host Compose cluster.'});
  }
  if(path==='/api/admin/servers/report-settings'&&req.method==='PUT'){
    if(!granted('manage'))return send(res,403,{error:'Fleet management access required'});
    const b=await readJson(req);
    if(!Number.isInteger(b.staleSeconds)||b.staleSeconds<60||b.staleSeconds>3600||
      !Number.isInteger(b.warningLatencyMs)||b.warningLatencyMs<100||b.warningLatencyMs>30000||
      !Number.isInteger(b.retentionDays)||b.retentionDays<7||b.retentionDays>365)
      return send(res,400,{error:'Valid stale seconds, latency threshold, and retention days required'});
    await pool.query('UPDATE deployment_report_settings SET stale_seconds=$1,warning_latency_ms=$2,retention_days=$3,updated_by=$4 WHERE id=1',
      [b.staleSeconds,b.warningLatencyMs,b.retentionDays,user.id]);
    return send(res,200,{settings:b});
  }
  if(path==='/api/admin/servers/order'&&req.method==='PUT'){
    if(!granted('manage'))return send(res,403,{error:'Fleet management access required'});
    const {ids}=await readJson(req);
    if(!Array.isArray(ids)||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))return send(res,400,{error:'Unique server IDs required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      const live=await db.query('SELECT id FROM deployment_nodes WHERE deleted_at IS NULL FOR UPDATE');
      if(live.rowCount!==ids.length||live.rows.some(row=>!ids.includes(row.id))){await db.query('ROLLBACK');return send(res,409,{error:'Refresh server list before reordering'});}
      for(let i=0;i<ids.length;i++)await db.query('UPDATE deployment_nodes SET sort_order=$1 WHERE id=$2',[i+1,ids[i]]);
      await db.query("INSERT INTO deployment_events(id,category,detail) VALUES($1,'servers_reordered',$2)",[randomUUID(),`${ids.length} servers`]);
      await db.query('COMMIT');return send(res,200,{ordered:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  const dump=/^\/api\/admin\/servers\/([0-9a-f-]{36})\/dump$/.exec(path);
  if(dump&&uuid.test(dump[1])&&req.method==='GET'){
    const found=await pool.query('SELECT name,role,host,ssh_user,ssh_port,region,capacity,enabled,version,status FROM deployment_nodes WHERE id=$1 AND deleted_at IS NULL',[dump[1]]);
    return send(res,found.rowCount?200:404,found.rowCount?{format:'olamide-server-inventory-v1',server:found.rows[0],credentialsIncluded:false}:{error:'Server unavailable'});
  }
  const scheduleMatch=/^\/api\/admin\/servers\/schedules\/([0-9a-f-]{36})$/.exec(path);
  if(scheduleMatch&&uuid.test(scheduleMatch[1])&&req.method==='PUT'){
    if(!granted('deploy'))return send(res,403,{error:'Fleet deployment access required'});
    const b=await readJson(req);
    if(typeof b.enabled!=='boolean'||!Number.isInteger(b.intervalMinutes)||b.intervalMinutes<5||b.intervalMinutes>10080)
      return send(res,400,{error:'Valid enabled state and interval of 5 to 10080 minutes required'});
    const result=await pool.query('UPDATE deployment_schedules SET enabled=$1,interval_minutes=$2,next_run_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL $2 MINUTE) WHERE id=$3',
      [b.enabled,b.intervalMinutes,scheduleMatch[1]]);
    return send(res,result.rowCount?200:404,result.rowCount?{updated:true}:{error:'Schedule unavailable'});
  }
  if(scheduleMatch&&uuid.test(scheduleMatch[1])&&req.method==='DELETE'){
    if(!granted('deploy'))return send(res,403,{error:'Fleet deployment access required'});
    const result=await pool.query('DELETE FROM deployment_schedules WHERE id=$1',[scheduleMatch[1]]);
    return send(res,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Schedule unavailable'});
  }
  const match=/^\/api\/admin\/servers\/([0-9a-f-]{36})$/.exec(path);
  if(match&&uuid.test(match[1])&&req.method==='DELETE'){
    if(!granted('manage'))return send(res,403,{error:'Fleet management access required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      const node=await db.query('SELECT id FROM deployment_nodes WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[match[1]]);
      if(!node.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Server unavailable'});}
      const active=await db.query("SELECT id FROM deployment_jobs WHERE node_id=$1 AND (status='pending' OR (status='leased' AND lease_until>UTC_TIMESTAMP(3))) LIMIT 1",[match[1]]);
      if(active.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Wait for the active deployment job to finish'});}
      await db.query('UPDATE deployment_nodes SET deleted_at=UTC_TIMESTAMP(3),enabled=FALSE WHERE id=$1',[match[1]]);
      await db.query('UPDATE deployment_schedules SET enabled=FALSE WHERE node_id=$1',[match[1]]);
      await db.query("INSERT INTO deployment_events(id,node_id,category,detail) VALUES($1,$2,'server_retired','Removed from managed inventory')",[randomUUID(),match[1]]);
      await db.query('COMMIT');return send(res,200,{deleted:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(match&&uuid.test(match[1])&&req.method==='PUT'){
    if(!granted('manage'))return send(res,403,{error:'Fleet management access required'});
    const b=await readJson(req);
    if(typeof b.enabled!=='boolean'||!validNode({...b,name:'network-edit',role:'switch'}))
      return send(res,400,{error:'Valid IPv4, SSH user, port, enabled state, region and capacity required'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      const old=await db.query('SELECT host,ssh_user,ssh_port FROM deployment_nodes WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[match[1]]);
      if(!old.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Server unavailable'});}
      const active=await db.query("SELECT id FROM deployment_jobs WHERE node_id=$1 AND (status='pending' OR (status='leased' AND lease_until>UTC_TIMESTAMP(3))) LIMIT 1",[match[1]]);
      if(active.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Wait for the active deployment job to finish'});}
      await db.query('UPDATE deployment_nodes SET enabled=$1,region=$2,capacity=$3,host=$4,ssh_user=$5,ssh_port=$6 WHERE id=$7',
        [b.enabled,b.region,b.capacity,b.host,b.sshUser,b.sshPort,match[1]]);
      await db.query('INSERT INTO deployment_events(id,node_id,category,detail) VALUES($1,$2,$3,$4)',
        [randomUUID(),match[1],'inventory_changed',`Network endpoint ${old.rows[0].host}:${old.rows[0].ssh_port} → ${b.host}:${b.sshPort}`]);
      await db.query('COMMIT');return send(res,200,{updated:true});
    }catch(error){await db.query('ROLLBACK');if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Host already registered for this role'});throw error;}finally{db.release();}
  }
  const job=/^\/api\/admin\/servers\/([0-9a-f-]{36})\/jobs$/.exec(path);
  if(job&&uuid.test(job[1])&&req.method==='POST'){
    if(!granted('deploy'))return send(res,403,{error:'Fleet deployment access required'});
    const {action}=await readJson(req);
    if(!['health','kamailio_test','sip_packages','sip_core','sip_audit'].includes(action))return send(res,400,{error:'Approved SIP job action required'});
    if(action==='sip_core'&&user.role!=='super_admin')return send(res,403,{error:'Super administrator required for SIP activation'});
    if(!process.env.DEPLOY_RUNNER_TOKEN)return send(res,409,{error:'Private deployment runner is not configured'});
    const outcome=await queue(pool,job[1],action,user.id);
    return send(res,outcome.code,outcome.error?{error:outcome.error}:outcome);
  }
  const schedule=/^\/api\/admin\/servers\/([0-9a-f-]{36})\/schedules$/.exec(path);
  if(schedule&&uuid.test(schedule[1])&&req.method==='POST'){
    if(!granted('deploy'))return send(res,403,{error:'Fleet deployment access required'});
    const b=await readJson(req);
    if(b.action!=='health'||!Number.isInteger(b.intervalMinutes)||
      b.intervalMinutes<5||b.intervalMinutes>10080)
      return send(res,400,{error:'Health schedule with valid interval required'});
    if(!process.env.DEPLOY_RUNNER_TOKEN)return send(res,409,{error:'Private deployment runner is not configured'});
    const node=await pool.query("SELECT role,enabled FROM deployment_nodes WHERE id=$1 AND deleted_at IS NULL",[schedule[1]]);
    if(!node.rowCount||node.rows[0].role!=='switch'||!node.rows[0].enabled)
      return send(res,404,{error:'Enabled switch server unavailable'});
    const id=randomUUID();
    await pool.query("INSERT INTO deployment_schedules(id,node_id,action,interval_minutes,next_run_at,created_by) VALUES($1,$2,$3,$4,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL $4 MINUTE),$5)",
      [id,schedule[1],b.action,b.intervalMinutes,user.id]);
    return send(res,201,{id});
  }
  return send(res,404,{error:'Server route unavailable'});
}
export async function handleServerFleetRunner({req,res,path,pool,send,readJson}){
  if(!runnerAuthorized(req.headers.authorization,process.env.DEPLOY_RUNNER_TOKEN))
    return send(res,401,{error:'Runner authentication required'});
  if(path==='/api/integrations/deployment/nodes'&&req.method==='GET'){
    const rows=await pool.query('SELECT id,name,role,host,ssh_user,ssh_port,enabled FROM deployment_nodes WHERE enabled=TRUE AND deleted_at IS NULL AND role=\'switch\' ORDER BY name LIMIT 500');
    return send(res,200,{nodes:rows.rows});
  }
  if(path==='/api/integrations/deployment/claim'&&req.method==='POST'){
    const {runnerId}=await readJson(req);
    if(!label.test(runnerId||''))return send(res,400,{error:'Valid runner ID required'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      await db.query("UPDATE deployment_jobs SET status='failed',summary='Runner lease expired after maximum retries',finished_at=UTC_TIMESTAMP(3) WHERE status='leased' AND lease_until<UTC_TIMESTAMP(3) AND attempts>=3");
      await db.query('DELETE FROM deployment_checks WHERE created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL (SELECT retention_days FROM deployment_report_settings WHERE id=1) DAY) LIMIT 200');
      await db.query('DELETE FROM deployment_events WHERE created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL (SELECT retention_days FROM deployment_report_settings WHERE id=1) DAY) LIMIT 200');
      const due=await db.query("SELECT s.id,s.node_id,s.action,s.interval_minutes,s.created_by FROM deployment_schedules s JOIN deployment_nodes n ON n.id=s.node_id WHERE s.enabled=TRUE AND s.next_run_at<=UTC_TIMESTAMP(3) AND n.enabled=TRUE AND n.deleted_at IS NULL AND n.role='switch' ORDER BY s.next_run_at LIMIT 20 FOR UPDATE SKIP LOCKED");
      for(const schedule of due.rows){
        const active=await db.query("SELECT id FROM deployment_jobs WHERE node_id=$1 AND (status='pending' OR (status='leased' AND lease_until>UTC_TIMESTAMP(3))) LIMIT 1",[schedule.node_id]);
        if(!active.rowCount){
          const id=randomUUID();
          await db.query('INSERT INTO deployment_jobs(id,node_id,action,requested_by) VALUES($1,$2,$3,$4)',[id,schedule.node_id,schedule.action,schedule.created_by]);
          await db.query("INSERT INTO deployment_events(id,node_id,job_id,category,detail) VALUES($1,$2,$3,'schedule_queued',$4)",[randomUUID(),schedule.node_id,id,schedule.action]);
        }
        await db.query('UPDATE deployment_schedules SET next_run_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL interval_minutes MINUTE) WHERE id=$1',[schedule.id]);
      }
      const found=await db.query("SELECT j.id,j.node_id,j.action,j.attempts,n.name,n.host,n.ssh_user,n.ssh_port,n.region,n.capacity FROM deployment_jobs j JOIN deployment_nodes n ON n.id=j.node_id WHERE n.enabled=TRUE AND n.deleted_at IS NULL AND n.role='switch' AND j.attempts<3 AND (j.status='pending' OR (j.status='leased' AND j.lease_until<UTC_TIMESTAMP(3))) ORDER BY j.created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
      const job=found.rows[0];
      if(!job){await db.query('COMMIT');return send(res,200,{job:null});}
      await db.query("UPDATE deployment_jobs SET status='leased',runner_id=$1,attempts=attempts+1,started_at=UTC_TIMESTAMP(3),lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 20 MINUTE) WHERE id=$2",[runnerId,job.id]);
      if(job.action==='firewall'){
        const policy=await db.query('SELECT enabled,ssh_cidrs,carrier_cidrs,revision FROM fleet_firewall_policies WHERE node_id=$1',[job.node_id]);
        job.firewallPolicy=policy.rows[0]||null;
      }
      await db.query('COMMIT');return send(res,200,{job});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  if(path==='/api/integrations/deployment/lease'&&req.method==='POST'){
    const b=await readJson(req);
    if(!uuid.test(b.jobId||'')||!label.test(b.runnerId||''))return send(res,400,{error:'Valid lease identity required'});
    const updated=await pool.query("UPDATE deployment_jobs SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 20 MINUTE) WHERE id=$1 AND runner_id=$2 AND status='leased' AND lease_until>UTC_TIMESTAMP(3)",
      [b.jobId,b.runnerId]);
    return send(res,updated.rowCount?200:409,updated.rowCount?{leased:true}:{error:'Job lease unavailable'});
  }
  if(path==='/api/integrations/deployment/result'&&req.method==='POST'){
    const b=await readJson(req);
    if(!uuid.test(b.jobId||'')||!label.test(b.runnerId||'')||!['succeeded','failed'].includes(b.status)||
      typeof b.summary!=='string'||b.summary.length>1000)return send(res,400,{error:'Valid job result required'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      const found=await db.query("SELECT node_id,action FROM deployment_jobs WHERE id=$1 AND runner_id=$2 AND status='leased' AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE",[b.jobId,b.runnerId]);
      if(!found.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Job lease unavailable'});}
      await db.query("UPDATE deployment_jobs SET status=$1,summary=$2,finished_at=UTC_TIMESTAMP(3),lease_until=NULL WHERE id=$3",[b.status,b.summary,b.jobId]);
      if(found.rows[0].action!=='kamailio_test')
        await db.query("UPDATE deployment_nodes SET status=$1,last_error=$2 WHERE id=$3",
          [b.status==='succeeded'?'ready':'error',b.status==='failed'?b.summary:null,found.rows[0].node_id]);
      await db.query('INSERT INTO deployment_events(id,node_id,job_id,category,detail) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(),found.rows[0].node_id,b.jobId,'job_'+b.status,b.summary.slice(0,500)]);
      await db.query('COMMIT');return send(res,200,{accepted:true});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  if(path==='/api/integrations/deployment/kamailio-check'&&req.method==='POST'){
    const b=await readJson(req);
    if(!uuid.test(b.nodeId||'')||
      !['active','inactive','unreachable'].includes(b.signalingStatus)||
      !['active','inactive','unreachable'].includes(b.mediaStatus)||
      (b.version!=null&&(typeof b.version!=='string'||b.version.length>80))||
      (b.latencyMs!=null&&(!Number.isInteger(b.latencyMs)||b.latencyMs<0||b.latencyMs>300000)))
      return send(res,400,{error:'Valid Kamailio service report required'});
    const found=await pool.query("SELECT id FROM deployment_nodes WHERE id=$1 AND enabled=TRUE AND deleted_at IS NULL AND role='switch'",[b.nodeId]);
    if(!found.rowCount)return send(res,404,{error:'Switch node unavailable'});
    await pool.query('INSERT INTO kamailio_node_checks(id,node_id,signaling_status,media_status,version,latency_ms) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(),b.nodeId,b.signalingStatus,b.mediaStatus,b.version||null,b.latencyMs??null]);
    return send(res,200,{accepted:true});
  }
  if(path==='/api/integrations/deployment/check'&&req.method==='POST'){
    const b=await readJson(req);
    if(!uuid.test(b.nodeId||'')||!['healthy','unreachable','degraded'].includes(b.status)||
      (b.version!=null&&(typeof b.version!=='string'||b.version.length>80))||
      (b.latencyMs!=null&&(!Number.isInteger(b.latencyMs)||b.latencyMs<0||b.latencyMs>300000)))
      return send(res,400,{error:'Valid server check required'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      const previous=await db.query('SELECT status FROM deployment_nodes WHERE id=$1 AND enabled=TRUE FOR UPDATE',[b.nodeId]);
      if(!previous.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Server unavailable'});}
      const updated=await db.query("UPDATE deployment_nodes SET status=$1,version=$2,last_seen_at=UTC_TIMESTAMP(3),last_error=$3 WHERE id=$4 AND enabled=TRUE",
        [b.status,b.version||null,b.status==='healthy'?null:'Health probe '+b.status,b.nodeId]);
      if(!updated.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Server unavailable'});}
      await db.query('INSERT INTO deployment_checks(id,node_id,status,version,latency_ms) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(),b.nodeId,b.status,b.version||null,b.latencyMs||null]);
      if(previous.rows[0].status!==b.status)await db.query('INSERT INTO deployment_events(id,node_id,category,detail) VALUES($1,$2,$3,$4)',
        [randomUUID(),b.nodeId,'health_changed',`${previous.rows[0].status} → ${b.status}`]);
      await db.query('COMMIT');return send(res,200,{accepted:true});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  return send(res,404,{error:'Runner route unavailable'});
}
