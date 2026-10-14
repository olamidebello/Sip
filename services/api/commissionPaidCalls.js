import {createDatabase} from './db.js';
import {flowrouteTrunk,saveFlowrouteTrunk,adapterTrunk} from './flowrouteTrunk.js';
import {commissionCarrier} from './adapterRegistry.js';
import {withFlowrouteLock} from './flowrouteTrunk.js';
import {handleCarrierProviders} from './carrierProviders.js';
const pool=createDatabase(process.env.MYSQL_URL);
try{
 const admins=(await pool.query("SELECT DISTINCT u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role='super_admin' AND u.status='active' AND t.status='active'")).rows;
 if(admins.length!==1)throw Error('One active administrator tenant required for unattended commissioning');
 const tenant=admins[0].tenant_id;
 const user=(await pool.query("SELECT id,tenant_id,role FROM users WHERE tenant_id=$1 AND role='super_admin' AND status='active' ORDER BY id LIMIT 1",[tenant])).rows[0];
 let c=await flowrouteTrunk(pool,tenant);adapterTrunk(c);
 if(c.authenticationMode!=='ip')throw Error('IP authentication required');
 const nodes=(await pool.query("SELECT max_concurrent_calls FROM carrier_adapter_nodes WHERE tenant_id=$1 AND provider='flowroute' AND enabled=TRUE",[tenant])).rows;
 if(!nodes.length)throw Error('Enable a carrier adapter first');
 const capacity=Math.min(Number(c.maxConcurrentCalls),Math.max(...nodes.map(n=>Number(n.max_concurrent_calls))));
 const active=(await pool.query("SELECT status FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider='flowroute'",[tenant])).rows[0]?.status==='active';
 if(active&&capacity!==Number(c.maxConcurrentCalls))throw Error('Deactivate the active carrier before aligning saved capacity');
 if(!active&&capacity!==Number(c.maxConcurrentCalls)){
  const result=await saveFlowrouteTrunk(pool,user,{expectedRevision:c.revision,authenticationMode:c.authenticationMode,pop:c.pop,sipUsername:c.sipUsername,sipPassword:'',techPrefix:c.techPrefix,publicIp:c.publicIp,allowedIpConfirmed:c.allowedIpConfirmed,callerId:c.callerId,maxConcurrentCalls:capacity});
  if(result.code!==200)throw Error(result.body.error);
 }
 if(active){
  await withFlowrouteLock(pool,tenant,()=>commissionCarrier(pool,user,'flowroute','activate',{maxConcurrentCalls:capacity,routingMode:'priority'}));
 }
 if(!active){
  const r=await handleCarrierProviders({req:{method:'POST'},res:{},path:'/api/admin/carriers/flowroute/trunk/provision',user,pool,readJson:async()=>({}),send:(_r,code,body)=>({code,body})});
  if(r.code!==200)throw Error(r.body.error);
 }
 console.log('Flowroute IP gateway commissioned within saved adapter capacity. Call authorization still requires rate deck, subscription and USD credit.');
}catch(e){console.error(e.code?'Commissioning stopped: '+e.code:'Commissioning stopped: '+e.message);process.exitCode=1;}
finally{await pool.end();}
