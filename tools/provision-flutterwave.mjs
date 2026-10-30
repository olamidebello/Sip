// Run inside the API container: node --input-type=module < provision-flutterwave.mjs
import {randomBytes,randomUUID} from 'node:crypto';
import {createDatabase} from './db.js';
import {seal,unseal} from './providerCredentials.js';
const key=name=>{
 const value=process.env[name];
 if(!/^[0-9a-f]{64}$/i.test(value||''))throw Error(name+' must already be configured on the API');
 return Buffer.from(value,'hex');
};
const pool=createDatabase(process.env.MYSQL_URL);
let db,locked=false;
try{
 const providerKey=key('PROVIDER_CREDENTIAL_KEY'),paymentKey=key('PAYMENT_CONFIG_KEY');
 db=await pool.connect();
 locked=Number((await db.query("SELECT GET_LOCK('flutterwave_auto_provision',10) AS acquired")).rows[0]?.acquired)===1;
 if(!locked)throw Error('Another Flutterwave provisioning is running');
 await db.query('START TRANSACTION');
 const candidates=(await db.query("SELECT u.id,u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role='super_admin' AND u.status='active' AND t.status='active' ORDER BY u.id")).rows;
 const tenants=[...new Set(candidates.map(u=>u.tenant_id))];
 const tenant=process.env.FLUTTERWAVE_TENANT_ID||(tenants.length===1?tenants[0]:null);
 const actor=candidates.find(u=>u.tenant_id===tenant);
 if(!actor)throw Error('Cannot uniquely identify tenant; set FLUTTERWAVE_TENANT_ID explicitly');
 const provider=(await db.query("SELECT ciphertext,enabled,revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider='flutterwave' FOR UPDATE",[tenant])).rows[0];
 const gateway=(await db.query("SELECT ciphertext,enabled,environment FROM store_gateways WHERE tenant_id=$1 AND provider='flutterwave' FOR UPDATE",[tenant])).rows[0];
 if(provider&&!provider.enabled||gateway&&!gateway.enabled)throw Error('Flutterwave is disabled; enable it explicitly before provisioning');
 const wallet=provider?unseal(provider.ciphertext,providerKey,tenant,'flutterwave'):{};
 const store=gateway?unseal(gateway.ciphertext,paymentKey,tenant,'flutterwave'):{};
 const apiKey=wallet.secretKey||store.secretKey||process.env.FLUTTERWAVE_SECRET_KEY;
 if(!apiKey)throw Error('Save a Flutterwave test API key in the app before provisioning');
 if(wallet.secretKey&&store.secretKey&&wallet.secretKey!==store.secretKey)throw Error('Wallet and marketplace API keys differ; reconcile merchant settings first');
 // This setup targets the test dashboard shown by the account owner.
 if(!/TEST/i.test(apiKey)||wallet.environment&&wallet.environment!=='sandbox'||gateway&&gateway.environment!=='test')
  throw Error('Automatic provisioning requires existing TEST credentials; production settings were not changed');
 const secret=typeof wallet.webhookSecret==='string'&&wallet.webhookSecret.length>=32?wallet.webhookSecret:randomBytes(32).toString('hex');
 const revision=Number(provider?.revision||0)+1;
 const credentials={...wallet,secretKey:apiKey,webhookSecret:secret,environment:'sandbox'};
 await db.query("INSERT INTO provider_api_credentials(tenant_id,provider,ciphertext,enabled,revision,updated_by) VALUES($1,'flutterwave',$2,TRUE,$3,$4) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),revision=VALUES(revision),updated_by=VALUES(updated_by)",[tenant,seal(credentials,providerKey,tenant,'flutterwave'),revision,actor.id]);
 await db.query("INSERT INTO store_gateways(tenant_id,provider,enabled,environment,ciphertext,updated_by) VALUES($1,'flutterwave',TRUE,'test',$2,$3) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),updated_by=VALUES(updated_by)",[tenant,seal({...store,secretKey:apiKey},paymentKey,tenant,'flutterwave'),actor.id]);
 await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,actor.id,'flutterwave_test_webhook_auto_provisioned']);
 await db.query('COMMIT');
 process.stdout.write(JSON.stringify({environment:'test',tenantId:tenant,url:'https://sip.dobhrap.com/api/webhooks/flutterwave/'+tenant,secretHash:secret,preferences:{json:true,retries:true,v3:true,resend:true,meta:true},dashboardSaved:false},null,2)+'\n');
}catch(error){
 if(db)await db.query('ROLLBACK').catch(()=>{});
 console.error('Flutterwave provisioning failed: '+error.message);process.exitCode=1;
}finally{
 if(locked)await db.query("SELECT RELEASE_LOCK('flutterwave_auto_provision')").catch(()=>{});
 db?.release();await pool.end();
}
