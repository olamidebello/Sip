import {fleetLevel} from './fleetNetwork.js';
const all=new Set(['dashboard','planner','campaign-inbox-panel','support','account','calling-workspace','help','chat','external-sms','meetings','billing','agent-panel','admin','report-admin','fleet-admin','cluster-admin','tenant-admin','background-user','locale-settings']);
export async function migrateWorkspaceShortcuts(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS workspace_shortcuts (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,targets JSON NOT NULL,
    last_target VARCHAR(40) NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
}
async function available(pool,user){
  const allowed=new Set(['dashboard','planner','campaign-inbox-panel','support','account','calling-workspace','help','background-user','locale-settings']);
  for(const [feature,targets] of [['messaging',['chat','external-sms']],['meetings',['meetings']],['billing',['billing']],['call_center',['agent-panel']]])
    if(user.features?.[feature])targets.forEach(t=>allowed.add(t));
  if(['admin','super_admin'].includes(user.role))['admin','report-admin','cluster-admin'].forEach(t=>allowed.add(t));
  if(user.role==='super_admin')allowed.add('tenant-admin');
  if((await fleetLevel(pool,user))!=='none')allowed.add('fleet-admin');
  return allowed;
}
export async function handleWorkspaceShortcuts({req,res,path,user,pool,send,readJson}){
  const allowed=await available(pool,user);
  if(path==='/api/workspace/shortcuts'&&req.method==='GET'){
    const result=await pool.query('SELECT targets,last_target FROM workspace_shortcuts WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);
    const row=result.rows[0],targets=typeof row?.targets==='string'?JSON.parse(row.targets):row?.targets||[];
    return send(res,200,{targets:targets.filter(t=>allowed.has(t)),lastTarget:allowed.has(row?.last_target)?row.last_target:null});
  }
  if(path==='/api/workspace/shortcuts'&&req.method==='PUT'){
    const {targets}=await readJson(req);
    if(!Array.isArray(targets)||targets.length>8||new Set(targets).size!==targets.length||targets.some(t=>typeof t!=='string'||!all.has(t)||!allowed.has(t)))
      return send(res,400,{error:'Choose up to eight accessible workspace links'});
    await pool.query('INSERT INTO workspace_shortcuts(user_id,tenant_id,targets) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE targets=VALUES(targets)',
      [user.id,user.tenant_id,JSON.stringify(targets)]);
    return send(res,200,{targets});
  }
  if(path==='/api/workspace/shortcuts/last'&&req.method==='PUT'){
    const {target}=await readJson(req);
    if(typeof target!=='string'||!allowed.has(target))return send(res,400,{error:'Accessible workspace target required'});
    await pool.query("INSERT INTO workspace_shortcuts(user_id,tenant_id,targets,last_target) VALUES($1,$2,'[]',$3) ON DUPLICATE KEY UPDATE last_target=$3",
      [user.id,user.tenant_id,target]);
    return send(res,200,{lastTarget:target});
  }
  return send(res,404,{error:'Workspace route unavailable'});
}
