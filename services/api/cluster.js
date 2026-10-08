import {randomUUID} from 'node:crypto';
export async function migrateCluster(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS cluster_state (
    id TINYINT PRIMARY KEY,desired_api_replicas TINYINT UNSIGNED NOT NULL DEFAULT 1,
    observed_api_replicas TINYINT UNSIGNED NULL,revision INT UNSIGNED NOT NULL DEFAULT 0,
    updated_by CHAR(36) NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    last_applied_at DATETIME(3) NULL,last_error VARCHAR(300) NULL,
    FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  await pool.query('INSERT IGNORE INTO cluster_state(id,desired_api_replicas,revision) VALUES(1,1,0)');
  await pool.query(`CREATE TABLE IF NOT EXISTS cluster_actions (
    id CHAR(36) PRIMARY KEY,revision INT UNSIGNED NOT NULL,replicas TINYINT UNSIGNED NOT NULL,
    actor_id CHAR(36) NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),applied_at DATETIME(3) NULL,
    FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,INDEX cluster_actions_latest(created_at)
  ) ENGINE=InnoDB`);
}
export async function handleCluster({req,res,path,user,pool,send,readJson}){
  if(!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Administrator required'});
  if(path==='/api/admin/cluster'&&req.method==='GET'){
    const [state,actions]=await Promise.all([
      pool.query('SELECT desired_api_replicas,observed_api_replicas,revision,updated_at,last_applied_at,last_error FROM cluster_state WHERE id=1'),
      pool.query('SELECT a.id,a.revision,a.replicas,a.status,a.created_at,a.applied_at,u.display_name AS actor FROM cluster_actions a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 40')]);
    return send(res,200,{state:state.rows[0],actions:actions.rows,editable:user.role==='super_admin',
      scope:'Single Docker Compose host, API replicas only. MySQL, Caddy, media, TURN and SIP switch are not clustered.'});
  }
  if(path==='/api/admin/cluster/scale'&&req.method==='POST'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const {apiReplicas}=await readJson(req);
    if(!Number.isSafeInteger(apiReplicas)||apiReplicas<1||apiReplicas>4)return send(res,400,{error:'Choose 1 to 4 API replicas'});
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      const current=(await db.query('SELECT desired_api_replicas,revision FROM cluster_state WHERE id=1 FOR UPDATE')).rows[0];
      if(current.desired_api_replicas===apiReplicas){await db.query('COMMIT');return send(res,200,{revision:current.revision,unchanged:true});}
      const revision=current.revision+1,id=randomUUID();
      await db.query('UPDATE cluster_state SET desired_api_replicas=$1,revision=$2,updated_by=$3,last_error=NULL WHERE id=1',[apiReplicas,revision,user.id]);
      await db.query("UPDATE cluster_actions SET status='superseded' WHERE status='pending'");
      await db.query("INSERT INTO cluster_actions(id,revision,replicas,actor_id,status) VALUES($1,$2,$3,$4,'pending')",[id,revision,apiReplicas,user.id]);
      await db.query('COMMIT');return send(res,202,{id,revision,desiredApiReplicas:apiReplicas,status:'pending'});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  return send(res,404,{error:'Cluster route unavailable'});
}
