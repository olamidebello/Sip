// Invoked by the local root-only systemd service; never exposed through HTTP.
import {createDatabase} from './db.js';
const pool=createDatabase(process.env.MYSQL_URL);
try{
  const action=process.argv[2];
  if(action==='pending'){
    const row=(await pool.query('SELECT desired_api_replicas,revision,observed_api_replicas FROM cluster_state WHERE id=1')).rows[0];
    if(row&&row.observed_api_replicas!==row.desired_api_replicas){
      if(!Number.isSafeInteger(row.desired_api_replicas)||row.desired_api_replicas<1||row.desired_api_replicas>4)throw new Error('Invalid capacity');
      process.stdout.write(`${row.revision} ${row.desired_api_replicas}\n`);
    }
  }else if(action==='applied'||action==='failed'){
    const revision=Number(process.argv[3]),count=Number(process.argv[4]);
    if(!Number.isSafeInteger(revision)||revision<0||!Number.isSafeInteger(count)||count<1||count>4)throw new Error('Invalid report');
    if(action==='applied'){
      await pool.query('UPDATE cluster_state SET observed_api_replicas=$1,last_applied_at=UTC_TIMESTAMP(3),last_error=NULL WHERE id=1 AND revision=$2',[count,revision]);
      await pool.query("UPDATE cluster_actions SET status='applied',applied_at=UTC_TIMESTAMP(3) WHERE revision=$1 AND status='pending'",[revision]);
    }else{
      await pool.query("UPDATE cluster_state SET last_error='Local Docker Compose scaling failed; inspect journalctl -u olamide-cluster.service' WHERE id=1 AND revision=$1",[revision]);
      await pool.query("UPDATE cluster_actions SET status='failed' WHERE revision=$1 AND status='pending'",[revision]);
    }
  }else throw new Error('Unknown action');
}finally{await pool.end();}
