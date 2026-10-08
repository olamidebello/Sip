import { randomUUID } from 'node:crypto';
import { isAdmin } from './tenancy.js';
import { availableNumbers } from './providers.js';

const providers=['flowroute','didww'];
const slug=/^[a-z][a-z0-9-]{1,15}$/;
const adapterReady=()=>!!(process.env.CARRIER_PROVISION_URL?.startsWith('https://')&&process.env.CARRIER_PROVISION_TOKEN);
async function catalog(pool,tenant){
  const rows=await pool.query('SELECT provider,display_name,enabled FROM carrier_provider_catalog WHERE tenant_id=$1 ORDER BY display_name',[tenant]);
  return rows.rows;
}

export async function migrateCarrierProviders(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_provider_catalog (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    display_name VARCHAR(80) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_provider_profiles (
    tenant_id CHAR(36) NOT NULL, provider VARCHAR(16) NOT NULL,
    trunk_id CHAR(36) NULL, max_concurrent_calls INT UNSIGNED NOT NULL DEFAULT 0,
    routing_mode VARCHAR(16) NOT NULL DEFAULT 'disabled', status VARCHAR(24) NOT NULL DEFAULT 'draft',
    last_error VARCHAR(255) NULL, provisioned_at DATETIME(3) NULL,
    updated_by CHAR(36) NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(trunk_id) REFERENCES pbx_trunks(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_provider_verifications (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    verified_at DATETIME(3) NOT NULL,verified_by CHAR(36) NOT NULL,
    PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(verified_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}

export async function carrierActive(pool,tenant,provider){
  const found=await pool.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2 AND status='active' AND routing_mode<>'disabled'",[tenant,provider]);
  return !!found.rowCount;
}

export async function handleCarrierProviders({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});
  const configured=provider=>provider==='flowroute'?!!(process.env.FLOWROUTE_ACCESS_KEY&&process.env.FLOWROUTE_SECRET_KEY):
    provider==='didww' ? !!(process.env.DIDWW_API_KEY&&process.env.DIDWW_ACCOUNT_CURRENCY==='USD'&&['sandbox','production'].includes(process.env.DIDWW_API_ENV)) : adapterReady();
  if(path==='/api/admin/carriers' && req.method==='GET'){
    const [rows,custom,verified]=await Promise.all([
      pool.query('SELECT provider,trunk_id,max_concurrent_calls,routing_mode,status,last_error,provisioned_at,updated_at FROM carrier_provider_profiles WHERE tenant_id=$1 ORDER BY provider',[user.tenant_id]),
      catalog(pool,user.tenant_id),
      pool.query('SELECT provider,verified_at FROM carrier_provider_verifications WHERE tenant_id=$1',[user.tenant_id])]);
    return send(res,200,{providers:[...providers.map(provider=>({provider,displayName:provider==='didww'?'DIDWW':'Flowroute',enabled:true})),...custom].map(entry=>({provider:entry.provider,displayName:entry.displayName||entry.display_name,
      enabled:!!entry.enabled,credentialsConfigured:providers.includes(entry.provider)?configured(entry.provider):false,
      adapterVerified:!!verified.rows.find(row=>row.provider===entry.provider),
      ...(rows.rows.find(row=>row.provider===entry.provider)||{status:'not_configured',routing_mode:'disabled',max_concurrent_calls:0})})),
      adapterConfigured:adapterReady()});
  }
  if(path==='/api/admin/carriers/catalog' && req.method==='POST'){
    if(user.role!=='super_admin') return send(res,403,{error:'Super administrator required'});
    const {provider,displayName}=await readJson(req);
    if(!slug.test(provider||'')||providers.includes(provider)||typeof displayName!=='string'||
      !displayName.trim()||displayName.length>80) return send(res,400,{error:'Valid carrier slug and name required'});
    try{await pool.query('INSERT INTO carrier_provider_catalog(tenant_id,provider,display_name,created_by) VALUES($1,$2,$3,$4)',
      [user.tenant_id,provider,displayName.trim(),user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Carrier already registered'});throw error;}
    return send(res,201,{provider,displayName:displayName.trim(),enabled:true});
  }
  const customMatch=/^\/api\/admin\/carriers\/catalog\/([a-z][a-z0-9-]{1,15})$/.exec(path);
  if(customMatch && req.method==='PUT'){
    if(user.role!=='super_admin') return send(res,403,{error:'Super administrator required'});
    const {enabled}=await readJson(req);
    if(typeof enabled!=='boolean')return send(res,400,{error:'Boolean enabled required'});
    if(!enabled){
      const active=await pool.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2 AND status='active'",
        [user.tenant_id,customMatch[1]]);
      if(active.rowCount)return send(res,409,{error:'Deactivate this carrier with the switch adapter first'});
    }
    const result=await pool.query('UPDATE carrier_provider_catalog SET enabled=$1 WHERE tenant_id=$2 AND provider=$3',
      [enabled,user.tenant_id,customMatch[1]]);
    if(!result.rowCount)return send(res,404,{error:'Carrier unavailable'});
    if(!enabled) await pool.query("UPDATE carrier_provider_profiles SET status='draft',provisioned_at=NULL WHERE tenant_id=$1 AND provider=$2",
      [user.tenant_id,customMatch[1]]);
    if(!enabled) await pool.query('DELETE FROM carrier_provider_verifications WHERE tenant_id=$1 AND provider=$2',
      [user.tenant_id,customMatch[1]]);
    return send(res,200,{provider:customMatch[1],enabled});
  }
  if(path==='/api/admin/carriers/flowroute/auto-provision' && req.method==='POST'){
    if(user.role!=='super_admin') return send(res,403,{error:'Super administrator required'});
    const {pop,maxConcurrentCalls,routingMode}=await readJson(req);
    const hosts={'US-East-VA':'us-east-va.sip.flowroute.com','US-West-OR':'us-west-or.sip.flowroute.com'};
    if(!Object.hasOwn(hosts,pop)||!Number.isSafeInteger(maxConcurrentCalls)||
      maxConcurrentCalls<1||maxConcurrentCalls>100000||
      !['manual','least_cost','priority'].includes(routingMode))
      return send(res,400,{error:'Valid Flowroute PoP, capacity and routing mode required'});
    const active=await pool.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider='flowroute' AND status='active'",
      [user.tenant_id]);
    if(active.rowCount)return send(res,409,{error:'Deactivate the current Flowroute trunk before changing its PoP'});
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const name='Flowroute '+pop,host=hosts[pop];
      const prior=await db.query('SELECT id FROM pbx_trunks WHERE tenant_id=$1 AND name=$2 FOR UPDATE',[user.tenant_id,name]);
      const trunkId=prior.rows[0]?.id||randomUUID();
      if(prior.rowCount)
        await db.query('UPDATE pbx_trunks SET host=$1,port=5060,transport=\'udp\',priority=100,enabled=FALSE WHERE id=$2 AND tenant_id=$3',[host,trunkId,user.tenant_id]);
      else
        await db.query('INSERT INTO pbx_trunks(id,tenant_id,name,host,port,transport,priority,enabled) VALUES($1,$2,$3,$4,5060,\'udp\',100,FALSE)',[trunkId,user.tenant_id,name,host]);
      await db.query("INSERT INTO carrier_provider_profiles(tenant_id,provider,trunk_id,max_concurrent_calls,routing_mode,status,updated_by) VALUES($1,'flowroute',$2,$3,$4,'draft',$5) ON DUPLICATE KEY UPDATE trunk_id=VALUES(trunk_id),max_concurrent_calls=VALUES(max_concurrent_calls),routing_mode=VALUES(routing_mode),status='draft',provisioned_at=NULL,last_error=NULL,updated_by=VALUES(updated_by)",
        [user.tenant_id,trunkId,maxConcurrentCalls,routingMode,user.id]);
      await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'carrier_profile_flowroute_auto_setup')",
        [randomUUID(),user.tenant_id,user.id,trunkId]);
      await db.query('COMMIT');
      return send(res,200,{provider:'flowroute',pop,trunkId,host,port:5060,status:'draft',
        nextAction:'/api/admin/carriers/flowroute/activate',
        note:'Trunk configuration staged. The SIP switch and Flowroute account route must be configured and verified before traffic is enabled.'});
    }catch(error){await db.query('ROLLBACK');throw error;}
    finally{db.release();}
  }
  const match=/^\/api\/admin\/carriers\/([a-z][a-z0-9-]{1,15})(?:\/(verify|activate|deactivate))?$/.exec(path);
  if(!match) return send(res,404,{error:'Carrier route unavailable'});
  const [,provider,action]=match;
  if(!providers.includes(provider)){
    const found=await pool.query('SELECT enabled FROM carrier_provider_catalog WHERE tenant_id=$1 AND provider=$2',[user.tenant_id,provider]);
    if(!found.rowCount)return send(res,404,{error:'Carrier unavailable'});
    if(!found.rows[0].enabled)return send(res,409,{error:'Carrier disabled'});
  }
  if(!action && req.method==='PUT'){
    const {trunkId,maxConcurrentCalls,routingMode}=await readJson(req);
    if(typeof trunkId!=='string'||!/^[0-9a-f-]{36}$/i.test(trunkId)||
      !Number.isSafeInteger(maxConcurrentCalls)||maxConcurrentCalls<1||maxConcurrentCalls>100000||
      !['manual','least_cost','priority'].includes(routingMode))
      return send(res,400,{error:'Valid trunk, capacity and routing mode required'});
    const trunk=await pool.query('SELECT id FROM pbx_trunks WHERE id=$1 AND tenant_id=$2',[trunkId,user.tenant_id]);
    if(!trunk.rowCount) return send(res,404,{error:'Tenant trunk unavailable'});
    const active=await pool.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2 AND status='active'",
      [user.tenant_id,provider]);
    if(active.rowCount)return send(res,409,{error:'Deactivate this carrier before editing its profile'});
    await pool.query("INSERT INTO carrier_provider_profiles(tenant_id,provider,trunk_id,max_concurrent_calls,routing_mode,status,updated_by) VALUES($1,$2,$3,$4,$5,'draft',$6) ON DUPLICATE KEY UPDATE trunk_id=VALUES(trunk_id),max_concurrent_calls=VALUES(max_concurrent_calls),routing_mode=VALUES(routing_mode),status='draft',provisioned_at=NULL,last_error=NULL,updated_by=VALUES(updated_by)",
      [user.tenant_id,provider,trunkId,maxConcurrentCalls,routingMode,user.id]);
    if(!providers.includes(provider))await pool.query('DELETE FROM carrier_provider_verifications WHERE tenant_id=$1 AND provider=$2',
      [user.tenant_id,provider]);
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)",[randomUUID(),user.tenant_id,user.id,`carrier_profile_${provider}`]);
    return send(res,200,{provider,status:'draft'});
  }
  if(action==='verify' && req.method==='POST'){
    if(!configured(provider)) return send(res,409,{error:providers.includes(provider)?'Provider credentials missing from private server configuration':'HTTPS provisioning adapter required'});
    if(!providers.includes(provider)){
      if(!adapterReady())return send(res,409,{error:'HTTPS provisioning adapter required'});
      const profile=await pool.query('SELECT trunk_id FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2',[user.tenant_id,provider]);
      if(!profile.rowCount)return send(res,409,{error:'Save a carrier profile first'});
      try{
        const response=await fetch(process.env.CARRIER_PROVISION_URL,{method:'POST',signal:AbortSignal.timeout(10000),
          headers:{Authorization:`Bearer ${process.env.CARRIER_PROVISION_TOKEN}`,'Content-Type':'application/json'},
          body:JSON.stringify({action:'verify',tenantId:user.tenant_id,provider,trunkId:profile.rows[0].trunk_id})});
        if(!response.ok||(await response.json()).status!=='verified')throw Error('Verification rejected');
        await pool.query('INSERT INTO carrier_provider_verifications(tenant_id,provider,verified_at,verified_by) VALUES($1,$2,UTC_TIMESTAMP(3),$3) ON DUPLICATE KEY UPDATE verified_at=VALUES(verified_at),verified_by=VALUES(verified_by)',
          [user.tenant_id,provider,user.id]);
        return send(res,200,{provider,adapterVerified:true,note:'Provisioning adapter verified the carrier configuration.'});
      }catch{return send(res,502,{error:'Carrier adapter verification failed'});}
    }
    try {const inventory=await availableNumbers(provider);
      return send(res,200,{provider,credentialsValid:true,sampleCount:inventory.length,
        note:'Inventory API responded. This does not authorize or activate a SIP trunk.'});
    }catch(error){return send(res,502,{error:'Provider inventory check failed'});}
  }
  if(action==='activate' && req.method==='POST'){
    const endpoint=process.env.CARRIER_PROVISION_URL,token=process.env.CARRIER_PROVISION_TOKEN;
    if(!configured(provider)||!adapterReady())
      return send(res,409,{error:'Carrier credentials and HTTPS provisioning adapter required'});
    const found=await pool.query("SELECT trunk_id,max_concurrent_calls,routing_mode,status FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2",[user.tenant_id,provider]);
    const profile=found.rows[0];
    if(!profile?.trunk_id||profile.routing_mode==='disabled') return send(res,409,{error:'Configure a tenant trunk first'});
    if(!providers.includes(provider)){
      const verified=await pool.query('SELECT 1 FROM carrier_provider_verifications WHERE tenant_id=$1 AND provider=$2',
        [user.tenant_id,provider]);
      if(!verified.rowCount)return send(res,409,{error:'Verify this carrier adapter before activation'});
    }
    try {const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':`${user.tenant_id}:${provider}`},
      body:JSON.stringify({action:'activate',tenantId:user.tenant_id,provider,trunkId:profile.trunk_id,
        maxConcurrentCalls:profile.max_concurrent_calls,routingMode:profile.routing_mode})});
      if(!response.ok||(await response.json()).status!=='active') throw new Error('Adapter rejected provisioning');
      await pool.query("UPDATE carrier_provider_profiles SET status='active',last_error=NULL,provisioned_at=UTC_TIMESTAMP(3),updated_by=$1 WHERE tenant_id=$2 AND provider=$3",[user.id,user.tenant_id,provider]);
      return send(res,200,{provider,status:'active'});
    }catch(error){
      await pool.query("UPDATE carrier_provider_profiles SET status='error',last_error='Provisioning adapter did not acknowledge activation',updated_by=$1 WHERE tenant_id=$2 AND provider=$3",[user.id,user.tenant_id,provider]);
      return send(res,502,{error:'Carrier provisioning not acknowledged'});
    }
  }
  if(action==='deactivate' && req.method==='POST'){
    if(!adapterReady())return send(res,409,{error:'HTTPS provisioning adapter required'});
    const found=await pool.query('SELECT trunk_id,status FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2',
      [user.tenant_id,provider]);
    const profile=found.rows[0];
    if(!profile)return send(res,404,{error:'Carrier profile unavailable'});
    if(profile.status!=='active')return send(res,409,{error:'Carrier is not active'});
    try{
      const response=await fetch(process.env.CARRIER_PROVISION_URL,{method:'POST',signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${process.env.CARRIER_PROVISION_TOKEN}`,'Content-Type':'application/json',
          'Idempotency-Key':`${user.tenant_id}:${provider}:deactivate`},
        body:JSON.stringify({action:'deactivate',tenantId:user.tenant_id,provider,trunkId:profile.trunk_id})});
      if(!response.ok||(await response.json()).status!=='inactive')throw Error('Adapter rejected deactivation');
      await pool.query("UPDATE carrier_provider_profiles SET status='draft',provisioned_at=NULL,updated_by=$1 WHERE tenant_id=$2 AND provider=$3",
        [user.id,user.tenant_id,provider]);
      return send(res,200,{provider,status:'draft'});
    }catch{return send(res,502,{error:'Switch adapter did not acknowledge deactivation'});}
  }
  return send(res,405,{error:'Unsupported carrier action'});
}
