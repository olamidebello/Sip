import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {readFileSync} from 'node:fs';
import {masterKey,seal,providerCredentials} from './providerCredentials.js';
import {validatePolicy} from './outboundDids.js';
import {withFlowrouteLock} from './flowrouteTrunk.js';
export const didwwProvisionProvider='didww_ip_only';
export async function migrateDidwwProvisioning(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS didww_provision_jobs (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
 mode VARCHAR(16) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'queued',ciphertext BLOB NOT NULL,
 message VARCHAR(255) NOT NULL DEFAULT 'Waiting for private provisioning worker',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),started_at DATETIME(3) NULL,finished_at DATETIME(3) NULL,
 INDEX didww_jobs(status,created_at),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export function validateDidwwSetup(b,tenant){
 if(!b||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0||!isIP(b.publicIp||'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.trunkId||'')||typeof b.approvalReference!=='string'||!b.approvalReference.trim()||b.approvalReference.length>200||b.cliRightsConfirmed!==true||!Array.isArray(b.assignments)||!b.assignments.length||b.assignments.length>50)throw Error('Trunk UUID, public IP, approval reference, CLI rights and 1–50 DID assignments required');
 if(b.assignments.some(a=>!a||typeof a.evidence!=='string'||a.evidence.length>200))throw Error('Number rights references must be at most 200 characters');
 const config={tenantId:tenant,trunkId:b.trunkId,publicIp:b.publicIp,host:b.host,maxConcurrentCalls:b.maxConcurrentCalls,approvalReference:b.approvalReference.trim(),cliRightsConfirmed:true,assignments:b.assignments.map(a=>({userId:a.userId,number:a.number,provider:'didww',authorized:a.authorized,evidence:a.evidence}))};
 validatePolicy({version:1,tenants:{[tenant]:{assignments:config.assignments,didww:{host:b.host,maxConcurrentCalls:b.maxConcurrentCalls,ipOnlyApproved:true,allowedIpConfirmed:true,cliAuthorized:true}}}});
 if(b.apiKey!==undefined&&(typeof b.apiKey!=='string'||b.apiKey.length>256||/[\r\n\x00]/.test(b.apiKey)))throw Error('Valid production API key required');
 if(b.apiKey)config.apiKey=b.apiKey;
 return config;
}
function workerState(){try{const s=JSON.parse(readFileSync('/var/lib/olamide/service-inventory/didww-worker.json','utf8'));return {available:Date.now()-Number(s.epoch)*1000<120,checkedAt:s.epoch};}catch{return {available:false};}}
export async function handleDidwwProvisioning({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET'){
  const config=await providerCredentials(pool,user.tenant_id,didwwProvisionProvider);
  const revision=(await pool.query('SELECT revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2',[user.tenant_id,didwwProvisionProvider])).rows[0]?.revision||0;
  const jobs=(await pool.query('SELECT id,mode,status,message,created_at,started_at,finished_at FROM didww_provision_jobs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 10',[user.tenant_id])).rows;
  const users=(await pool.query("SELECT id,email FROM users WHERE tenant_id=$1 AND status='active' ORDER BY email LIMIT 1000",[user.tenant_id])).rows;
  const {apiKey,...visible}=config&&!config.disabled?config:{};
  return send(res,200,{config:config&&!config.disabled?visible:null,apiKeyConfigured:!!apiKey,revision:Number(revision),jobs,users,worker:workerState()});
 }
 if(req.method==='PUT'&&path==='/api/admin/carriers/didww/ip-only')return withFlowrouteLock(pool,user.tenant_id,async()=>{
  const key=masterKey();if(!key)return send(res,409,{error:'Provider encryption key is not configured'});
  const b=await readJson(req);let config;try{config=validateDidwwSetup(b,user.tenant_id);}catch(e){return send(res,400,{error:e.message});}
  const previous=await providerCredentials(pool,user.tenant_id,didwwProvisionProvider);
  if(!config.apiKey&&previous&&!previous.disabled&&previous.apiKey)config.apiKey=previous.apiKey;
  for(const a of config.assignments){if(!(await pool.query("SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[a.userId,user.tenant_id])).rowCount)return send(res,400,{error:'Every assigned user must be active in this tenant'});}
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   const pending=await db.query("SELECT 1 FROM didww_provision_jobs WHERE tenant_id=$1 AND status IN ('queued','running')",[user.tenant_id]);
   if(pending.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Wait for the current provisioning job to finish'});}
   const old=(await db.query('SELECT revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2 FOR UPDATE',[user.tenant_id,didwwProvisionProvider])).rows[0];
   if(Number(old?.revision||0)!==b.expectedRevision){await db.query('ROLLBACK');return send(res,409,{error:'Configuration changed; refresh before saving'});}
   await db.query('INSERT INTO provider_api_credentials(tenant_id,provider,ciphertext,revision,updated_by) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),revision=VALUES(revision),enabled=TRUE,updated_by=VALUES(updated_by)',[user.tenant_id,didwwProvisionProvider,seal(config,key,user.tenant_id,didwwProvisionProvider),b.expectedRevision+1,user.id]);
   await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'didww_ip_only_settings_saved']);
   await db.query('COMMIT');return send(res,200,{saved:true,revision:b.expectedRevision+1});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 });
 if(req.method==='POST'&&path==='/api/admin/carriers/didww/ip-only/provision')return withFlowrouteLock(pool,user.tenant_id,async()=>{
  const b=await readJson(req);if(!['verify','provision'].includes(b.mode))return send(res,400,{error:'Choose verify or provision'});
  if(!workerState().available)return send(res,409,{error:'Install or restart the private DIDWW GUI worker on the server first'});
  const config=await providerCredentials(pool,user.tenant_id,didwwProvisionProvider);if(!config||config.disabled)return send(res,409,{error:'Save DIDWW IP-only settings first'});
  const credential=await providerCredentials(pool,user.tenant_id,'didww');
  if(!config.apiKey&&(credential?.disabled||credential&&credential.environment!=='production'||!credential&&!process.env.DIDWW_API_KEY||!credential&&(process.env.DIDWW_API_ENV!=='production'||process.env.DIDWW_TENANT_ID!==user.tenant_id)))return send(res,409,{error:'Configure production DIDWW API credentials in Carrier credentials'});
  if((await pool.query("SELECT 1 FROM didww_provision_jobs WHERE tenant_id=$1 AND status IN ('queued','running')",[user.tenant_id])).rowCount)return send(res,409,{error:'A DIDWW job is already pending'});
  const revision=Number((await pool.query('SELECT revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2',[user.tenant_id,didwwProvisionProvider])).rows[0]?.revision);
  if(b.expectedRevision!==revision)return send(res,409,{error:'Configuration changed; refresh before provisioning'});
  const id=randomUUID(),key=masterKey();if(!key)return send(res,409,{error:'Provider encryption key unavailable'});
  await pool.query('INSERT INTO didww_provision_jobs(id,tenant_id,actor_id,mode,ciphertext) VALUES($1,$2,$3,$4,$5)',[id,user.tenant_id,user.id,b.mode,seal(config,key,user.tenant_id,'didww_job')]);
  await pool.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'didww_ip_only_'+b.mode+'_queued']);
  return send(res,202,{id,status:'queued'});
 });
 return send(res,405,{error:'Unsupported DIDWW provisioning action'});
}
