// Credentials arrive over stdin, never argv or output. Run only in a private server container.
import {handleCarrierProviders} from './carrierProviders.js';
import {createDatabase} from './db.js';
import {saveFlowrouteTrunk,flowrouteTrunk} from './flowrouteTrunk.js';
const pool=createDatabase(process.env.MYSQL_URL);
try{
 let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>8192)throw Error('Input too large');}
 const b=JSON.parse(raw);const users=await pool.query("SELECT id,tenant_id,role FROM users WHERE role='super_admin' AND status='active'"+(b.tenantId?' AND tenant_id=$1':''),b.tenantId?[b.tenantId]:[]);
 if(users.rows.length!==1)throw Error('Select a tenant with exactly one active super administrator');
 const user=users.rows[0],old=await flowrouteTrunk(pool,user.tenant_id);
 if(old&&!b.replaceExisting){console.log('Existing super admin SIP settings preserved. Manage changes in the GUI.');}
 else{const r=await saveFlowrouteTrunk(pool,user,{...b.config,expectedRevision:old?.revision||0});if(r.code!==200)throw Error(r.body.error);console.log('Flowroute SIP settings encrypted and saved. Confirm allowed IP and caller ID in Super admin → Carrier credentials, then provision.');}
 const config=await flowrouteTrunk(pool,user.tenant_id);
 if(config?.callerId&&(config.authenticationMode!=='ip'||config.allowedIpConfirmed)){
   const result=await handleCarrierProviders({req:{method:'POST'},res:{},path:'/api/admin/carriers/flowroute/trunk/provision',user,pool,readJson:async()=>({}),send:(_r,code,body)=>({code,body})});
   console.log(result.code===200?'Default Flowroute gateway acknowledged by switch adapter.':'Configuration imported; gateway activation pending: '+result.body.error);
 }
}catch{console.error('Flowroute import stopped. Check supplied SIP settings, tenant selection, server encryption key and deactivated carrier state.');process.exitCode=1;}finally{await pool.end();}

