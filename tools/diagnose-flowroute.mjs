// Health checks only. Never outputs credentials, adapter URLs or raw errors.
import {createDatabase} from '/app/db.js';
import {adapterTargetsFor,invokeAdapter} from '/app/adapterRegistry.js';
import {flowrouteTrunk} from '/app/flowrouteTrunk.js';
const db=createDatabase(process.env.MYSQL_URL);
const emit=(key,value)=>console.log('SIP_FLOWROUTE_CHECK '+key+'='+value);
try{
 const profiles=(await db.query("SELECT tenant_id,status,max_concurrent_calls FROM carrier_provider_profiles WHERE provider='flowroute'")).rows;
 emit('profiles',profiles.length);
 for(const p of profiles){
  emit('state',['active','draft','error','inactive'].includes(p.status)?p.status:'unknown');
  emit('requested_capacity',Number(p.max_concurrent_calls)||0);
  const config=await flowrouteTrunk(db,p.tenant_id);emit('sip_configured',!!config);emit('password_configured',!!config?.sipPassword);
  const targets=await adapterTargetsFor(db,p.tenant_id);
  const nodes=(await db.query("SELECT id,target_key,enabled,max_concurrent_calls FROM carrier_adapter_nodes WHERE tenant_id=$1 AND provider='flowroute' ORDER BY priority,id",[p.tenant_id])).rows;
  emit('registered_nodes',nodes.length);
  const checks=nodes.length?nodes:targets.legacy?[{id:'legacy',target_key:'legacy',enabled:true,max_concurrent_calls:0}]:[];
  for(const node of checks){
   emit('node_enabled',!!node.enabled);emit('node_capacity',Number(node.max_concurrent_calls)||0);emit('target_configured',!!targets[node.target_key]);
   try{const r=await invokeAdapter(node,'health',{tenantId:p.tenant_id,provider:'flowroute',adapterId:node.id},db);
    emit('health','healthy');emit('routing_commissioned',r.routingCommissioned===true?'true':r.routingCommissioned===false?'false':'unspecified');
   }catch(e){
    const code=e.cause?.code||e.code;
    emit('health',e.name==='TimeoutError'||e.name==='AbortError'?'timeout':['ECONNREFUSED','ENOTFOUND','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)?code:e.message==='Adapter target is not configured'?'target_missing':e.message==='Adapter request failed'?'http_rejected':e.message==='Adapter did not acknowledge health'?'invalid_acknowledgment':'failed');
   }
  }
 }
}catch{emit('diagnostic','failed');process.exitCode=1;}finally{await db.end();}
