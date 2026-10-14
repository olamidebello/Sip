import {createDatabase} from './db.js';
import {handleCarrierProviders} from './carrierProviders.js';
import {flowrouteTrunk} from './flowrouteTrunk.js';
import {availableNumbers,inventoryFailure} from './providers.js';
const pool=createDatabase(process.env.MYSQL_URL);
try {
  const admins=(await pool.query("SELECT DISTINCT u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role='super_admin' AND u.status='active' AND t.status='active'")).rows;
  if(admins.length!==1)throw Error('Exactly one administrator tenant required');
  const tenant=admins[0].tenant_id;
  const user=(await pool.query("SELECT id,tenant_id,role FROM users WHERE tenant_id=$1 AND role='super_admin' AND status='active' ORDER BY id LIMIT 1",[tenant])).rows[0];
  const profile=(await pool.query("SELECT p.status,p.max_concurrent_calls,t.host FROM carrier_provider_profiles p LEFT JOIN pbx_trunks t ON t.id=p.trunk_id AND t.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.provider='flowroute'",[tenant])).rows[0];
  if(profile?.status==='active')throw Error('Deactivate the active carrier before repair');
  const sip=await flowrouteTrunk(pool,tenant);
  const pop=sip?.pop||({'us-west-or.sip.flowroute.com':'US-West-OR','us-east-va.sip.flowroute.com':'US-East-VA'}[profile?.host]);
  if(!pop)throw Error('Save the Flowroute PoP in the gateway GUI before repair');
  const capacity=sip?.maxConcurrentCalls||Number(profile?.max_concurrent_calls)||500;
  const result=await handleCarrierProviders({req:{method:'POST'},res:{},path:'/api/admin/carriers/flowroute/auto-provision',user,pool,readJson:async()=>({pop,maxConcurrentCalls:capacity,routingMode:'priority'}),send:(_r,code,body)=>({code,body})});
  if(result.code!==200)throw Error(result.body.error);
  console.log('Flowroute profile repaired: '+pop+', 5060/UDP; traffic disabled.');
  try {await availableNumbers('flowroute',{pool,tenant});console.log('Inventory API verified.');}
  catch(e){console.log(inventoryFailure(e).error);process.exitCode=2;}
}catch(e){console.error(e.code?'Repair failed: '+e.code:'Repair stopped: '+e.message);process.exitCode=1;}
finally{await pool.end();}
