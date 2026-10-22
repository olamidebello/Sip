import {readFile,writeFile} from 'node:fs/promises';
import {createDatabase} from '/app/db.js';
import {hubSettings,saveHub} from '/app/twilioHub.js';
import {roleSettings,registerRoles} from '/app/twilioRoles.js';
import {provisionResources,client} from './twilioProvision.mjs';

const config=JSON.parse(await readFile('/provision/config.json','utf8'));
const db=createDatabase(process.env.MYSQL_URL);
const lock='twilio-provision-'+config.tenantId;
// Use one connection for advisory lock lifetime; release only after all remote operations finish.
let connection,held=false;
try{
 connection=await db.connect();
 held=Number((await connection.query('SELECT GET_LOCK($1,0) AS acquired',[lock])).rows[0]?.acquired)===1;
 if(!held)throw Error('Another Twilio provision is running for this tenant');
 const user=(await db.query("SELECT id,tenant_id,role FROM users WHERE tenant_id=$1 AND role='super_admin' AND status='active' ORDER BY id LIMIT 1",[config.tenantId])).rows[0];
 if(!user)throw Error('Active tenant super administrator required');
 const hub=await hubSettings(db,config.tenantId),roles=await roleSettings(db,config.tenantId);
 if(!hub?.enabled||!hub.credentials)throw Error('Save and enable Twilio credentials in the super admin GUI first');
 if(['trunk','otp','did','sms'].some(r=>roles[r]===false))throw Error('An existing Twilio role is disabled. Enable the requested roles in the GUI before provisioning');
 if(roles.trunkSid){const trunk=await client(hub.credentials)('trunking','/v1/Trunks/'+roles.trunkSid);if(trunk.domain_name!==config.domain)throw Error('Configured trunk has a different termination domain; supply its existing domain, no replacement was made');}
 const report=await provisionResources({db,config,credentials:hub.credentials,apply:config.apply===true});
 if(config.apply===true){
  // Do not silently overwrite a concurrent administrator edit, even after successful remote creation.
  await saveHub(db,user,{enabled:true,version:hub.version,verifyServiceSid:report.verifyServiceSid,messagingServiceSid:report.messagingServiceSid});
  if(roles.trunkSid&&roles.trunkSid!==report.trunkSid)throw Error('Existing configured trunk differs; remote resources retained, no local trunk replaced');
  if(roles.trunkSid!==report.trunkSid)await registerRoles(db,user,{...roles,trunkSid:report.trunkSid});
 }
 await writeFile('/provision/report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));
}catch(error){
 const report={live:false,mode:config.apply?'apply':'plan',error:error.message,remoteResourcesMayExist:config.apply===true,automaticRetry:false};
 await writeFile('/provision/report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.error(JSON.stringify(report));process.exitCode=1;
}finally{if(held)await connection.query('SELECT RELEASE_LOCK($1)',[lock]);connection?.release();await db.end();}
