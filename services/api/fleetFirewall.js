import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validCidr(value){
  if(typeof value!=='string')return false;
  const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/.exec(value);
  return !!m&&m.slice(1,5).every(x=>Number(x)<=255)&&Number(m[5])>=8;
}
export function validFirewall(body){
  return !!body&&typeof body.enabled==='boolean'&&['sshCidrs','carrierCidrs'].every(key=>
    Array.isArray(body[key])&&body[key].length<=32&&new Set(body[key]).size===body[key].length&&body[key].every(validCidr))&&
    (!body.enabled||body.sshCidrs.length>0);
}
export async function migrateFleetFirewall(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS fleet_firewall_policies (
    node_id CHAR(36) PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ssh_cidrs JSON NOT NULL,carrier_cidrs JSON NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 1,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}
export async function handleFleetFirewall({req,res,path,user,pool,send,readJson,level,queue}){
  const rank={none:0,view:1,manage:2,deploy:3};
  if(rank[level]<1)return send(res,403,{error:'Fleet access required'});
  if(path==='/api/admin/servers/firewall'&&req.method==='GET'){
    const rows=await pool.query('SELECT p.node_id,p.enabled,p.ssh_cidrs,p.carrier_cidrs,p.revision,p.updated_at FROM fleet_firewall_policies p JOIN deployment_nodes n ON n.id=p.node_id WHERE n.deleted_at IS NULL ORDER BY n.name');
    return send(res,200,{policies:rows.rows,scope:'Dedicated Linux switch nftables only; applying a policy is a separate reviewed job.'});
  }
  const match=/^\/api\/admin\/servers\/([0-9a-f-]{36})\/firewall$/.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Firewall route unavailable'});
  const nodeId=match[1];
  if(req.method==='PUT'){
    if(rank[level]<2)return send(res,403,{error:'Fleet management access required'});
    const body=await readJson(req);
    if(!validFirewall(body))return send(res,400,{error:'Valid SSH and carrier IPv4 CIDR allowlists required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      const node=await db.query("SELECT id,role FROM deployment_nodes WHERE id=$1 AND enabled=TRUE AND deleted_at IS NULL FOR UPDATE",[nodeId]);
      if(!node.rowCount||node.rows[0].role!=='switch'){await db.query('ROLLBACK');return send(res,404,{error:'Active switch unavailable'});}
      await db.query('INSERT INTO fleet_firewall_policies(node_id,enabled,ssh_cidrs,carrier_cidrs,updated_by) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE enabled=$2,ssh_cidrs=$3,carrier_cidrs=$4,revision=revision+1,updated_by=$5',
        [nodeId,body.enabled,JSON.stringify(body.sshCidrs),JSON.stringify(body.carrierCidrs),user.id]);
      await db.query("INSERT INTO deployment_events(id,node_id,category,detail) VALUES($1,$2,'firewall_policy_saved',$3)",[randomUUID(),nodeId,`${body.sshCidrs.length} SSH and ${body.carrierCidrs.length} carrier networks`]);
      await db.query('COMMIT');return send(res,200,{saved:true,applied:false});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(req.method==='POST'){
    if(rank[level]<3)return send(res,403,{error:'Fleet deployment access required'});
    if(!process.env.DEPLOY_RUNNER_TOKEN)return send(res,409,{error:'Private deployment runner is not configured'});
    const policy=await pool.query('SELECT enabled,ssh_cidrs FROM fleet_firewall_policies WHERE node_id=$1',[nodeId]);
    if(!policy.rowCount||!policy.rows[0].enabled)return send(res,409,{error:'Enable and review a policy before applying'});
    const outcome=await queue(pool,nodeId,'firewall',user.id);
    return send(res,outcome.code,outcome.error?{error:outcome.error}:outcome);
  }
  return send(res,404,{error:'Firewall route unavailable'});
}
