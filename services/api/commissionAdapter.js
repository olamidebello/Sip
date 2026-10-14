import {pathToFileURL} from 'node:url';
import {savedTargets} from './adapterTargets.js';
import {handleAdapterRegistry} from './adapterRegistry.js';

export async function commissionAdapter(pool, input) {
  const {tenantId, targetKey='primary', url, token='', provider='flowroute', name='Primary carrier adapter', region='primary', priority=100, maxConcurrentCalls=500}=input;
  if(!tenantId)throw Error('Explicit tenantId required');
  const users=await pool.query("SELECT u.id,u.tenant_id,u.role FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.tenant_id=$1 AND u.role='super_admin' AND u.status='active' AND t.status='active' ORDER BY u.id LIMIT 1",[tenantId]);
  const user=users.rows[0];if(!user)throw Error('Active tenant super administrator required');
  const call=async(method,path,body={})=>{
    const result=await handleAdapterRegistry({req:{method},res:{},path,user,pool,readJson:async()=>body,send:(_res,code,data)=>({code,data})});
    if(result.code>=400)throw Error(result.data.error||'Adapter commissioning failed');
    return result.data;
  };
  const old=(await savedTargets(pool,tenantId))[targetKey];
  // Preserve an unchanged target so reruns never rotate credentials or disturb assignments.
  if(!old||old.url!==new URL(url).href||(token&&token!==old.token))
    await call('PUT','/api/admin/carrier-adapters/targets/'+targetKey,{url,token,expectedRevision:old?.revision||0});
  const registry=await call('GET','/api/admin/carrier-adapters');
  let node=registry.nodes.find(n=>n.provider===provider&&n.name===name);
  if(node&&node.target_key!==targetKey)throw Error('Existing node uses a different target');
  if(!node)node=await call('POST','/api/admin/carrier-adapters',{provider,name,targetKey,region,priority,maxConcurrentCalls});
  await call('POST',`/api/admin/carrier-adapters/${node.id}/check`);
  await call('PUT',`/api/admin/carrier-adapters/${node.id}`,{enabled:true,priority,maxConcurrentCalls});
  return {id:node.id,targetKey,health:'healthy',enabled:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let pool;
  try{
    let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>16384)throw Error('Input too large');}
    const {createDatabase}=await import('./db.js');pool=createDatabase(process.env.MYSQL_URL);
    await commissionAdapter(pool,JSON.parse(raw));console.log('Private target saved; adapter health verified and node enabled.');
  }catch{console.error('Adapter commissioning failed; check private settings and adapter health. No secrets were printed.');process.exitCode=1;}
  finally{if(pool)await pool.end();}
}
