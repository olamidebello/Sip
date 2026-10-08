import {randomUUID,createHash} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const region=/^[a-zA-Z0-9 ._-]{1,40}$/;
export function validRedirector(b){
  if(!b||typeof b.name!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(b.name)||
    !region.test(b.region||'')||typeof b.enabled!=='boolean'||!Number.isInteger(b.weight)||b.weight<1||b.weight>100||
    !uuid.test(b.nodeId||''))return false;
  try{const url=new URL(b.wssUrl);return url.protocol==='wss:'&&url.username===''&&url.password===''&&url.search===''&&url.hash===''&&
    /^[a-z0-9.-]+$/i.test(url.hostname)&&url.hostname.includes('.')&&url.pathname==='/'&&b.wssUrl.length<=255;}
  catch{return false;}
}
export async function migrateOperationsPolicy(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS registration_policy (
    id TINYINT PRIMARY KEY,open_signup BOOLEAN NOT NULL DEFAULT TRUE,allowed_domains JSON NOT NULL,
    updated_by CHAR(36) NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query("INSERT IGNORE INTO registration_policy(id,open_signup,allowed_domains) VALUES(1,TRUE,'[]')");
  await pool.query(`CREATE TABLE IF NOT EXISTS redirector_targets (
    id CHAR(36) PRIMARY KEY,name VARCHAR(40) NOT NULL UNIQUE,region VARCHAR(40) NOT NULL,
    node_id CHAR(36) NOT NULL,wss_url VARCHAR(255) NOT NULL,weight SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,updated_by CHAR(36) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS operations_audit (
    id CHAR(36) PRIMARY KEY,actor_id CHAR(36) NOT NULL,action VARCHAR(40) NOT NULL,
    detail VARCHAR(250) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(actor_id) REFERENCES users(id),INDEX operations_audit_time(created_at)
  ) ENGINE=InnoDB`);
}
export async function registrationAllowed(pool,email){
  const policy=(await pool.query('SELECT open_signup,allowed_domains FROM registration_policy WHERE id=1')).rows[0];
  if(!policy?.open_signup)return false;
  const domains=typeof policy.allowed_domains==='string'?JSON.parse(policy.allowed_domains):policy.allowed_domains;
  return !domains?.length||domains.includes(String(email).split('@')[1]?.toLowerCase());
}
export async function handleOperationsPolicy({req,res,path,user,pool,send,readJson}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(path==='/api/admin/operations'&&req.method==='GET'){
    const [policy,targets,audit]=await Promise.all([
      pool.query('SELECT open_signup,allowed_domains,updated_at FROM registration_policy WHERE id=1'),
      pool.query('SELECT t.id,t.name,t.region,t.node_id,t.wss_url,t.weight,t.enabled,t.updated_at,n.status AS node_status FROM redirector_targets t JOIN deployment_nodes n ON n.id=t.node_id ORDER BY t.region,t.name LIMIT 200'),
      pool.query('SELECT action,detail,created_at FROM operations_audit ORDER BY created_at DESC LIMIT 100')]);
    return send(res,200,{registration:policy.rows[0],targets:targets.rows,audit:audit.rows,
      scope:'HTTPS WSS discovery selects healthy registered switch targets; it does not implement SIP 3xx signaling or call routing.'});
  }
  if(path==='/api/admin/operations/registration'&&req.method==='PUT'){
    const b=await readJson(req);
    if(typeof b.openSignup!=='boolean'||!Array.isArray(b.allowedDomains)||b.allowedDomains.length>50||
      new Set(b.allowedDomains).size!==b.allowedDomains.length||
      b.allowedDomains.some(d=>typeof d!=='string'||!/^([a-z0-9-]+\.)+[a-z]{2,63}$/.test(d)||d.length>253))
      return send(res,400,{error:'Valid registration policy and lowercase email domains required'});
    const db=await pool.connect();try{await db.query('START TRANSACTION');
      await db.query('UPDATE registration_policy SET open_signup=$1,allowed_domains=$2,updated_by=$3 WHERE id=1',[b.openSignup,JSON.stringify(b.allowedDomains),user.id]);
      await db.query('INSERT INTO operations_audit(id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,'registration_policy',`Open signup ${b.openSignup}; ${b.allowedDomains.length} domains`]);
      await db.query('COMMIT');return send(res,200,{saved:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(path==='/api/admin/operations/redirector'&&req.method==='POST'){
    const b=await readJson(req);
    if(!validRedirector(b))return send(res,400,{error:'Valid WSS target, healthy switch link, region and weight required'});
    const node=await pool.query("SELECT id FROM deployment_nodes WHERE id=$1 AND role='switch' AND enabled=TRUE AND deleted_at IS NULL",[b.nodeId]);
    if(!node.rowCount)return send(res,404,{error:'Linked switch unavailable'});
    const id=randomUUID();try{await pool.query('INSERT INTO redirector_targets(id,name,region,node_id,wss_url,weight,enabled,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [id,b.name,b.region,b.nodeId,b.wssUrl,b.weight,b.enabled,user.id]);}
    catch(e){if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Target name exists'});throw e;}
    await pool.query('INSERT INTO operations_audit(id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,'redirector_added',b.name]);
    return send(res,201,{id});
  }
  const match=/^\/api\/admin\/operations\/redirector\/([0-9a-f-]{36})$/.exec(path);
  if(match&&uuid.test(match[1])&&req.method==='PUT'){
    const b=await readJson(req);if(!validRedirector(b))return send(res,400,{error:'Valid redirector target required'});
    const node=await pool.query("SELECT id FROM deployment_nodes WHERE id=$1 AND role='switch' AND enabled=TRUE AND deleted_at IS NULL",[b.nodeId]);
    if(!node.rowCount)return send(res,404,{error:'Linked switch unavailable'});
    try{const updated=await pool.query('UPDATE redirector_targets SET name=$1,region=$2,node_id=$3,wss_url=$4,weight=$5,enabled=$6,updated_by=$7 WHERE id=$8',
      [b.name,b.region,b.nodeId,b.wssUrl,b.weight,b.enabled,user.id,match[1]]);
      if(updated.rowCount)await pool.query('INSERT INTO operations_audit(id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,'redirector_updated',b.name]);
      return send(res,updated.rowCount?200:404,updated.rowCount?{saved:true}:{error:'Target unavailable'});
    }catch(e){if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Target name exists'});throw e;}
  }
  if(match&&uuid.test(match[1])&&req.method==='DELETE'){
    const removed=await pool.query('DELETE FROM redirector_targets WHERE id=$1',[match[1]]);
    if(removed.rowCount)await pool.query('INSERT INTO operations_audit(id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,'redirector_deleted',match[1]]);
    return send(res,removed.rowCount?200:404,removed.rowCount?{deleted:true}:{error:'Target unavailable'});
  }
  return send(res,404,{error:'Operations route unavailable'});
}
export async function resolveWss(pool,userId,region){
  const results=await pool.query("SELECT t.name,t.region,t.wss_url,t.weight FROM redirector_targets t JOIN deployment_nodes n ON n.id=t.node_id JOIN deployment_report_settings s ON s.id=1 WHERE t.enabled=TRUE AND n.enabled=TRUE AND n.deleted_at IS NULL AND n.status='healthy' AND n.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL s.stale_seconds SECOND) AND (t.region=$1 OR t.region='global') ORDER BY t.name LIMIT 100",[region]);
  const rows=results.rows, total=rows.reduce((sum,row)=>sum+Number(row.weight),0);
  if(!total)return null;
  let index=createHash('sha256').update(userId+':'+region).digest().readUInt32BE(0)%total;
  for(const row of rows){index-=Number(row.weight);if(index<0)return {name:row.name,region:row.region,wssUrl:row.wss_url};}
  return null;
}
