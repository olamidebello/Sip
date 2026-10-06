import { randomUUID } from 'node:crypto';
import { isAdmin } from './tenancy.js';
import { availableNumbers } from './providers.js';

const providers=['flowroute','didww'];

export async function migrateCarrierProviders(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_provider_profiles (
    tenant_id CHAR(36) NOT NULL, provider VARCHAR(16) NOT NULL,
    trunk_id CHAR(36) NULL, max_concurrent_calls INT UNSIGNED NOT NULL DEFAULT 0,
    routing_mode VARCHAR(16) NOT NULL DEFAULT 'disabled', status VARCHAR(24) NOT NULL DEFAULT 'draft',
    last_error VARCHAR(255) NULL, provisioned_at DATETIME(3) NULL,
    updated_by CHAR(36) NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(trunk_id) REFERENCES pbx_trunks(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}

export async function carrierActive(pool,tenant,provider){
  const found=await pool.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2 AND status='active' AND routing_mode<>'disabled'",[tenant,provider]);
  return !!found.rowCount;
}

export async function handleCarrierProviders({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});
  const configured=provider=>provider==='flowroute'?!!(process.env.FLOWROUTE_ACCESS_KEY&&process.env.FLOWROUTE_SECRET_KEY):
    !!(process.env.DIDWW_API_KEY&&process.env.DIDWW_ACCOUNT_CURRENCY==='USD');
  if(path==='/api/admin/carriers' && req.method==='GET'){
    const rows=await pool.query('SELECT provider,trunk_id,max_concurrent_calls,routing_mode,status,last_error,provisioned_at,updated_at FROM carrier_provider_profiles WHERE tenant_id=$1 ORDER BY provider',[user.tenant_id]);
    return send(res,200,{providers:providers.map(provider=>({provider,credentialsConfigured:configured(provider),
      ...(rows.rows.find(row=>row.provider===provider)||{status:'not_configured',routing_mode:'disabled',max_concurrent_calls:0})})),
      adapterConfigured:!!(process.env.CARRIER_PROVISION_URL&&process.env.CARRIER_PROVISION_TOKEN)});
  }
  const match=/^\/api\/admin\/carriers\/(flowroute|didww)(?:\/(verify|activate))?$/.exec(path);
  if(!match) return send(res,404,{error:'Carrier route unavailable'});
  const [,provider,action]=match;
  if(!action && req.method==='PUT'){
    const {trunkId,maxConcurrentCalls,routingMode}=await readJson(req);
    if(typeof trunkId!=='string'||!/^[0-9a-f-]{36}$/i.test(trunkId)||
      !Number.isSafeInteger(maxConcurrentCalls)||maxConcurrentCalls<1||maxConcurrentCalls>100000||
      !['manual','least_cost','priority'].includes(routingMode))
      return send(res,400,{error:'Valid trunk, capacity and routing mode required'});
    const trunk=await pool.query('SELECT id FROM pbx_trunks WHERE id=$1 AND tenant_id=$2',[trunkId,user.tenant_id]);
    if(!trunk.rowCount) return send(res,404,{error:'Tenant trunk unavailable'});
    await pool.query("INSERT INTO carrier_provider_profiles(tenant_id,provider,trunk_id,max_concurrent_calls,routing_mode,status,updated_by) VALUES($1,$2,$3,$4,$5,'draft',$6) ON DUPLICATE KEY UPDATE trunk_id=VALUES(trunk_id),max_concurrent_calls=VALUES(max_concurrent_calls),routing_mode=VALUES(routing_mode),status='draft',provisioned_at=NULL,last_error=NULL,updated_by=VALUES(updated_by)",
      [user.tenant_id,provider,trunkId,maxConcurrentCalls,routingMode,user.id]);
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)",[randomUUID(),user.tenant_id,user.id,`carrier_profile_${provider}`]);
    return send(res,200,{provider,status:'draft'});
  }
  if(action==='verify' && req.method==='POST'){
    if(!configured(provider)) return send(res,409,{error:'Provider credentials missing from private server configuration'});
    try {const inventory=await availableNumbers(provider);
      return send(res,200,{provider,credentialsValid:true,sampleCount:inventory.length,
        note:'Inventory API responded. This does not authorize or activate a SIP trunk.'});
    }catch(error){return send(res,502,{error:'Provider inventory check failed'});}
  }
  if(action==='activate' && req.method==='POST'){
    const endpoint=process.env.CARRIER_PROVISION_URL,token=process.env.CARRIER_PROVISION_TOKEN;
    if(!configured(provider)||!endpoint||!token||!endpoint.startsWith('https://'))
      return send(res,409,{error:'Carrier credentials and HTTPS provisioning adapter required'});
    const found=await pool.query("SELECT trunk_id,max_concurrent_calls,routing_mode,status FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2",[user.tenant_id,provider]);
    const profile=found.rows[0];
    if(!profile?.trunk_id||profile.routing_mode==='disabled') return send(res,409,{error:'Configure a tenant trunk first'});
    try {const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':`${user.tenant_id}:${provider}`},
      body:JSON.stringify({tenantId:user.tenant_id,provider,trunkId:profile.trunk_id,
        maxConcurrentCalls:profile.max_concurrent_calls,routingMode:profile.routing_mode})});
      if(!response.ok||(await response.json()).status!=='active') throw new Error('Adapter rejected provisioning');
      await pool.query("UPDATE carrier_provider_profiles SET status='active',last_error=NULL,provisioned_at=UTC_TIMESTAMP(3),updated_by=$1 WHERE tenant_id=$2 AND provider=$3",[user.id,user.tenant_id,provider]);
      return send(res,200,{provider,status:'active'});
    }catch(error){
      await pool.query("UPDATE carrier_provider_profiles SET status='error',last_error='Provisioning adapter did not acknowledge activation',updated_by=$1 WHERE tenant_id=$2 AND provider=$3",[user.id,user.tenant_id,provider]);
      return send(res,502,{error:'Carrier provisioning not acknowledged'});
    }
  }
  return send(res,405,{error:'Unsupported carrier action'});
}
