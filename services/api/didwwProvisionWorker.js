// Private host-worker bridge. Never expose this CLI through an HTTP endpoint.
import {createDatabase} from './db.js';
import {masterKey,unseal,providerCredentials} from './providerCredentials.js';
const pool=createDatabase(process.env.MYSQL_URL);
try{
 const command=process.argv[2];
 if(command==='claim'){
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   await db.query("UPDATE didww_provision_jobs SET status='failed',message='Worker interrupted or timed out; inspect private server log before retrying',finished_at=UTC_TIMESTAMP(3) WHERE status='running' AND started_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)");
   await db.query("UPDATE didww_provision_jobs j LEFT JOIN users u ON u.id=j.actor_id AND u.tenant_id=j.tenant_id LEFT JOIN tenants t ON t.id=j.tenant_id SET j.status='failed',j.message='Requesting administrator or tenant is no longer active',j.finished_at=UTC_TIMESTAMP(3) WHERE j.status='queued' AND (u.id IS NULL OR u.status<>'active' OR u.role<>'super_admin' OR t.id IS NULL OR t.status<>'active')");
   const job=(await db.query("SELECT j.* FROM didww_provision_jobs j JOIN users u ON u.id=j.actor_id AND u.tenant_id=j.tenant_id JOIN tenants t ON t.id=j.tenant_id WHERE j.status='queued' AND u.status='active' AND u.role='super_admin' AND t.status='active' ORDER BY j.created_at LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
   if(!job){await db.query('COMMIT');console.log('{}');}
   else{
    const key=masterKey();if(!key)throw Error('Encryption key unavailable');
    const config=unseal(job.ciphertext,key,job.tenant_id,'didww_job');
    const credentials=await providerCredentials(pool,job.tenant_id,'didww');
    const apiKey=config.apiKey||(credentials&&!credentials.disabled&&credentials.environment==='production'?credentials.apiKey:!credentials&&process.env.DIDWW_TENANT_ID===job.tenant_id&&process.env.DIDWW_API_ENV==='production'?process.env.DIDWW_API_KEY:null);
    delete config.apiKey;
    await db.query("UPDATE didww_provision_jobs SET status='running',started_at=UTC_TIMESTAMP(3),message='Private worker checking prerequisites' WHERE id=$1",[job.id]);
    await db.query('COMMIT');console.log(JSON.stringify({id:job.id,mode:job.mode,config,apiKey}));
   }
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }else if(command==='finish'){
  const input=JSON.parse(await new Promise((resolve,reject)=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>{s+=v;if(s.length>2048)reject(Error('Too large'));});process.stdin.on('end',()=>resolve(s));}));
  if(!/^[a-f0-9-]{36}$/.test(input.id)||!['verified','installed','failed'].includes(input.status))throw Error('Invalid job result');
  const messages={verified:'Provider prerequisites verified; routing has not been installed',installed:'Routing installed and health checks passed; a billed call and two-way audio still require testing',failed:'Provisioning stopped. Review the private server log; provider approval, configuration or deployment validation may be pending'};
  await pool.query("UPDATE didww_provision_jobs SET status=$1,message=$2,finished_at=UTC_TIMESTAMP(3) WHERE id=$3 AND status='running'",[input.status,messages[input.status],input.id]);console.log('{"recorded":true}');
 }else throw Error('Unsupported private worker command');
}catch{console.error('Private DIDWW job operation failed');process.exitCode=1;}finally{await pool.end();}
