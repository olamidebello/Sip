import fs from 'node:fs/promises';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {isAdmin} from './tenancy.js';
export const catalog=JSON.parse(await fs.readFile(new URL('./kamailio-catalog.json',import.meta.url),'utf8'));
const ids=new Set(catalog.modules.map(m=>m.id));
const states=new Set(['pending','configured','connected','tested']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validPlan(b){
  return uuid.test(b?.nodeId||'') && /^[a-z][a-z0-9_-]{0,63}$/.test(b.profile||'') &&
    Array.isArray(b.modules)&&b.modules.length>0&&b.modules.length<=ids.size&&
    new Set(b.modules.map(m=>m.id)).size===b.modules.length&&
    b.modules.every(m=>ids.has(m.id)&&typeof m.install==='boolean'&&typeof m.enable==='boolean'&&(!m.enable||m.install));
}
export function validateReport(b,now=Date.now()){
  const at=Date.parse(b?.checkedAt);
  if(b?.schemaVersion!==1||!uuid.test(b.nodeId||'')||!/^[-a-zA-Z0-9_.]{1,253}$/.test(b.host||'')||
    !/^[a-f0-9]{64}$/.test(b.configHash||'')||!Number.isFinite(at)||at>now+60000||now-at>86400000)
    throw new RangeError('Invalid or expired server evidence');
  if(!Array.isArray(b.features)||b.features.length!==ids.size||new Set(b.features.map(f=>f.id)).size!==ids.size)
    throw new RangeError('Full catalog evidence required');
  for(const f of b.features){
    if(!ids.has(f.id)||!states.has(f.status)||typeof f.installed!=='boolean'||typeof f.runtimeLoaded!=='boolean')
      throw new RangeError('Invalid module evidence');
    if(f.status!=='pending'&&(!b.configValid||!b.serviceActive||!b.rpcReachable||!f.runtimeLoaded||!f.installed))
      throw new RangeError('Configured requires live validated module');
    if(['connected','tested'].includes(f.status)&&(!f.testId||typeof f.testId!=='string'||f.testId.length>100))
      throw new RangeError('Connection evidence requires test identifier');
  }
  return {schemaVersion:1,nodeId:b.nodeId,host:b.host,checkedAt:new Date(at).toISOString(),configHash:b.configHash,
    configValid:b.configValid===true,serviceActive:b.serviceActive===true,rpcReachable:b.rpcReachable===true,
    features:b.features.map(f=>({id:f.id,installed:f.installed,runtimeLoaded:f.runtimeLoaded,status:f.status,testId:String(f.testId||'').slice(0,100)})),
    codeFindings:Array.isArray(b.codeFindings)?b.codeFindings.slice(0,500).map(f=>({path:String(f.path).slice(0,250),line:Number(f.line)||0})):[]};
}
function runnerAuthorized(req){
  const key=process.env.KAMAILIO_RUNNER_TOKEN||'',actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+key);
  return key.length>=32&&actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function migrateKamailio(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS kamailio_plans (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,node_id CHAR(36) NOT NULL,
    profile VARCHAR(64) NOT NULL,modules JSON NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'queued',
    summary VARCHAR(500) NOT NULL DEFAULT '',created_by CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX pending(status,created_at),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),FOREIGN KEY(created_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kamailio_audits (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,node_id CHAR(36) NOT NULL,report JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX tenant_history(tenant_id,created_at),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(node_id) REFERENCES deployment_nodes(id)
  ) ENGINE=InnoDB`);
}
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function handleKamailioAdmin({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  if(path==='/api/admin/kamailio'&&req.method==='GET'){
    const [nodes,plans,audits]=await Promise.all([
      user.role==='super_admin'?pool.query('SELECT id,name,host FROM deployment_nodes WHERE role=\'switch\' AND deleted_at IS NULL ORDER BY name'):Promise.resolve({rows:[]}),
      pool.query('SELECT id,node_id,profile,modules,status,summary,created_at FROM kamailio_plans WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',[user.tenant_id]),
      pool.query('SELECT id,node_id,report,created_at FROM kamailio_audits WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',[user.tenant_id])]);
    return send(res,200,{catalog,nodes:nodes.rows,plans:plans.rows.map(p=>({...p,modules:parse(p.modules)})),audits:audits.rows.map(a=>({...a,report:parse(a.report)}))});
  }
  if(path==='/api/admin/kamailio/plans'&&req.method==='POST'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const b=await readJson(req,131072);
    if(!validPlan(b))return send(res,400,{error:'Valid node, reviewed profile and unique module choices required'});
    const node=await pool.query("SELECT id FROM deployment_nodes WHERE id=$1 AND role='switch' AND enabled=TRUE AND deleted_at IS NULL",[b.nodeId]);
    if(!node.rowCount)return send(res,404,{error:'Enabled switch node required'});
    const id=randomUUID();
    await pool.query('INSERT INTO kamailio_plans(id,tenant_id,node_id,profile,modules,created_by) VALUES($1,$2,$3,$4,$5,$6)',
      [id,user.tenant_id,b.nodeId,b.profile,JSON.stringify(b.modules.map(m=>({id:m.id,install:m.install,enable:m.enable}))),user.id]);
    return send(res,201,{id,status:'queued',message:'Requested state saved. The trusted controller validates the profile before applying.'});
  }
  return send(res,404,{error:'Unknown Kamailio operation'});
}
export async function handleKamailioRunner({req,res,path,pool,send,readJson}){
  if(!runnerAuthorized(req))return send(res,401,{error:'Runner authorization required'});
  if(path==='/api/integrations/kamailio/plans'&&req.method==='GET'){
    const p=await pool.query("SELECT p.id,p.tenant_id,p.node_id,p.profile,p.modules,n.host,n.ssh_user,n.ssh_port FROM kamailio_plans p JOIN deployment_nodes n ON n.id=p.node_id AND n.enabled=TRUE AND n.deleted_at IS NULL WHERE p.status='queued' ORDER BY p.created_at LIMIT 20");
    return send(res,200,{plans:p.rows.map(r=>({...r,modules:parse(r.modules)}))});
  }
  if(path==='/api/integrations/kamailio/claim'&&req.method==='POST'){
    const b=await readJson(req);
    if(!uuid.test(b.id||''))return send(res,400,{error:'Valid plan ID required'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      const selected=await db.query("SELECT p.node_id FROM kamailio_plans p JOIN deployment_nodes n ON n.id=p.node_id WHERE p.id=$1 AND p.status='queued' AND n.enabled=TRUE AND n.deleted_at IS NULL FOR UPDATE",[b.id]);
      if(!selected.rowCount){await db.query('ROLLBACK');return send(res,200,{claimed:false});}
      const nodeId=selected.rows[0].node_id;
      await db.query('SELECT id FROM deployment_nodes WHERE id=$1 FOR UPDATE',[nodeId]);
      const busy=await db.query("SELECT id FROM kamailio_plans WHERE node_id=$1 AND status='running' LIMIT 1",[nodeId]);
      const fleet=await db.query("SELECT id FROM deployment_jobs WHERE node_id=$1 AND (status='pending' OR (status='leased' AND lease_until>UTC_TIMESTAMP(3))) LIMIT 1",[nodeId]);
      if(busy.rowCount||fleet.rowCount){await db.query('ROLLBACK');return send(res,200,{claimed:false});}
      await db.query("UPDATE kamailio_plans SET status='running',summary='Claimed by private controller' WHERE id=$1 AND status='queued'",[b.id]);
      await db.query('COMMIT');return send(res,200,{claimed:true});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  if(path==='/api/integrations/kamailio/result'&&req.method==='POST'){
    const b=await readJson(req,131072);
    if(!uuid.test(b.id||'')||!['succeeded','failed'].includes(b.status))return send(res,400,{error:'Valid result required'});
    const plan=await pool.query("SELECT tenant_id,node_id FROM kamailio_plans WHERE id=$1 AND status='running'",[b.id]);
    if(!plan.rowCount)return send(res,409,{error:'Plan is not running'});
    if(b.report){let report;try{report=validateReport(b.report);}catch(e){return send(res,400,{error:e.message});}
      if(report.nodeId!==plan.rows[0].node_id)return send(res,400,{error:'Report node differs from plan'});
      await pool.query('INSERT INTO kamailio_audits(id,tenant_id,node_id,report) VALUES($1,$2,$3,$4)',[randomUUID(),plan.rows[0].tenant_id,report.nodeId,JSON.stringify(report)]);
    }
    await pool.query("UPDATE kamailio_plans SET status=$1,summary=$2 WHERE id=$3 AND status='running'",[b.status,String(b.summary||'').slice(0,500),b.id]);
    return send(res,200,{status:b.status});
  }
  return send(res,404,{error:'Unknown runner operation'});
}
