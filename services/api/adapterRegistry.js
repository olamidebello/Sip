import {randomUUID} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug=/^[a-z][a-z0-9-]{1,39}$/;

export function adapterTargets(){
  const raw=JSON.parse(process.env.CARRIER_ADAPTER_TARGETS_JSON||'{}');
  if(!raw||Array.isArray(raw)||typeof raw!=='object')throw Error('Invalid carrier adapter target map');
  for(const [key,target] of Object.entries(raw)){
    if(!slug.test(key)||!target||typeof target.url!=='string'||typeof target.token!=='string'||
      !target.url.startsWith('https://')||!URL.canParse(target.url)||target.token.length<32)
      throw Error('Invalid carrier adapter target');
    const url=new URL(target.url);
    if(url.username||url.password||url.hash)throw Error('Invalid carrier adapter target URL');
  }
  if(process.env.CARRIER_PROVISION_URL&&process.env.CARRIER_PROVISION_TOKEN){
    if(!process.env.CARRIER_PROVISION_URL.startsWith('https://'))throw Error('Invalid legacy carrier adapter URL');
    raw.legacy={url:process.env.CARRIER_PROVISION_URL,token:process.env.CARRIER_PROVISION_TOKEN};
  }
  return raw;
}

export async function migrateAdapterRegistry(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_adapter_nodes (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    name VARCHAR(80) NOT NULL,target_key VARCHAR(40) NOT NULL,region VARCHAR(40) NOT NULL,
    priority SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    max_concurrent_calls INT UNSIGNED NOT NULL DEFAULT 100,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,health VARCHAR(16) NOT NULL DEFAULT 'unknown',
    last_check_at DATETIME(3) NULL,last_error VARCHAR(255) NULL,
    created_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(created_by) REFERENCES users(id),
    UNIQUE KEY adapter_name(tenant_id,provider,name),
    INDEX adapter_selection(tenant_id,provider,enabled,health,priority)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_adapter_assignments (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,adapter_id CHAR(36) NOT NULL,
    assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    FOREIGN KEY(adapter_id) REFERENCES carrier_adapter_nodes(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_adapter_operations (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    adapter_id CHAR(36) NULL,action VARCHAR(16) NOT NULL,outcome VARCHAR(16) NOT NULL,
    actor_id CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id),
    INDEX adapter_recent(tenant_id,created_at)
  ) ENGINE=InnoDB`);
}

export async function adapterFor(pool,tenant,provider,capacity,assigned=false){
  const sql=assigned?
    'SELECT n.* FROM carrier_adapter_assignments a JOIN carrier_adapter_nodes n ON n.id=a.adapter_id WHERE a.tenant_id=$1 AND a.provider=$2 AND n.tenant_id=$3':
    "SELECT * FROM carrier_adapter_nodes WHERE tenant_id=$1 AND provider=$2 AND enabled=TRUE AND health='healthy' AND max_concurrent_calls >= $3 ORDER BY priority,id LIMIT 1";
  const found=await pool.query(sql,assigned?[tenant,provider,tenant]:[tenant,provider,capacity]);
  return found.rows[0]||null;
}

export async function invokeAdapter(node,action,body){
  const target=adapterTargets()[node.target_key];
  if(!target)throw Error('Adapter target is not configured');
  const response=await fetch(target.url,{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${target.token}`,'Content-Type':'application/json',
      'Idempotency-Key':`${body.tenantId}:${body.provider}:${action}:${body.trunkId||node.id}`},
    body:JSON.stringify({action,...body})});
  if(!response.ok)throw Error('Adapter request failed');
  const result=await response.json();
  if(result.status!==({health:'healthy',verify:'verified',activate:'active',deactivate:'inactive'}[action]))
    throw Error('Adapter did not acknowledge '+action);
  return result;
}

export async function recordAdapterOperation(pool,{tenant,provider,adapterId,action,outcome,actor}){
  await pool.query('INSERT INTO carrier_adapter_operations(id,tenant_id,provider,adapter_id,action,outcome,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(),tenant,provider,adapterId,action,outcome,actor]);
}

export async function commissionCarrier(pool,user,provider,action,details){
  const assigned=action==='deactivate';
  const node=await adapterFor(pool,user.tenant_id,provider,details.maxConcurrentCalls||0,assigned);
  if(node){
    if(action!=='deactivate'&&(!node.enabled||node.health!=='healthy'))throw Error('No healthy enabled adapter');
    try{
      await invokeAdapter(node,action,{tenantId:user.tenant_id,provider,adapterId:node.id,...details});
      await recordAdapterOperation(pool,{tenant:user.tenant_id,provider,adapterId:node.id,action,outcome:'success',actor:user.id});
      if(action==='activate')await pool.query('INSERT INTO carrier_adapter_assignments(tenant_id,provider,adapter_id) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE adapter_id=VALUES(adapter_id),assigned_at=UTC_TIMESTAMP(3)',
        [user.tenant_id,provider,node.id]);
      if(action==='deactivate')await pool.query('DELETE FROM carrier_adapter_assignments WHERE tenant_id=$1 AND provider=$2',
        [user.tenant_id,provider]);
      return {adapterId:node.id};
    }catch(error){
      await recordAdapterOperation(pool,{tenant:user.tenant_id,provider,adapterId:node.id,action,outcome:'failed',actor:user.id});
      throw error;
    }
  }
  const registered=await pool.query('SELECT 1 FROM carrier_adapter_nodes WHERE tenant_id=$1 AND provider=$2 LIMIT 1',
    [user.tenant_id,provider]);
  if(registered.rowCount&&action!=='deactivate')throw Error('No healthy adapter with sufficient capacity');
  const legacy=adapterTargets().legacy;
  if(!legacy)throw Error('Carrier adapter unavailable');
  const response=await fetch(legacy.url,{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${legacy.token}`,'Content-Type':'application/json',
      'Idempotency-Key':`${user.tenant_id}:${provider}:${action}`},
    body:JSON.stringify({action,tenantId:user.tenant_id,provider,...details})});
  if(!response.ok||(await response.json()).status!==({verify:'verified',activate:'active',deactivate:'inactive'}[action]))
    throw Error('Legacy adapter did not acknowledge '+action);
  return {adapterId:null};
}

export async function handleAdapterRegistry({req,res,path,user,pool,send,readJson}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  const tenant=user.tenant_id,targets=adapterTargets();
  if(path==='/api/admin/carrier-adapters'&&req.method==='GET'){
    const [nodes,assignments,operations]=await Promise.all([
      pool.query('SELECT id,provider,name,target_key,region,priority,max_concurrent_calls,enabled,health,last_check_at,last_error,updated_at FROM carrier_adapter_nodes WHERE tenant_id=$1 ORDER BY provider,priority,name',[tenant]),
      pool.query('SELECT provider,adapter_id,assigned_at FROM carrier_adapter_assignments WHERE tenant_id=$1',[tenant]),
      pool.query('SELECT id,provider,adapter_id,action,outcome,created_at FROM carrier_adapter_operations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',[tenant])]);
    return send(res,200,{targets:Object.keys(targets),nodes:nodes.rows,assignments:assignments.rows,operations:operations.rows});
  }
  if(path==='/api/admin/carrier-adapters'&&req.method==='POST'){
    const {provider,name,targetKey,region,priority,maxConcurrentCalls}=await readJson(req);
    if(!slug.test(provider||'')||provider.length>16||typeof name!=='string'||!name.trim()||name.length>80||
      !Object.hasOwn(targets,targetKey)||typeof region!=='string'||!region.trim()||region.length>40||
      !Number.isInteger(priority)||priority<1||priority>1000||
      !Number.isInteger(maxConcurrentCalls)||maxConcurrentCalls<1||maxConcurrentCalls>100000)
      return send(res,400,{error:'Valid carrier, target, region, priority and capacity required'});
    if(!['flowroute','didww'].includes(provider)){
      const found=await pool.query('SELECT 1 FROM carrier_provider_catalog WHERE tenant_id=$1 AND provider=$2 AND enabled=TRUE',[tenant,provider]);
      if(!found.rowCount)return send(res,404,{error:'Carrier unavailable'});
    }
    const id=randomUUID();
    try{await pool.query('INSERT INTO carrier_adapter_nodes(id,tenant_id,provider,name,target_key,region,priority,max_concurrent_calls,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id,tenant,provider,name.trim(),targetKey,region.trim(),priority,maxConcurrentCalls,user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Adapter name already exists'});throw error;}
    return send(res,201,{id,enabled:false,health:'unknown'});
  }
  const match=/^\/api\/admin\/carrier-adapters\/([0-9a-f-]{36})(?:\/(check))?$/.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Adapter unavailable'});
  const node=(await pool.query('SELECT * FROM carrier_adapter_nodes WHERE id=$1 AND tenant_id=$2',[match[1],tenant])).rows[0];
  if(!node)return send(res,404,{error:'Adapter unavailable'});
  if(match[2]==='check'&&req.method==='POST'){
    try{
      await invokeAdapter(node,'health',{tenantId:tenant,provider:node.provider,adapterId:node.id});
      await pool.query("UPDATE carrier_adapter_nodes SET health='healthy',last_error=NULL,last_check_at=UTC_TIMESTAMP(3) WHERE id=$1 AND tenant_id=$2",[node.id,tenant]);
      await recordAdapterOperation(pool,{tenant,provider:node.provider,adapterId:node.id,action:'health',outcome:'success',actor:user.id});
      return send(res,200,{health:'healthy'});
    }catch{
      await pool.query("UPDATE carrier_adapter_nodes SET health='unhealthy',last_error='Adapter health check failed',last_check_at=UTC_TIMESTAMP(3) WHERE id=$1 AND tenant_id=$2",[node.id,tenant]);
      await recordAdapterOperation(pool,{tenant,provider:node.provider,adapterId:node.id,action:'health',outcome:'failed',actor:user.id});
      return send(res,502,{error:'Adapter health check failed'});
    }
  }
  if(req.method==='PUT'&&!match[2]){
    const {enabled,priority,maxConcurrentCalls}=await readJson(req);
    if(typeof enabled!=='boolean'||!Number.isInteger(priority)||priority<1||priority>1000||
      !Number.isInteger(maxConcurrentCalls)||maxConcurrentCalls<1||maxConcurrentCalls>100000)
      return send(res,400,{error:'Valid enabled state, priority and capacity required'});
    const assignment=await pool.query('SELECT 1 FROM carrier_adapter_assignments a JOIN carrier_provider_profiles p ON p.tenant_id=a.tenant_id AND p.provider=a.provider WHERE a.adapter_id=$1 AND a.tenant_id=$2 AND p.status=\'active\'',[node.id,tenant]);
    if(assignment.rowCount&&(!enabled||maxConcurrentCalls<node.max_concurrent_calls))
      return send(res,409,{error:'Deactivate the assigned carrier before disabling or reducing capacity'});
    if(enabled&&node.health!=='healthy')return send(res,409,{error:'Run a successful health check before enabling'});
    await pool.query('UPDATE carrier_adapter_nodes SET enabled=$1,priority=$2,max_concurrent_calls=$3 WHERE id=$4 AND tenant_id=$5',
      [enabled,priority,maxConcurrentCalls,node.id,tenant]);
    return send(res,200,{id:node.id,enabled,priority,maxConcurrentCalls});
  }
  if(req.method==='DELETE'&&!match[2]){
    const assigned=await pool.query('SELECT 1 FROM carrier_adapter_assignments WHERE adapter_id=$1 AND tenant_id=$2',[node.id,tenant]);
    if(assigned.rowCount)return send(res,409,{error:'Remove carrier assignment before deleting adapter'});
    await pool.query('DELETE FROM carrier_adapter_nodes WHERE id=$1 AND tenant_id=$2',[node.id,tenant]);
    return send(res,200,{deleted:true});
  }
  return send(res,405,{error:'Unsupported adapter action'});
}
